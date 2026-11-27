from datetime import datetime, timezone
from math import fsum, isclose

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import select, text

from app.models.donation import Donation, DonationItem
from app.models.enums import DonationStatus, SafetyStatus, ServingUnit, WasteType
from app.models.food import FoodItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.waste import WasteLog
from app.models.vision import VisionPrediction
from app.schemas.waste import SafetyEvidence, WasteRequest, WasteResponse
from app.services.safety import Screening, current_policy, policy_for_batch, screen_waste
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
    try:
        total = fsum([*db.scalars(query), request.confirmed_servings])
    except OverflowError as exc:
        raise HTTPException(409, "Logged waste exceeds the recorded quantity for this meal item") from exc
    if total > cap and not isclose(total, cap, rel_tol=1e-12, abs_tol=1e-9):
        raise HTTPException(409, "Logged waste exceeds the recorded quantity for this meal item")


def _validate_image_accounting(db, prediction, kitchen_id, current):
    digest = prediction.result.get("image_digest")
    if digest and db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"),
                   {"key": f"waste-image:{kitchen_id}:{digest}"})
    query = select(WasteLog.id).join(VisionPrediction, WasteLog.prediction_id == VisionPrediction.id)
    match = (VisionPrediction.result["image_digest"].as_string() == digest
             if digest else VisionPrediction.id == prediction.id)
    query = query.where(WasteLog.kitchen_id == kitchen_id, match)
    if current is not None:
        query = query.where(WasteLog.id != current.id)
    if db.scalar(query.limit(1)) is not None:
        raise HTTPException(409, "This image already supports a waste log. Edit that log instead.")


def response_values(row):
    return {
        "prediction_id": row.prediction_id, "meal_record_item_id": row.meal_record_item_id,
        "food_item_id": row.food_item_id, "confirmed_servings": row.confirmed_servings,
        "waste_type": row.waste_type, "prepared_at": utc(row.prepared_at),
        "storage_temperature": row.storage_temperature, "safe_handling_confirmed": row.safe_handling_confirmed,
        "notes": row.notes,
        **{key: (row.safety_evidence or {}).get(key) for key in SafetyEvidence.model_fields},
    }


def screening_for_use(row, food, kitchen, now=None):
    now = now or datetime.now(timezone.utc)
    result = screen_waste(row, food.name, getattr(kitchen, "verification_status", None), policy_for_batch(current_policy(), kitchen, row), now)
    if row.screened_at is None:
        # Preserve legacy screening information without treating it as validated evidence.
        legacy_expired = row.safe_until is not None and utc(row.safe_until) <= now
        if row.safety_status == SafetyStatus.INELIGIBLE or legacy_expired:
            reason = "The legacy screen rejected this record or its deadline has passed."
            return Screening(SafetyStatus.INELIGIBLE, [reason], now, None, result.policy_version)
    if result.status == SafetyStatus.ELIGIBLE:
        deadline = utc(row.safe_until)
        if (row.safety_status != SafetyStatus.ELIGIBLE or deadline is None or now >= deadline
                or row.safety_policy_version != result.policy_version):
            return Screening(SafetyStatus.PENDING, ["An up-to-date persisted screening is required."],
                             now, None, result.policy_version)
        return Screening(result.status, result.reasons, now, min(deadline, result.safe_until),
                         result.policy_version)
    return result


def waste_response(db, row, kitchen, food=None):
    food = food if food is not None else db.get(FoodItem, row.food_item_id)
    check = screening_for_use(row, food, kitchen)
    available = 0
    if check.status == SafetyStatus.ELIGIBLE:
        reserved = fsum(offered for _, offered, _ in _donation_allocations(db, row.id))
        available = max(0, row.confirmed_servings - reserved)
    return WasteResponse(
        **response_values(row), id=row.id, created_at=utc(row.created_at),
        food_name=food.name, serving_unit=food.serving_unit,
        image_id=row.prediction_id, image_url=f"/api/v1/vision/images/{row.prediction_id}" if row.prediction_id else None,
        predicted_food=row.predicted_food, confidence_score=row.confidence_score, model_version=row.model_version,
        estimated_servings=row.estimated_servings, safety_status=check.status,
        safety_notes=check.reasons, safe_until=check.safe_until, available_servings=available,
        screened_at=utc(row.screened_at), safety_policy_version=check.policy_version,
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
    evidence = request.model_dump(mode="json", include=set(SafetyEvidence.model_fields), exclude_none=True)
    values = request.model_dump(exclude=set(SafetyEvidence.model_fields))
    if current is not None:
        previous = response_values(current)
        protected = {"food_item_id", "confirmed_servings", "waste_type", "prepared_at",
                     "meal_record_item_id", "prediction_id"}
        if any(values[key] != previous[key] for key in protected):
            if _donation_allocations(db, current.id):
                raise HTTPException(409, "An existing donation protects this waste log from operational edits")
    prediction = (owned_prediction(db, kitchen_id, request.prediction_id, lock=True)
                  if request.prediction_id else None)
    if prediction is not None:
        _validate_image_accounting(db, prediction, kitchen_id, current)
    _validate_accounting(db, kitchen_id, request, current)
    update_prediction = current is None or current.prediction_id != request.prediction_id
    row = current if current is not None else WasteLog(kitchen_id=kitchen_id, is_simulated=bool(getattr(kitchen, "is_simulated", False)))
    for name, value in values.items():
        setattr(row, name, value)
    if update_prediction:
        metadata = prediction.result if prediction else {}
        row.predicted_food = metadata.get("predicted_food")
        row.confidence_score = metadata.get("confidence")
        row.model_version = metadata.get("model_version")
    metadata = prediction.result if prediction else {}
    count = metadata.get("manual_counts", {}).get(str(food.id), metadata)
    row.estimated_servings = (count.get("estimated_servings")
                              if food.serving_unit == ServingUnit.PIECE
                              and count.get("count_food_item_id") == food.id else None)
    row.safety_evidence = evidence
    check = screen_waste(row, food.name, getattr(kitchen, "verification_status", None), policy_for_batch(current_policy(), kitchen, row))
    row.safety_status = check.status
    row.screened_at = check.screened_at
    row.screening_reasons = check.reasons
    row.safe_until = check.safe_until
    row.safety_policy_version = check.policy_version
    db.add(row)
    db.flush()
    result = waste_response(db, row, kitchen, food)
    db.commit()
    return result


def patch_waste(db, kitchen, current, patch):
    previous = response_values(current)
    edits = patch.model_dump(exclude_unset=True)
    if any(key in edits and edits[key] != previous[key] for key in ("food_item_id", "waste_type", "prepared_at")):
        previous.update(dict.fromkeys(SafetyEvidence.model_fields))
        previous.update(storage_temperature=None, safe_handling_confirmed=False)
    try:
        request = WasteRequest.model_validate(previous | edits)
    except ValidationError as exc:
        raise HTTPException(422, "Invalid waste log update") from exc
    return save_waste(db, kitchen, request, current)
