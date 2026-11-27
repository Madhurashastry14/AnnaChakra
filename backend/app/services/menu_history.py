"""Read complete meal context for historical forecasting."""
from collections import defaultdict
from datetime import date

from sqlalchemy import select

from app.models.enums import ServingUnit
from app.models.food import FoodItem
from app.models.forecast import Forecast
from app.models.meal_record import MealRecord, MealRecordItem
from app.services.forecasting import catalogue_dish, restore_menu
from ml.forecasting.history import HISTORY_WINDOW_DAYS, Observation
from ml.forecasting.menu_history import MealSample


def sample_from_records(meal, rows, forecast=None):
    kitchen, meal_type = str(meal.kitchen_id), meal.meal_type.value
    mode = meal.menu_mode or (forecast.menu_mode if forecast else None)
    context = meal.menu_context or (forecast.menu_context if forecast else None)
    dishes = restore_menu(context) if context else tuple(catalogue_dish(food) for _, food in rows)
    observations = []
    for item, food in rows:
        quantities = (item.prepared_servings, item.leftover_servings, item.plate_waste_servings)
        invalid_piece = food.serving_unit == ServingUnit.PIECE and any(
            value is not None and not float(value).is_integer() for value in quantities
        )
        observations.append(Observation(
            kitchen, str(food.id), meal_type, meal.meal_date, meal.actual_people,
            item.prepared_servings, item.leftover_servings, item.shortage_occurred or invalid_piece,
            item.plate_waste_servings,
        ))
    return MealSample(kitchen, meal.meal_date, meal_type, mode, meal.actual_people,
                      dishes, tuple(observations))


def menu_history(db, kitchen_id, meal_date):
    start = date.fromordinal(max(1, meal_date.toordinal() - HISTORY_WINDOW_DAYS))
    statement = (
        select(MealRecord, MealRecordItem, FoodItem, Forecast)
        .join(MealRecordItem, MealRecordItem.meal_record_id == MealRecord.id)
        .join(FoodItem, FoodItem.id == MealRecordItem.food_item_id)
        .outerjoin(Forecast, (Forecast.id == MealRecord.forecast_id)
                   & (Forecast.kitchen_id == MealRecord.kitchen_id)
                   & (Forecast.meal_date == MealRecord.meal_date)
                   & (Forecast.meal_type == MealRecord.meal_type))
        .where(MealRecord.kitchen_id == kitchen_id, MealRecord.meal_date >= start,
               MealRecord.meal_date < meal_date, MealRecord.meal_date <= date.today())
        .order_by(MealRecord.meal_date, MealRecord.id, MealRecordItem.id)
    )
    menus = {}
    grouped = defaultdict(list)
    for meal, item, food, forecast in db.execute(statement):
        menus[meal.id] = (meal, forecast)
        grouped[meal.id].append((item, food))
    return [sample_from_records(meal, grouped[record_id], forecast)
            for record_id, (meal, forecast) in menus.items()]
