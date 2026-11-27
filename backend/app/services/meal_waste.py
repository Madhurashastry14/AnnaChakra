from collections import defaultdict
from math import fsum

from sqlalchemy import select

from app.models.enums import VerificationStatus, WasteType
from app.services.safety import current_policy
from app.models.food import FoodItem
from app.models.meal_record import MealRecordItem
from app.models.waste import WasteLog


def meal_waste_summary(db, meal):
    rows = db.execute(select(MealRecordItem, FoodItem).join(
        FoodItem, FoodItem.id == MealRecordItem.food_item_id,
    ).where(MealRecordItem.meal_record_id == meal.id).order_by(MealRecordItem.id)).all()
    logs = defaultdict(list)
    for log in db.scalars(select(WasteLog).where(
        WasteLog.kitchen_id == meal.kitchen_id,
        WasteLog.meal_record_item_id.in_([item.id for item, _ in rows]),
    ).order_by(WasteLog.id)):
        logs[log.meal_record_item_id].append(log)
    items = []
    for item, food in rows:
        linked = logs[item.id]
        totals = {kind: fsum(log.confirmed_servings for log in linked if log.waste_type == kind)
                  for kind in WasteType}
        unserved = totals[WasteType.UNSERVED_SURPLUS]
        spoiled = totals[WasteType.SPOILED_FOOD]
        plate = totals[WasteType.PLATE_WASTE]
        items.append({
            "meal_record_item_id": item.id, "food_item_id": food.id, "food_item_name": food.name,
            "serving_unit": food.serving_unit, "prepared_servings": item.prepared_servings,
            "served_servings": item.served_servings, "recorded_unserved": item.leftover_servings,
            "recorded_plate_waste": item.plate_waste_servings,
            "logged_unserved": unserved, "logged_spoiled": spoiled, "logged_plate_waste": plate,
            "remaining_unserved": max(0, round(item.leftover_servings - unserved - spoiled, 9)),
            "remaining_plate_waste": (None if item.plate_waste_servings is None else
                                      max(0, round(item.plate_waste_servings - plate, 9))),
            "waste_log_ids": [log.id for log in linked],
            "recorded_preparation_times": sorted({log.prepared_at for log in linked if log.prepared_at}),
        })
    return {"meal_record_id": meal.id, "meal_date": meal.meal_date, "items": items}


def surplus_drafts(db, meal, kitchen):
    summary = meal_waste_summary(db, meal)
    policy = current_policy()
    drafts = []
    for item in summary["items"]:
        if not item["remaining_unserved"]:
            continue
        times = item["recorded_preparation_times"]
        food_key = item["food_item_name"].strip().casefold()
        missing = [
            "unserved_confirmed", "safe_handling_confirmed", "storage_method", "storage_verified",
            "storage_temperature", "temperature_measured_at", "temperature_history_started_at",
            "temperature_history_min_c", "temperature_history_max_c", "temperature_history_reference",
            "uncontrolled_minutes", "contamination_suspected",
        ]
        if len(times) != 1:
            missing.append("prepared_at")
        warnings = ["Confirm actual quantity and preparation details before creating the log."]
        if getattr(kitchen, "verification_status", None) != VerificationStatus.VERIFIED:
            warnings.append("Kitchen verification is required for redistribution.")
        if policy is None or food_key not in policy.rules:
            warnings.append("No approved holding rule is configured for this food.")
        elif food_key in policy.blocked_foods:
            warnings.append("This food is restricted by the configured policy.")
        drafts.append({
            "meal_record_id": meal.id, "meal_record_item_id": item["meal_record_item_id"],
            "food_item_id": item["food_item_id"], "food_item_name": item["food_item_name"],
            "serving_unit": item["serving_unit"], "recorded_unserved": item["recorded_unserved"],
            "remaining_unserved": item["remaining_unserved"], "required_safety_information": missing,
            "requires_quantity_confirmation": True, "warnings": warnings,
            "draft": {"meal_record_item_id": item["meal_record_item_id"], "food_item_id": item["food_item_id"],
                      "confirmed_servings": item["remaining_unserved"], "waste_type": "UNSERVED_SURPLUS",
                      "prepared_at": times[0] if len(times) == 1 else None},
        })
    return {"meal_record_id": meal.id, "meal_date": meal.meal_date, "drafts": drafts}
