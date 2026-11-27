from collections import defaultdict
from datetime import date, timedelta
from math import fsum, isfinite

from sqlalchemy import select

from app.models.food import FoodItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.schemas.analytics import WasteMetrics

HISTORY_DAYS = 90


def history_rows(db, kitchen_id, *, start_date=None, end_date=None, meal_type=None,
                 food_item_id=None, menu_mode=None, before=None):
    end = min(date.today(), end_date or date.today())
    if before is not None:
        if before == date.min:
            return []
        end = min(end, before - timedelta(days=1))
    start = start_date or date.fromordinal(max(1, end.toordinal() - HISTORY_DAYS + 1))
    query = (
        select(MealRecord, MealRecordItem, FoodItem)
        .join(MealRecordItem, MealRecordItem.meal_record_id == MealRecord.id)
        .join(FoodItem, FoodItem.id == MealRecordItem.food_item_id)
        .where(MealRecord.kitchen_id == kitchen_id, MealRecord.meal_date.between(start, end))
        .order_by(MealRecord.meal_date, MealRecord.id, FoodItem.id)
    )
    for column, value in ((MealRecord.meal_type, meal_type), (FoodItem.id, food_item_id),
                          (MealRecord.menu_mode, menu_mode)):
        if value is not None:
            query = query.where(column == value)
    return [row for row in db.execute(query) if valid_quantities(row[1])]


def valid_quantities(item):
    prepared, leftover, plate = item.prepared_servings, item.leftover_servings, item.plate_waste_servings
    return (isfinite(prepared) and isfinite(leftover) and 0 <= leftover <= prepared
            and (plate is None or (isfinite(plate) and 0 <= plate <= prepared - leftover)))


def group_history(rows, *, daily=False):
    groups = defaultdict(list)
    for meal, item, food in rows:
        key = (food.id, food.serving_unit, meal.meal_type, meal.menu_mode)
        if daily:
            key = (meal.meal_date, *key)
        groups[key].append((meal, item, food))
    return groups


def percentage(numerator, denominator):
    return round(numerator / denominator * 100, 4) if denominator > 0 else None


def metrics(rows, weights=None):
    meal, _, food = rows[0]
    weights = weights if weights is not None else [1] * len(rows)
    pairs = [(record, item, weight) for (record, item, _), weight in zip(rows, weights)]
    measured = [(item, weight) for _, item, weight in pairs if item.plate_waste_servings is not None]
    prepared = fsum(item.prepared_servings * weight for _, item, weight in pairs)
    served = fsum(item.served_servings * weight for _, item, weight in pairs)
    leftovers = fsum(item.leftover_servings * weight for _, item, weight in pairs)
    measured_prepared = fsum(item.prepared_servings * weight for item, weight in measured)
    measured_served = fsum(item.served_servings * weight for item, weight in measured)
    plate = fsum(item.plate_waste_servings * weight for item, weight in measured) if measured else None
    consumed = measured_served - plate if plate is not None else None
    eligible = [(item, weight) for record, item, weight in pairs if record.actual_people > 0]
    shortages = [(item, weight) for item, weight in eligible if item.shortage_occurred]
    return WasteMetrics(
        food_item_id=food.id, food_item_name=food.name, serving_unit=food.serving_unit,
        meal_type=meal.meal_type, menu_mode=meal.menu_mode, records_analyzed=len(rows),
        total_prepared=prepared, total_served=served, total_unserved=leftovers,
        total_plate_waste=plate, total_consumed=consumed,
        measured_plate_waste_records=len(measured), measured_prepared=measured_prepared,
        measured_served=measured_served, shortage_eligible_records=len(eligible),
        shortage_records=len(shortages), overproduction_rate=percentage(leftovers, prepared),
        plate_waste_rate=percentage(plate, measured_served) if plate is not None else None,
        food_acceptance_rate=percentage(consumed, measured_served) if consumed is not None else None,
        consumption_efficiency=percentage(consumed, measured_prepared) if consumed is not None else None,
        plate_waste_measurement_coverage=percentage(len(measured), len(rows)),
        shortage_frequency=percentage(fsum(weight for _, weight in shortages),
                                       fsum(weight for _, weight in eligible)),
    )
