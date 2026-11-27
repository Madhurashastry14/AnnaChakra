from datetime import datetime, timezone
from math import fsum, isclose

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select

from app.models.donation import Donation, DonationItem
from app.models.enums import DonationStatus, SafetyStatus, ServingUnit, WasteType
from app.models.food import FoodItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.waste import WasteLog
from app.schemas.waste import WasteRequest, WasteResponse
from app.services.vision import owned_prediction

RESERVED = {DonationStatus.PENDING, DonationStatus.ACCEPTED, DonationStatus.ASSIGNED,
            DonationStatus.IN_TRANSIT, DonationStatus.COMPLETED}
UNSERVED = {WasteType.UNSERVED_SURPLUS, WasteType.SPOILED_FOOD}


def utc(value):
    if value is not None and value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def owned_waste(db, kitchen_id, waste_id, *, lock=False):
    query = select(WasteLog).where(WasteLog.kitchen_id == kitchen_id, WasteLog.id == waste_id)
    row = db.scalar(query.with_for_update() if lock else query)
    if row is None:
        raise HTTPException(404, "Waste log not found")
    return row


def _donation_allocations(db, waste_id):
    return db.execute(
        select(Donation.status, DonationItem.offered_servings, DonationItem.received_servings)
        .join(DonationItem, DonationItem.donation_id == Donation.id)
        .where(DonationItem.waste_log_id == waste_id, Donation.status.in_(RESERVED))
    ).all()


def _validate_accounting(db, kitchen_id, request, current):
    if request.meal_record_item_id is None:
        return
    # The feedback PATCH also locks the parent, so validation and edits serialize.
    item = db.scalar(
        select(MealRecordItem).join(MealRecord, MealRecord.id == MealRecordItem.meal_record_id)
        .where(MealRecordItem.id == request.meal_record_item_id, MealRecord.kitchen_id == kitchen_id)
        .with_for_update(of=MealRecord)
    )
    if item is None:
        raise HTTPException(404, "Meal record item not found")
    if item.food_item_id != request.food_item_id:
        raise HTTPException(422, "The meal record item must match the confirmed food")
    types = {WasteType.PLATE_WASTE} if request.waste_type == WasteType.PLATE_WASTE else UNSERVED
    cap = item.plate_waste_servings if request.waste_type == WasteType.PLATE_WASTE else item.leftover_servings
    if cap is None:
        return
    query = select(WasteLog.confirmed_servings).where(
        WasteLog.meal_record_item_id == item.id, WasteLog.waste_type.in_(types),
    )
    if current is not None:
        query = query.where(WasteLog.id != current.id)
    total = fsum([*db.scalars(query), request.confirmed_servings])
    if total > cap and not isclose(total, cap, rel_tol=1e-12, abs_tol=1e-9):
        raise HTTPException(409, "Logged waste exceeds the recorded quantity for this meal item")


def response_values(row):
    return {
        "prediction_id": row.prediction_id, "meal_record_item_id": row.meal_record_item_id,
        "food_item_id": row.food_item_id, "confirmed_servings": row.confirmed_servings,
        "waste_type": row.waste_type, "prepared_at": utc(row.prepared_at),
        "storage_temperature": row.storage_temperature, "safe_handling_confirmed": row.safe_handling_confirmed,
        "notes": row.notes,
    }


def waste_response(db, row, kitchen, food=None):
    food = food if food is not None else db.get(FoodItem, row.food_item_id)
    status = SafetyStatus.PENDING
    reasons = ["Redistribution screening is pending."]
    return WasteResponse(
        **response_values(row), id=row.id, created_at=utc(row.created_at),
        food_name=food.name, serving_unit=food.serving_unit,
        image_id=row.prediction_id, image_url=f"/api/v1/vision/images/{row.prediction_id}" if row.prediction_id else None,
        predicted_food=row.predicted_food, confidence_score=row.confidence_score, model_version=row.model_version,
        estimated_servings=row.estimated_servings, safety_status=status,
        safety_notes=reasons, safe_until=None, available_servings=0,
    )


def save_waste(db, kitchen, request, current=None):
    kitchen_id = kitchen.id
    food = db.get(FoodItem, request.food_item_id)
    if food is None:
        raise HTTPException(404, "Food item not found")
    if food.serving_unit == ServingUnit.PIECE and not request.confirmed_servings.is_integer():
        raise HTTPException(422, "Piece-based food items require whole-number quantities")
    if request.prepared_at is not None and request.prepared_at > datetime.now(timezone.utc):
        raise HTTPException(422, "Preparation timestamp cannot be in the future")
    values = request.model_dump()
    if current is not None:
        previous = response_values(current)
        if any(value != previous[key] for key, value in values.items() if key != "notes"):
            if _donation_allocations(db, current.id):
                raise HTTPException(409, "An existing donation protects this waste log from operational edits")
    prediction = owned_prediction(db, kitchen_id, request.prediction_id) if request.prediction_id else None
    _validate_accounting(db, kitchen_id, request, current)
    update_prediction = current is None or current.prediction_id != request.prediction_id
    row = current if current is not None else WasteLog(kitchen_id=kitchen_id)
    for name, value in values.items():
        setattr(row, name, value)
    if update_prediction:
        metadata = prediction.result if prediction else {}
        row.predicted_food = metadata.get("predicted_food")
        row.confidence_score = metadata.get("confidence")
        row.model_version = metadata.get("model_version")
        row.estimated_servings = None
    db.add(row)
    db.flush()
    result = waste_response(db, row, kitchen, food)
    db.commit()
    return result


def patch_waste(db, kitchen, current, patch):
    try:
        request = WasteRequest.model_validate(response_values(current) | patch.model_dump(exclude_unset=True))
    except ValidationError as exc:
        raise HTTPException(422, "Invalid waste log update") from exc
    return save_waste(db, kitchen, request, current)
