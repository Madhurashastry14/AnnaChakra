from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import func, select

from app.core.config import settings
from app.models.food import FoodItem
from app.models.vision import VisionPrediction
from app.services.food import map_food_class_label
from ml.vision.config import FORMATS
from ml.vision.predict import predict
from ml.vision.preprocessing import ImageLimitError, decode_image

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def owned_prediction(db, kitchen_id, prediction_id):
    result = db.scalar(select(VisionPrediction).where(
        VisionPrediction.id == prediction_id, VisionPrediction.kitchen_id == kitchen_id,
    ))
    if result is None:
        raise HTTPException(404, "Prediction not found")
    return result


def image_path(prediction):
    return settings.VISION_UPLOAD_DIR.resolve() / (prediction.id + FORMATS[prediction.image_format])


def catalogue_predictions(db, result):
    candidates = []
    warnings = list(result["warnings"])
    for row in result["top_predictions"]:
        mapping = map_food_class_label(row["label"])
        food = db.scalar(select(FoodItem).where(func.lower(FoodItem.name) == mapping.food_name.casefold())) if mapping else None
        if food is None:
            warnings.append(f"No matching catalogue item for {row['label']}. Manual selection is available.")
        if mapping and mapping.requires_manual_confirmation:
            warnings.append(f"Confirm the specific {mapping.food_name} variant, dietary status and allergens.")
        candidates.append({
            "label": row["label"], "food": mapping.food_name if mapping else row["label"],
            "food_item_id": food.id if food else None,
            "confidence": row["confidence"], "serving_unit": food.serving_unit.value if food else None,
        })
    best = candidates[0] if candidates else {}
    return {
        "predicted_food": best.get("food"), "food_item_id": best.get("food_item_id"),
        "confidence": best.get("confidence"), "serving_unit": best.get("serving_unit"),
        "model_version": result["model_version"], "top_predictions": candidates,
        "estimated_servings": None, "requires_food_confirmation": True,
        "requires_quantity_confirmation": True, "warnings": warnings,
    }


def accept_upload(db, kitchen_id, upload):
    if upload.filename and Path(upload.filename).suffix.lower() not in SUFFIXES:
        raise HTTPException(415, "Use a JPEG, PNG or WebP image filename")
    payload = upload.file.read(settings.VISION_MAX_BYTES + 1)
    if len(payload) > settings.VISION_MAX_BYTES:
        raise HTTPException(413, "Image exceeds the configured upload size")
    try:
        image, format_name = decode_image(BytesIO(payload), settings.VISION_MAX_PIXELS)
    except (ImageLimitError, Image.DecompressionBombError) as exc:
        raise HTTPException(413, "Decoded image dimensions exceed the configured limit") from exc
    except (OSError, ValueError, SyntaxError) as exc:
        raise HTTPException(415, "Unsupported or corrupt image") from exc

    result = catalogue_predictions(db, predict(image, settings.VISION_ARTIFACT_DIR,
                                               settings.VISION_CONFIDENCE_THRESHOLD))
    prediction_id = uuid4().hex
    row = VisionPrediction(id=prediction_id, kitchen_id=kitchen_id, image_format=format_name, result=result)
    path = image_path(row)
    temporary = path.with_suffix(".tmp")
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with temporary.open("xb") as stream:
            # Re-encode decoded RGB to strip original EXIF and untrusted trailing data.
            image.save(stream, format=format_name)
        temporary.replace(path)
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        temporary.unlink(missing_ok=True)
        path.unlink(missing_ok=True)
        raise
    return {"prediction_id": prediction_id, "image_id": prediction_id, **result}
