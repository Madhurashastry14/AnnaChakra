"""Lazy inference for approved institutional models and explicit demos."""
import logging
from functools import lru_cache
from math import isfinite
from pathlib import Path

ARTIFACT_DIR = Path(__file__).resolve().parents[1] / "artifacts" / "forecasting"
logger = logging.getLogger(__name__)


@lru_cache(maxsize=4)
def _load(path, modified_ns, size):
    import joblib
    return joblib.load(path)


def beats_baselines(metrics, unit, minimum_improvement=0.0):
    rows = metrics.get(unit, {})
    scores = [rows.get(method, {}).get("wape") for method in ("ML", "BASELINE", "LOCAL_HISTORY")]
    if not all(isinstance(score, (int, float)) and isfinite(score) and score >= 0 for score in scores):
        return False
    return scores[0] < min(scores[1:]) * (1 - minimum_improvement)


def institutional_prediction(path, features, *, version=None, demo=False):
    """Return quantity and model version if the trusted artifact is eligible."""
    try:
        import pandas as pd

        from ml.forecasting.preprocessing import model_inputs
        from ml.forecasting.train import SCHEMAS

        if type(features["kitchen_key"]) is not str or features["kitchen_key"].startswith("demo-") != demo:
            return None
        if not demo and version is None:
            return None
        path = Path(path).resolve()
        if not path.is_relative_to(ARTIFACT_DIR.resolve()):
            return None
        stat = path.stat()
        bundle = _load(path, stat.st_mtime_ns, stat.st_size)
        metadata = bundle["metadata"]
        categories, numbers = SCHEMAS["institutional"]
        if (
            metadata["experiment"] != "institutional"
            or metadata["is_synthetic"] is not demo
            or (version is not None and metadata["version"] != version)
            or metadata["feature_schema"] != {"categorical": categories, "numerical": numbers}
            or metadata["history_window_days"] != features["history_window_days"]
            or features["serving_unit"] not in metadata["supported_quantity_units"]
            or not beats_baselines(metadata["metrics"]["validation"], features["serving_unit"])
            or not beats_baselines(metadata["metrics"]["test"], features["serving_unit"])
        ):
            return None
        for key in categories:
            if not isinstance(features[key], str) or not features[key].strip():
                return None
            if features[key] not in metadata["supported_categories"][key]:
                return None
        for key in numbers:
            value = features[key]
            if value is None and key in {"previous_demand", "rolling_7", "rolling_30", "historical_rate"}:
                continue
            if not isinstance(value, (int, float)) or not isfinite(value) or value < 0:
                return None
        if (features["expected_people"] <= 0 or features["default_servings_per_person"] <= 0
                or features["history_count"] < 1 or not 0 <= features["day_of_week"] <= 6
                or not 1 <= features["month"] <= 12 or features["weekend"] not in (0, 1)):
            return None
        row = model_inputs(pd.DataFrame([features]), categories, numbers)
        quantity = float(bundle["pipeline"].predict(row)[0])
        return (max(0, quantity), metadata["version"]) if isfinite(quantity) else None
    except Exception as exc:
        logger.warning("Institutional model unavailable (%s)", type(exc).__name__)
        return None
