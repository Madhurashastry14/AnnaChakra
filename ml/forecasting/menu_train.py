"""Fit and evaluate a constrained menu-aware institutional XGBoost model."""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import joblib
import numpy as np
import pandas as pd
from sklearn.pipeline import make_pipeline
from xgboost import XGBRegressor

from ml.forecasting.evaluate import comparison_plot, evaluate
from ml.forecasting.features import chronological_split
from ml.forecasting.generate_dataset import SYNTHETIC_DATA
from ml.forecasting.history import HISTORY_WINDOW_DAYS
from ml.forecasting.menu import ACCOMPANIMENT, CHOICE, MAIN, Allocation, Dish, allocate_diners, normalize, recipient_pool
from ml.forecasting.menu_features import (
    CATEGORIES, FEATURE_SCHEMA, menu_model_inputs, menu_preprocessor, training_menu_features,
)
from ml.forecasting.menu_predict import ARTIFACT_DIR, DEMO_ARTIFACT, MODEL_NAME
METHODS = ["INDEPENDENT", "EQUAL_ALLOCATION", "BASELINE", "LOCAL_HISTORY"]


def constrained_predictions(rows, scores):
    """Use model shares for all choice mains together and cap other dishes by eligible diners."""
    scores = np.asarray(scores, dtype=float)
    if scores.shape != (len(rows),) or not np.isfinite(scores).all():
        raise ValueError("The model must produce one finite score per menu dish")
    scores = scores.clip(min=0)
    expected = int(rows[0]["expected_people"])
    mode = rows[0]["menu_mode"]
    main_scores = {row["food_item_name"]: score for row, score in zip(rows, scores)
                   if row["food_role"] == MAIN}
    shares = normalize(main_scores) if mode == CHOICE else {}
    mains = allocate_diners(expected, shares) if mode == CHOICE else dict.fromkeys(main_scores, expected)
    results = {}
    for row, score in zip(rows, scores):
        key, role, portion = row["food_item_name"], row["food_role"], row["default_servings_per_person"]
        if role == MAIN:
            diners = mains[key]
            quantity = diners * portion * (1 if mode == CHOICE else score)
            method = "ML_PREFERENCE" if mode == CHOICE else "ML_FIXED_RATE"
        else:
            dish = Dish(key, role, portion, compatible=row["compatible_keys"])
            pool = recipient_pool(dish, expected, mains, mode) if role == ACCOMPANIMENT else expected
            diners = min(pool, expected * score)
            quantity = diners * portion
            method = "ML_COMPATIBLE_UPTAKE" if role == ACCOMPANIMENT else "ML_ATTENDANCE_UPTAKE"
        results[key] = Allocation(float(quantity), diners, shares.get(key), method,
                                  history_count=row["history_count"])
    return results


def predict_menu_partition(pipeline, frame):
    frame = frame.reset_index(drop=True)
    scores = pipeline.predict(menu_model_inputs(frame))
    quantities = np.zeros(len(frame))
    shares = np.full(len(frame), np.nan)
    diners = np.zeros(len(frame))
    for positions in frame.groupby("menu_id", sort=False).indices.values():
        records = frame.iloc[positions].to_dict("records")
        predictions = constrained_predictions(records, scores[positions])
        for position, row in zip(positions, records):
            prediction = predictions[row["food_item_name"]]
            quantities[position] = prediction.quantity
            shares[position] = np.nan if prediction.share is None else prediction.share
            diners[position] = prediction.diners
    return quantities, shares, diners


def evaluate_menu(pipeline, frame):
    ml, ml_shares, ml_diners = predict_menu_partition(pipeline, frame)
    predictions = {method: frame[method].to_numpy() for method in METHODS} | {"ML": ml}
    methods = dict(zip(METHODS, ["independent_share", "equal_share", "baseline_share", "local_share"]))
    preference = {method: frame[column].to_numpy(dtype=float) for method, column in methods.items()}
    preference["ML"] = ml_shares
    mask = frame.observed_share.notna().to_numpy()
    actual = frame.observed_share.to_numpy()[mask]
    preference_mae = {method: float(np.mean(np.abs(values[mask] - actual))) if len(actual) else None
                      for method, values in preference.items()}
    choice_mains = frame.menu_mode.eq(CHOICE) & frame.food_role.eq(MAIN)
    totals = frame.loc[choice_mains, ["menu_id", "expected_people"]].copy()
    totals["ML"] = ml_diners[choice_mains]
    for method in METHODS:
        totals[method] = (frame.loc[choice_mains, method]
                          / frame.loc[choice_mains, "default_servings_per_person"])
    grouped = totals.groupby("menu_id")
    expected = grouped.expected_people.first()
    violations = {method: int((~np.isclose(grouped[method].sum(), expected)).sum()) for method in predictions}
    by_dish = {}
    for dish, positions in frame.groupby("food_item_name").indices.items():
        by_dish[dish] = evaluate(frame.iloc[positions], {name: values[positions]
                                                       for name, values in predictions.items()})
    return {"units": evaluate(frame, predictions), "by_dish": by_dish,
            "choice_preference_mae": preference_mae, "choice_meals": len(expected),
            "allocation_violations": violations}, ml


def fit_menu_experiment(records, *, source, synthetic, version):
    features = training_menu_features(records)
    return fit_menu_features(features, source=source, synthetic=synthetic, version=version)


def fit_menu_features(features, *, source, synthetic, version):
    train, validation, test = chronological_split(features)
    pipeline = make_pipeline(
        menu_preprocessor(),
        XGBRegressor(n_estimators=130, max_depth=4, learning_rate=0.07, subsample=0.9,
                     colsample_bytree=0.9, tree_method="hist", n_jobs=2, random_state=42),
    )
    pipeline.fit(menu_model_inputs(train), train.model_target)
    validation_report, _ = evaluate_menu(pipeline, validation)
    test_report, predictions = evaluate_menu(pipeline, test)
    metadata = {
        "model_name": MODEL_NAME, "version": version, "dataset_source": source,
        "is_synthetic": synthetic, "feature_schema": FEATURE_SCHEMA,
        "trained_at": datetime.now(timezone.utc).isoformat(), "training_records": len(train),
        "supported_menu_modes": sorted(train.menu_mode.unique().tolist()),
        "supported_quantity_units": sorted(train.serving_unit.unique().tolist()),
        "supported_categories": {key: sorted(train[key].unique().tolist()) for key in CATEGORIES},
        "history_window_days": HISTORY_WINDOW_DAYS,
        "evaluation_end_date": test.meal_date.max().date().isoformat(),
        "metrics": {"validation": validation_report, "test": test_report},
        "known_limitations": [
            "Complete, uncensored meals with recorded menu mode only.",
            "Diner shares use aggregate served quantities divided by catalogue portions.",
            "Walk-forward features use strictly earlier meal dates and assume timely feedback.",
            "Synthetic metrics measure simulated behavior only." if synthetic else
            "Results apply to compatible registered kitchens and catalogue dishes.",
        ],
    }
    return {"pipeline": pipeline, "metadata": metadata}, test, predictions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ARTIFACT_DIR)
    args = parser.parse_args()
    source = pd.read_csv(SYNTHETIC_DATA)
    if not source.is_synthetic.eq(True).all():
        parser.error("This command requires generated synthetic institutional records")
    bundle, test, prediction = fit_menu_experiment(
        source, source="AnnaChakra menu simulator, seed 42", synthetic=True, version=uuid4().hex,
    )
    args.output.mkdir(parents=True, exist_ok=True)
    joblib.dump(bundle, args.output / DEMO_ARTIFACT.name)
    (args.output / "menu_demo_metadata.json").write_text(
        json.dumps(bundle["metadata"], indent=2), encoding="utf-8",
    )
    (args.output / "menu_evaluation_results.json").write_text(
        json.dumps(bundle["metadata"]["metrics"], indent=2), encoding="utf-8",
    )
    comparison_plot(test, prediction, args.output / "menu_actual_vs_predicted.png")


if __name__ == "__main__":
    main()
