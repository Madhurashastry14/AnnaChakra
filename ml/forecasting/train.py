"""Train independent local forecasting experiments with walk-forward evaluation."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from xgboost import XGBRegressor

from ml.forecasting.evaluate import comparison_plot, evaluate
from ml.forecasting.features import (
    CALENDAR, HISTORY, INSTITUTIONAL_KEYS, RESTAURANT_KEYS, chronological_split, temporal_features,
)
from ml.forecasting.generate_dataset import SYNTHETIC_DATA
from ml.forecasting.history import HISTORY_WINDOW_DAYS, blended_rate
from ml.forecasting.inspect_dataset import WORKBOOK
from ml.forecasting.preprocessing import build_preprocessor, model_inputs, restaurant_records

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "forecasting"
SCHEMAS = {
    "restaurant": (
        RESTAURANT_KEYS + ["cuisine", "holiday"],
        CALENDAR + HISTORY,
    ),
    "institutional": (
        INSTITUTIONAL_KEYS + ["serving_unit"],
        CALENDAR + HISTORY + ["expected_people", "default_servings_per_person", "historical_rate"],
    ),
}


def institutional_records(raw, *, keep_history_only=False):
    frame = raw.drop_duplicates().copy()
    frame["meal_date"] = pd.to_datetime(frame.meal_date, errors="coerce").dt.normalize()
    frame["expected_people"] = pd.to_numeric(frame.expected_people, errors="coerce")
    prepared, leftover = frame.prepared_servings, frame.leftover_servings
    waste = pd.to_numeric(frame.plate_waste_servings, errors="coerce")
    frame["observed_demand"] = prepared - leftover
    valid = (
        frame.shortage_occurred.eq(False) & frame.actual_people.gt(0)
        & np.isfinite(frame.actual_people)
        & np.isfinite(frame.default_servings_per_person)
        & frame.default_servings_per_person.gt(0)
        & np.isfinite(prepared) & np.isfinite(leftover) & leftover.ge(0) & prepared.ge(leftover)
        & (frame.plate_waste_servings.isna() | (np.isfinite(waste) & waste.ge(0) & waste.le(frame.observed_demand + 1e-9)))
        & frame.serving_unit.isin(["serving", "piece"])
    )
    valid &= frame.serving_unit.ne("piece") | (
        prepared.mod(1).eq(0) & leftover.mod(1).eq(0) & (waste.isna() | waste.mod(1).eq(0))
    )
    attendance = np.isfinite(frame.expected_people) & frame.expected_people.gt(0)
    if keep_history_only:
        frame.loc[~attendance, "expected_people"] = np.nan
    else:
        valid &= attendance
    return frame.loc[valid].dropna(subset=["meal_date", *INSTITUTIONAL_KEYS])


def predict_partition(pipeline, kind, frame, fallback):
    categories, numbers = SCHEMAS[kind]
    predictions = {"ML": np.maximum(0, pipeline.predict(model_inputs(frame, categories, numbers)))}
    if kind == "restaurant":
        predictions["LAST_OBSERVATION"] = frame.previous_demand.fillna(fallback)
        predictions["ROLLING_30"] = frame.rolling_30.fillna(fallback)
    else:
        predictions["BASELINE"] = frame.expected_people * frame.default_servings_per_person
        predictions["LOCAL_HISTORY"] = [
            row.expected_people * blended_rate(
                row.default_servings_per_person, row.historical_rate, row.history_count,
            )
            for row in frame.itertuples()
        ]
    return predictions


def fit_experiment(kind, records, *, source, synthetic, version):
    institutional = kind == "institutional"
    keys = INSTITUTIONAL_KEYS if institutional else RESTAURANT_KEYS
    features = temporal_features(records, keys, institutional=institutional, window_days=HISTORY_WINDOW_DAYS)
    if institutional:
        features = features.dropna(subset=["expected_people"])
    train, validation, test = chronological_split(features)
    categories, numbers = SCHEMAS[kind]
    pipeline = make_pipeline(
        build_preprocessor(categories, numbers),
        XGBRegressor(n_estimators=160, max_depth=4, learning_rate=0.07,
                     subsample=0.9, colsample_bytree=0.9, tree_method="hist",
                     objective="reg:squarederror", random_state=42, n_jobs=2),
    )
    pipeline.fit(model_inputs(train, categories, numbers), train.observed_demand)
    fallback = float(train.observed_demand.median())
    validation_predictions = predict_partition(pipeline, kind, validation, fallback)
    test_predictions = predict_partition(pipeline, kind, test, fallback)
    metadata = {
        "experiment": kind,
        "model_name": f"{kind}_demand",
        "version": version,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "dataset_source": source,
        "is_synthetic": synthetic,
        "feature_schema": {"categorical": categories, "numerical": numbers},
        "supported_categories": {key: sorted(train[key].dropna().unique().tolist()) for key in categories},
        "target": "served_servings" if institutional else "sold_quantity",
        "training_records": len(train),
        "evaluation_end_date": test.meal_date.max().date().isoformat(),
        "history_window_days": HISTORY_WINDOW_DAYS if institutional else None,
        "supported_quantity_units": sorted(train.serving_unit.unique().tolist()),
        "metrics": {"validation": evaluate(validation, validation_predictions),
                    "test": evaluate(test, test_predictions)},
        "known_limitations": [
            "Walk-forward evaluation uses completed earlier-date records within each partition.",
            ("Simulated kitchens. Results demonstrate pipeline functionality only." if synthetic else
             "Sales proxy with undocumented quantity units." if not institutional else
             "Performance is limited to observed catalogue items and linked, uncensored meals."),
        ],
    }
    return {"pipeline": pipeline, "metadata": metadata}, test, test_predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    restaurant = restaurant_records(pd.read_excel(WORKBOOK)).query("not censored").copy()
    restaurant["serving_unit"] = "undocumented"
    institutional = institutional_records(pd.read_csv(SYNTHETIC_DATA))
    reports = {}
    for kind, records, source in (
        ("restaurant", restaurant, "Local Kaggle workbook; collection method and units unverified"),
        ("institutional", institutional, "AnnaChakra simulator, seed 42"),
    ):
        bundle, test, predictions = fit_experiment(
            kind, records, source=source, synthetic=kind == "institutional", version="experiment-v1",
        )
        joblib.dump(bundle, args.output / f"{kind}_demand_model.joblib")
        metadata = bundle["metadata"]
        (args.output / f"{kind}_metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        comparison_plot(test, predictions["ML"], args.output / f"{kind}_actual_vs_predicted.png")
        reports[kind] = metadata["metrics"]
    (args.output / "evaluation_results.json").write_text(json.dumps(reports, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
