from dataclasses import asdict
from hashlib import sha256
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException
from PIL import Image
from sqlalchemy import func, select

from app.core.config import settings
from app.models.food import FoodItem
from app.models.enums import ServingUnit
from app.models.vision import VisionPrediction
from app.services.food import map_food_class_label
from ml.vision.config import FORMATS
from ml.vision.counting import CountResult, count_visible
from ml.vision.predict import predict
from ml.vision.preprocessing import ImageLimitError, decode_image

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}


def owned_prediction(db, kitchen_id, prediction_id, *, lock=False):
    statement = select(VisionPrediction).where(
        VisionPrediction.id == prediction_id, VisionPrediction.kitchen_id == kitchen_id,
    )
    result = db.scalar(statement.with_for_update() if lock else statement)
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


def _count(image, food):
    if food.serving_unit != ServingUnit.PIECE:
        result = CountResult("UNSUPPORTED_FOOD", counting_warnings=["Enter bulk food quantity manually."])
    else:
        result = count_visible(image, food.name)
    return asdict(result) | {"count_food_item_id": food.id}


def recount(db, kitchen_id, prediction_id, food_id):
    prediction = owned_prediction(db, kitchen_id, prediction_id, lock=True)
    food = db.get(FoodItem, food_id)
    if food is None:
        raise HTTPException(404, "Food item not found")
    try:
        image, _ = decode_image(image_path(prediction), settings.VISION_MAX_PIXELS)
    except FileNotFoundError as exc:
        raise HTTPException(404, "Image not found") from exc
    except (OSError, ValueError, Image.DecompressionBombError) as exc:
        raise HTTPException(415, "Saved image cannot be decoded") from exc
    result = _count(image, food)
    if result["counting_status"] == "ESTIMATED":
        # Keep the automatic result intact. Only a successful staff-selected count is saved.
        manual = prediction.result.get("manual_counts", {}) | {str(food.id): result}
        prediction.result = prediction.result | {"manual_counts": manual}
        db.commit()
    return result


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
    food_id = result["food_item_id"]
    if food_id is not None and result["confidence"] >= settings.VISION_CONFIDENCE_THRESHOLD:
        counts = _count(image, db.get(FoodItem, food_id))
    else:
        counts = asdict(CountResult("NOT_ATTEMPTED"))
    result.update(counts)
    result["warnings"].extend(counts["counting_warnings"])
    if counts["estimated_servings"] is not None:
        result["quantity_method"] = "EXPERIMENTAL"
    digest = sha256(f"{image.width}x{image.height}:".encode() + image.tobytes()).hexdigest()
    prediction_id = uuid4().hex
    row = VisionPrediction(id=prediction_id, kitchen_id=kitchen_id, image_format=format_name,
                           result=result | {"image_digest": digest})
    path = image_path(row)
    temporary = path.with_suffix(".tmp")
    temporary_created = image_created = False
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        with temporary.open("xb") as stream:
            temporary_created = True
            # Re-encode decoded RGB to strip original EXIF and untrusted trailing data.
            image.save(stream, format=format_name)
        temporary.rename(path)
        image_created = True
        db.add(row)
        db.commit()
    except Exception:
        db.rollback()
        if temporary_created:
            temporary.unlink(missing_ok=True)
        if image_created:
            path.unlink(missing_ok=True)
        raise
    return {"prediction_id": prediction_id, "image_id": prediction_id, **result}
