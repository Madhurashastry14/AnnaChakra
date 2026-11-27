"""Train a real-data candidate and register it without replacing a better active model."""
import argparse
import json
import os
from datetime import date
from pathlib import Path
from uuid import uuid4

import joblib
import pandas as pd
from sqlalchemy import select, text, update

from ml.forecasting.evaluate import evaluate
from ml.forecasting.predict import beats_baselines
from ml.forecasting.train import ARTIFACT_DIR, SCHEMAS, fit_experiment, institutional_records
from ml.forecasting.preprocessing import model_inputs

MODEL_NAME = "institutional_demand"
MIN_RECORDS = 300
MIN_DATES = 40
MIN_KITCHENS = 2
MIN_UNIT_EVALUATION = 20
MIN_IMPROVEMENT = 0.02


def extract_records(session):
    from app.models.food import FoodItem
    from app.models.forecast import Forecast, ForecastItem
    from app.models.meal_record import MealRecord, MealRecordItem

    statement = (
        select(MealRecord, MealRecordItem, Forecast, FoodItem)
        .join(MealRecordItem, MealRecordItem.meal_record_id == MealRecord.id)
        .join(FoodItem, FoodItem.id == MealRecordItem.food_item_id)
        .outerjoin(Forecast, (Forecast.id == MealRecord.forecast_id)
                   & (Forecast.kitchen_id == MealRecord.kitchen_id)
                   & (Forecast.meal_date == MealRecord.meal_date)
                   & (Forecast.meal_type == MealRecord.meal_type))
        .outerjoin(ForecastItem, (ForecastItem.forecast_id == Forecast.id)
                   & (ForecastItem.food_item_id == FoodItem.id))
        .add_columns(ForecastItem.id)
        .where(MealRecord.meal_date <= date.today(), MealRecord.actual_people > 0,
               MealRecordItem.shortage_occurred.is_(False))
        .order_by(MealRecord.meal_date, MealRecord.id, MealRecordItem.id)
    )
    return pd.DataFrame([{
        "kitchen_key": str(meal.kitchen_id), "meal_date": meal.meal_date, "observation_id": item.id,
        "meal_type": meal.meal_type.value, "food_item_name": str(food.id),
        "serving_unit": food.serving_unit.value,
        "default_servings_per_person": food.default_servings_per_person,
        "expected_people": forecast.expected_people if forecast and linked_dish is not None else None,
        "actual_people": meal.actual_people, "prepared_servings": item.prepared_servings,
        "leftover_servings": item.leftover_servings, "plate_waste_servings": item.plate_waste_servings,
        "shortage_occurred": item.shortage_occurred, "is_synthetic": False,
    } for meal, item, forecast, food, linked_dish in session.execute(statement)])


def eligible(metadata):
    return all(
        all(report.get(unit, {}).get("ML", {}).get("records", 0) >= MIN_UNIT_EVALUATION
            and beats_baselines(report, unit, MIN_IMPROVEMENT)
            for unit in metadata["supported_quantity_units"])
        for report in metadata["metrics"].values()
    ) and bool(metadata["supported_quantity_units"])


def beats_active(active, bundle, test):
    if active is None:
        return True
    path = Path(active.artifact_path).resolve()
    if not path.is_relative_to(ARTIFACT_DIR.resolve()):
        return False
    try:
        incumbent = joblib.load(path)
        metadata = incumbent["metadata"]
        if metadata["version"] != active.version or metadata["is_synthetic"] is not False:
            return False
        fresh = test[test.meal_date > pd.Timestamp(metadata["evaluation_end_date"])]
        common_units = set(metadata["supported_quantity_units"]) & set(
            bundle["metadata"]["supported_quantity_units"]
        )
        if not common_units or not set(metadata["supported_quantity_units"]).issubset(common_units):
            return False
        for column, supported in metadata["supported_categories"].items():
            fresh = fresh[fresh[column].isin(supported) & fresh[column].isin(
                bundle["metadata"]["supported_categories"][column]
            )]
        fresh = fresh[fresh.history_count > 0]
        if fresh.empty:
            return False
        categories, numbers = SCHEMAS["institutional"]
        features = model_inputs(fresh, categories, numbers)
        report = evaluate(fresh, {
            "candidate": bundle["pipeline"].predict(features).clip(min=0),
            "incumbent": incumbent["pipeline"].predict(features).clip(min=0),
        })
        return all(
            unit in report and report[unit]["candidate"]["records"] >= MIN_UNIT_EVALUATION
            and report[unit]["candidate"]["wape"] is not None
            and report[unit]["incumbent"]["wape"] is not None
            and report[unit]["candidate"]["wape"] < report[unit]["incumbent"]["wape"]
            for unit in common_units
        )
    except Exception:
        return False


def retrain(session_factory):
    with session_factory() as session:
        raw = extract_records(session)
    records = institutional_records(raw, keep_history_only=True) if not raw.empty else raw
    supervised = records.dropna(subset=["expected_people"]) if not records.empty else records
    if (len(supervised) < MIN_RECORDS or supervised.meal_date.nunique() < MIN_DATES
            or supervised.kitchen_key.nunique() < MIN_KITCHENS):
        return "Insufficient compatible real data. Active model unchanged."
    from app.models.ml_model import ModelVersion

    version = uuid4().hex
    bundle, test, _ = fit_experiment(
        "institutional", records, source="Operational PostgreSQL meal feedback",
        synthetic=False, version=version,
    )
    metadata = bundle["metadata"]
    directory = ARTIFACT_DIR / "versions" / version
    directory.mkdir(parents=True, exist_ok=False)
    path = directory / "institutional_demand_model.joblib"
    temporary = path.with_suffix(".tmp")
    joblib.dump(bundle, temporary)
    os.replace(temporary, path)
    (directory / "institutional_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    with session_factory.begin() as session:
        session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": MODEL_NAME})
        active = session.scalar(select(ModelVersion).where(
            ModelVersion.model_name == MODEL_NAME, ModelVersion.is_active.is_(True),
        ))
        activate = eligible(metadata) and beats_active(active, bundle, test)
        if activate:
            session.execute(update(ModelVersion).where(
                ModelVersion.model_name == MODEL_NAME, ModelVersion.is_active.is_(True),
            ).values(is_active=False))
        session.add(ModelVersion(
            model_name=MODEL_NAME, version=version, artifact_path=str(path),
            training_records=metadata["training_records"], evaluation_metrics=metadata["metrics"],
            is_active=activate,
        ))
    return f"Candidate {version} registered as {'active' if activate else 'inactive'}."


def main():
    argparse.ArgumentParser(description=__doc__).parse_args()
    from app.core.database import SessionLocal
    print(retrain(SessionLocal))


if __name__ == "__main__":
    main()
