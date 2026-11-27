"""Train, register, or roll back a versioned menu-aware institutional model."""
import argparse
import json
import logging
import os
from collections import defaultdict
from datetime import date
from pathlib import Path
from uuid import uuid4

import joblib
import pandas as pd
from sqlalchemy import select, text, update

from ml.forecasting.evaluate import evaluate
from ml.forecasting.menu_features import FEATURE_SCHEMA, training_menu_features
from ml.forecasting.menu_predict import ARTIFACT_DIR, MODEL_NAME
from ml.forecasting.menu_train import METHODS, fit_menu_features, predict_menu_partition
from ml.forecasting.predict import beats_baselines

MIN_RECORDS = 300
MIN_DATES = 40
MIN_KITCHENS = 2
MIN_UNIT_EVALUATION = 20
MIN_IMPROVEMENT = 0.02
logger = logging.getLogger(__name__)


def extract_records(session):
    from app.models.food import FoodItem
    from app.models.forecast import Forecast, ForecastItem
    from app.models.meal_record import MealRecord, MealRecordItem
    from app.services.menu_history import sample_from_records

    statement = (
        select(MealRecord, MealRecordItem, Forecast, FoodItem, ForecastItem.id)
        .join(MealRecordItem, MealRecordItem.meal_record_id == MealRecord.id)
        .join(FoodItem, FoodItem.id == MealRecordItem.food_item_id)
        .outerjoin(Forecast, (Forecast.id == MealRecord.forecast_id)
                   & (Forecast.kitchen_id == MealRecord.kitchen_id)
                   & (Forecast.meal_date == MealRecord.meal_date)
                   & (Forecast.meal_type == MealRecord.meal_type))
        .outerjoin(ForecastItem, (ForecastItem.forecast_id == Forecast.id)
                   & (ForecastItem.food_item_id == FoodItem.id))
        .where(MealRecord.meal_date <= date.today(), MealRecord.actual_people > 0)
        .order_by(MealRecord.meal_date, MealRecord.id, MealRecordItem.id)
    )
    headers, grouped = {}, defaultdict(list)
    for meal, item, forecast, food, linked_dish in session.execute(statement):
        headers[meal.id] = (meal, forecast)
        grouped[meal.id].append((item, food, linked_dish))
    records = []
    for record_id, (meal, forecast) in headers.items():
        rows = grouped[record_id]
        sample = sample_from_records(meal, [(item, food) for item, food, _ in rows], forecast)
        context = {dish.key: dish for dish in sample.dishes}
        menu = json.dumps(list(context))
        menu_matches_forecast = forecast is not None and all(linked is not None for _, _, linked in rows)
        for item, food, _ in rows:
            dish = context.get(str(food.id))
            if dish is None:
                continue
            records.append({
                "kitchen_key": sample.kitchen, "meal_date": sample.date, "observation_id": item.id,
                "menu_id": record_id, "menu_mode": sample.mode, "menu_food_items": menu,
                "meal_type": sample.meal_type, "food_item_name": dish.key, "food_role": dish.role,
                "compatible_main_dishes": json.dumps(dish.compatible),
                "uptake_rate": dish.uptake, "preference_weight": dish.weight,
                "serving_unit": food.serving_unit.value, "default_servings_per_person": dish.portion,
                "expected_people": forecast.expected_people if menu_matches_forecast else None,
                "actual_people": meal.actual_people, "prepared_servings": item.prepared_servings,
                "leftover_servings": item.leftover_servings, "plate_waste_servings": item.plate_waste_servings,
                "shortage_occurred": item.shortage_occurred, "is_synthetic": False,
            })
    return pd.DataFrame(records)


def eligible(metadata):
    units = metadata["supported_quantity_units"]
    if not units or set(metadata["metrics"]) != {"validation", "test"}:
        return False
    for report in metadata["metrics"].values():
        if report["allocation_violations"]["ML"] != 0:
            return False
        metrics = report["units"]
        for unit in units:
            scores = metrics.get(unit, {})
            ml = scores.get("ML", {})
            if (ml.get("records", 0) < MIN_UNIT_EVALUATION
                    or not beats_baselines(metrics, unit, MIN_IMPROVEMENT)
                    or any(scores.get(method, {}).get("wape") is None
                           or ml["wape"] >= scores[method]["wape"] * (1 - MIN_IMPROVEMENT)
                           for method in METHODS)):
                return False
    return True


def _registered_bundle(version):
    path = Path(version.artifact_path).resolve()
    if not path.is_relative_to(ARTIFACT_DIR.resolve()):
        raise ValueError("Model artifact is outside the configured directory")
    bundle = joblib.load(path)
    metadata = bundle["metadata"]
    if (metadata["model_name"] != MODEL_NAME or metadata["version"] != version.version
            or metadata["is_synthetic"] is not False or metadata["feature_schema"] != FEATURE_SCHEMA
            or not eligible(metadata)):
        raise ValueError("Model artifact does not meet real-data approval requirements")
    return bundle


def compare_active(active, bundle, test):
    if active is None:
        return True, None
    try:
        incumbent = _registered_bundle(active)
        metadata = incumbent["metadata"]
        current = bundle["metadata"]
        fresh = test[test.meal_date > pd.Timestamp(metadata["evaluation_end_date"])]
        compatible = fresh.history_count.gt(0).groupby(fresh.menu_id).transform("any")
        supported = pd.Series(True, index=fresh.index)
        for column, values in metadata["supported_categories"].items():
            supported &= fresh[column].isin(set(values) & set(current["supported_categories"][column]))
        fresh = fresh[compatible & supported.groupby(fresh.menu_id).transform("all")]
        units = set(metadata["supported_quantity_units"])
        if (fresh.empty or not units.issubset(current["supported_quantity_units"])
                or not set(metadata["supported_menu_modes"]).issubset(current["supported_menu_modes"])):
            return False, None
        report = evaluate(fresh, {
            "candidate": predict_menu_partition(bundle["pipeline"], fresh)[0],
            "incumbent": predict_menu_partition(incumbent["pipeline"], fresh)[0],
        })
        improves = all(
            unit in report and report[unit]["candidate"]["records"] >= MIN_UNIT_EVALUATION
            and report[unit]["candidate"]["wape"] is not None
            and report[unit]["incumbent"]["wape"] is not None
            and report[unit]["candidate"]["wape"] < report[unit]["incumbent"]["wape"]
            for unit in units
        )
        return improves, report
    except Exception as exc:
        logger.warning("Incumbent evaluation unavailable (%s)", type(exc).__name__)
        return False, None


def _lock_registry(session):
    session.execute(text("SELECT pg_advisory_xact_lock(hashtext(:name))"), {"name": MODEL_NAME})


def _deactivate_current(session, model):
    session.execute(update(model).where(
        model.model_name == MODEL_NAME, model.is_active.is_(True),
    ).values(is_active=False))


def retrain(session_factory):
    with session_factory() as session:
        raw = extract_records(session)
    features = training_menu_features(raw)
    if (len(features) < MIN_RECORDS or features.meal_date.nunique() < MIN_DATES
            or features.kitchen_key.nunique() < MIN_KITCHENS):
        return "Insufficient compatible real data. Active model unchanged."

    from app.models.ml_model import ModelVersion

    version = uuid4().hex
    bundle, test, _ = fit_menu_features(
        features, source="Operational PostgreSQL menu feedback", synthetic=False, version=version,
    )
    metadata = bundle["metadata"]
    directory = ARTIFACT_DIR / "versions" / version
    directory.mkdir(parents=True, exist_ok=False)
    path = directory / "institutional_menu_demand_model.joblib"
    temporary = path.with_suffix(".tmp")
    joblib.dump(bundle, temporary)
    os.replace(temporary, path)
    (directory / "institutional_menu_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    with session_factory.begin() as session:
        _lock_registry(session)
        active = session.scalar(select(ModelVersion).where(
            ModelVersion.model_name == MODEL_NAME, ModelVersion.is_active.is_(True),
        ))
        qualifies = eligible(metadata)
        improves, comparison = compare_active(active, bundle, test) if qualifies else (False, None)
        activate = qualifies and improves
        if activate:
            _deactivate_current(session, ModelVersion)
        session.add(ModelVersion(
            model_name=MODEL_NAME, version=version, artifact_path=str(path),
            training_records=metadata["training_records"], evaluation_metrics=metadata["metrics"] | {
                "previously_activated": activate, "incumbent_comparison": comparison,
            },
            is_active=activate,
        ))
    return f"Candidate {version} registered as {'active' if activate else 'inactive'}."


def rollback(session_factory, version):
    from app.models.ml_model import ModelVersion

    with session_factory.begin() as session:
        _lock_registry(session)
        selected = session.scalar(select(ModelVersion).where(
            ModelVersion.model_name == MODEL_NAME, ModelVersion.version == version,
        ))
        if selected is None or not selected.evaluation_metrics.get("previously_activated"):
            raise ValueError("Rollback requires a previously activated menu-aware model version")
        _registered_bundle(selected)
        if not selected.is_active:
            _deactivate_current(session, ModelVersion)
            selected.is_active = True
    return f"Menu-aware model {version} is active."


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rollback", metavar="VERSION")
    args = parser.parse_args()
    from app.core.database import SessionLocal

    try:
        result = rollback(SessionLocal, args.rollback) if args.rollback else retrain(SessionLocal)
    except (ValueError, OSError) as exc:
        parser.error(str(exc))
    print(result)


if __name__ == "__main__":
    main()
