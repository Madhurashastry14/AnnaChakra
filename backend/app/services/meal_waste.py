from collections import defaultdict
from math import fsum

from sqlalchemy import select

from app.models.enums import WasteType
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
        })
    return {"meal_record_id": meal.id, "meal_date": meal.meal_date, "items": items}
