from datetime import date, timedelta

from fastapi import HTTPException
from sqlalchemy import select

from app.models.food import FoodItem
from app.models.forecast import Forecast, ForecastItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.ml_model import ModelVersion
from app.schemas.forecast import ForecastDishResponse, ForecastResponse
from app.services.forecasting import forecast_dish
from app.services.ingredients import calculate_ingredients
from ml.forecasting.history import HISTORY_WINDOW_DAYS, Observation


def owned_forecast(db, kitchen_id, forecast_id):
    forecast = db.scalar(select(Forecast).where(
        Forecast.id == forecast_id, Forecast.kitchen_id == kitchen_id,
    ))
    if forecast is None:
        raise HTTPException(404, "Forecast not found")
    return forecast


def menu_items(db, ids):
    foods = {food.id: food for food in db.scalars(select(FoodItem).where(FoodItem.id.in_(ids)))}
    if len(foods) != len(ids):
        raise HTTPException(404, "Food item not found")
    return foods


def _history(db, kitchen_id, request):
    start = request.meal_date - timedelta(days=min(HISTORY_WINDOW_DAYS, request.meal_date.toordinal() - 1))
    statement = (
        select(MealRecord, MealRecordItem)
        .join(MealRecordItem, MealRecordItem.meal_record_id == MealRecord.id)
        .where(MealRecord.kitchen_id == kitchen_id, MealRecord.meal_type == request.meal_type,
               MealRecord.meal_date >= start, MealRecord.meal_date < request.meal_date,
               MealRecord.meal_date <= date.today(),
               MealRecord.actual_people > 0, MealRecordItem.shortage_occurred.is_(False),
               MealRecordItem.food_item_id.in_(request.food_item_ids))
        .order_by(MealRecord.meal_date, MealRecord.id)
    )
    return [
        Observation(str(kitchen_id), str(item.food_item_id), meal.meal_type.value, meal.meal_date,
                    meal.actual_people, item.prepared_servings, item.leftover_servings,
                    item.shortage_occurred, item.plate_waste_servings)
        for meal, item in db.execute(statement)
    ]


def _response(forecast, items):
    return ForecastResponse(
        id=forecast.id, meal_date=forecast.meal_date, meal_type=forecast.meal_type,
        expected_people=forecast.expected_people, model_version=forecast.model_version,
        items=items, created_at=forecast.created_at,
    )


def get_forecast_response(db, forecast):
    statement = (
        select(ForecastItem, FoodItem).join(FoodItem, FoodItem.id == ForecastItem.food_item_id)
        .where(ForecastItem.forecast_id == forecast.id).order_by(ForecastItem.id)
    )
    items = []
    for item, food in db.execute(statement):
        if item.prediction_details is not None:
            items.append(ForecastDishResponse.model_validate(item.prediction_details))
        else:
            items.append(ForecastDishResponse(
                food_item_id=food.id, name=food.name, serving_unit=food.serving_unit,
                expected_people=forecast.expected_people, predicted_servings=item.predicted_servings,
                recommended_servings=item.recommended_servings, prediction_method=item.prediction_method,
                model_version=forecast.model_version if item.prediction_method.value == "ML" else None,
                ingredients=calculate_ingredients(food.ingredients_per_serving, item.recommended_servings),
                warnings=["Prediction details reconstructed from the current catalogue."],
            ))
    return _response(forecast, items)


def create_forecast(db, kitchen_id, request):
    foods = menu_items(db, request.food_item_ids)
    observations = _history(db, kitchen_id, request)
    active = db.scalar(select(ModelVersion).where(
        ModelVersion.model_name == "institutional_demand", ModelVersion.is_active.is_(True),
    ))
    items = []
    for food_id in request.food_item_ids:
        food = foods[food_id]
        try:
            prediction = forecast_dish(
                food, kitchen_id, request.meal_date, request.meal_type, request.expected_people,
                observations, active_model=active,
            )
            if prediction.recommended_servings > 2147483647:
                raise ValueError("Recommended quantity exceeds storage limit")
        except (ValueError, OverflowError) as exc:
            raise HTTPException(422, "Unable to calculate quantities for the requested menu") from exc
        items.append(ForecastDishResponse(
            food_item_id=food_id, name=food.name, serving_unit=food.serving_unit,
            expected_people=request.expected_people, **vars(prediction),
        ))
    forecast = Forecast(
        kitchen_id=kitchen_id, meal_date=request.meal_date, meal_type=request.meal_type,
        expected_people=request.expected_people,
        model_version=next((item.model_version for item in items if item.model_version), None),
    )
    db.add(forecast)
    db.flush()
    db.add_all([
        ForecastItem(
            forecast_id=forecast.id, food_item_id=item.food_item_id,
            predicted_servings=item.predicted_servings, recommended_servings=item.recommended_servings,
            prediction_method=item.prediction_method, prediction_details=item.model_dump(mode="json"),
        )
        for item in items
    ])
    response = _response(forecast, items)
    db.commit()
    return response
