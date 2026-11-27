"""Load menu models lazily and enforce production or demo eligibility."""
import logging
from datetime import date
from pathlib import Path

from ml.forecasting.predict import ARTIFACT_DIR, _load

MODEL_NAME = "institutional_menu_demand"
DEMO_ARTIFACT = ARTIFACT_DIR / "menu_demo_model.joblib"
logger = logging.getLogger(__name__)


def predict_menu_artifact(path, rows, meal_date, *, demo=False, version=None):
    try:
        from ml.forecasting.history import HISTORY_WINDOW_DAYS
        from ml.forecasting.menu_features import FEATURE_SCHEMA, menu_model_inputs
        from ml.forecasting.menu_train import constrained_predictions

        if (not rows or any(row["kitchen_key"].startswith("demo-") != demo for row in rows)
                or (not demo and (version is None or not any(row["history_count"] for row in rows)))):
            return None
        path = Path(path).resolve()
        if not path.is_relative_to(ARTIFACT_DIR.resolve()):
            return None
        stat = path.stat()
        bundle = _load(path, stat.st_mtime_ns, stat.st_size)
        metadata = bundle["metadata"]
        if (metadata["model_name"] != MODEL_NAME or metadata["is_synthetic"] is not demo
                or metadata["feature_schema"] != FEATURE_SCHEMA
                or metadata["history_window_days"] != HISTORY_WINDOW_DAYS
                or (not demo and (version != metadata["version"]
                                  or meal_date <= date.fromisoformat(metadata["evaluation_end_date"])))):
            return None
        supported = metadata["supported_categories"]
        if not all(row[feature] in categories for row in rows
                   for feature, categories in supported.items()):
            return None
        predictions = constrained_predictions(rows, bundle["pipeline"].predict(menu_model_inputs(rows)))
        return predictions, metadata["version"]
    except Exception as exc:
        logger.warning("Menu model unavailable (%s)", type(exc).__name__)
        return None
