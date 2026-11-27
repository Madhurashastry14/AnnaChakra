"""Run an explicit synthetic institutional demo using the local generated CSV."""
import argparse
import json
from datetime import date
from math import ceil

import pandas as pd

from ml.forecasting.features import INSTITUTIONAL_KEYS, temporal_features
from ml.forecasting.generate_dataset import SYNTHETIC_DATA
from ml.forecasting.history import HISTORY_WINDOW_DAYS
from ml.forecasting.predict import ARTIFACT_DIR, institutional_prediction
from ml.forecasting.train import institutional_records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("kitchen", choices=[f"demo-{index}" for index in range(1, 9)])
    parser.add_argument("meal_date", type=date.fromisoformat)
    parser.add_argument("meal_type", choices=["BREAKFAST", "LUNCH", "DINNER"])
    parser.add_argument("dish")
    parser.add_argument("expected_people", type=int)
    args = parser.parse_args()
    if args.expected_people <= 0:
        parser.error("Expected attendance must be positive")
    raw = pd.read_csv(SYNTHETIC_DATA)
    if not raw.is_synthetic.eq(True).all():
        parser.error("The demo requires a synthetic dataset")
    records = institutional_records(raw)
    history = records[
        records.kitchen_key.eq(args.kitchen) & records.meal_type.eq(args.meal_type)
        & records.food_item_name.eq(args.dish) & records.meal_date.lt(pd.Timestamp(args.meal_date))
    ]
    if history.empty:
        parser.error("No previous compatible demo history for this kitchen, dish, and meal type")
    target = history.iloc[-1].copy()
    target["meal_date"] = pd.Timestamp(args.meal_date)
    target["expected_people"] = args.expected_people
    features = temporal_features(
        pd.concat([history, target.to_frame().T], ignore_index=True),
        INSTITUTIONAL_KEYS, institutional=True,
    ).iloc[-1].to_dict()
    features["history_window_days"] = HISTORY_WINDOW_DAYS
    result = institutional_prediction(
        ARTIFACT_DIR / "institutional_demand_model.joblib", features, demo=True,
    )
    if result is None:
        parser.error("The synthetic model is unavailable or this forecast falls outside its supported inputs")
    quantity, version = result
    print(json.dumps({
        "mode": "SYNTHETIC_DEMO", "kitchen_key": args.kitchen, "food_item_name": args.dish,
        "serving_unit": target["serving_unit"], "expected_people": args.expected_people,
        "predicted_quantity": round(quantity, 2), "recommended_quantity": ceil(quantity),
        "historical_observation_count": int(features["history_count"]), "model_version": version,
    }, indent=2))


if __name__ == "__main__":
    main()
