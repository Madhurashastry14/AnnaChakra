"""Lazy closed-set image inference with a manual fallback."""
import argparse
import json
import logging
from functools import lru_cache
from pathlib import Path
from threading import Lock

from ml.vision.config import ARTIFACTS, CLASSES, IMAGE_SIZE
from ml.vision.preprocessing import decode_image, mobilenet_input
from ml.vision.train import CLASSES_FILE, METADATA_FILE, MODEL_FILE

logger = logging.getLogger(__name__)
_model_lock = Lock()


@lru_cache(maxsize=2)
def _load(directory, signature):
    import tensorflow as tf

    metadata = json.loads((directory / METADATA_FILE).read_text(encoding="utf-8"))
    classes = json.loads((directory / CLASSES_FILE).read_text(encoding="utf-8"))
    if (tuple(classes) != CLASSES or metadata["class_names"] != classes
            or metadata["input_shape"] != [*IMAGE_SIZE, 3]
            or metadata["model_name"] != "food_classifier"
            or not isinstance(metadata["version"], str) or not 0 < len(metadata["version"]) <= 100):
        raise ValueError("Vision artifact metadata is incompatible")
    model = tf.keras.models.load_model(directory / MODEL_FILE, compile=False, safe_mode=True)
    if tuple(model.input_shape[1:]) != (*IMAGE_SIZE, 3) or model.output_shape[-1] != len(classes):
        raise ValueError("Vision model dimensions do not match the class mapping")
    return model, classes, metadata["version"]


def predict(image, directory=ARTIFACTS, threshold=0.65):
    if not 0 <= threshold <= 1:
        raise ValueError("Confidence threshold must be between zero and one")
    try:
        import numpy as np

        directory = Path(directory).resolve()
        signature = tuple((s.st_size, s.st_mtime_ns) for s in
                          ((directory / name).stat() for name in (MODEL_FILE, METADATA_FILE, CLASSES_FILE)))
        with _model_lock:
            model, classes, version = _load(directory, signature)
        scores = np.asarray(model(mobilenet_input(image)[None, ...], training=False), dtype=float)
        if (scores.shape != (1, len(classes)) or not np.isfinite(scores).all()
                or (scores < 0).any() or (scores > 1).any()
                or not np.isclose(scores.sum(), 1, atol=1e-4)):
            raise ValueError("Invalid class scores")
        top = sorted(range(len(classes)), key=lambda idx: scores[0, idx], reverse=True)[:3]
        predictions = [{"label": classes[i], "confidence": float(scores[0, i])} for i in top]
        return {
            "model_version": version, "top_predictions": predictions,
            "warnings": ["Low confidence. Confirm or select the food manually."]
            if predictions[0]["confidence"] < threshold else [],
        }
    except FileNotFoundError:
        pass
    except Exception as exc:
        logger.warning("Vision inference unavailable (%s)", type(exc).__name__)
    return {"model_version": None, "top_predictions": [],
            "warnings": ["Food recognition unavailable. Select the food manually."]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("image", type=Path)
    args = parser.parse_args()
    image, _ = decode_image(args.image)
    print(json.dumps(predict(image), indent=2))


if __name__ == "__main__":
    main()
