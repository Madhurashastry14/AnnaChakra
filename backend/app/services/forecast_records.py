from fastapi import HTTPException
from sqlalchemy import select

from app.models.food import FoodItem
from app.models.forecast import Forecast, ForecastItem
from app.models.ml_model import ModelVersion
from app.schemas.forecast import ForecastDishResponse, ForecastResponse
from app.services.forecasting import catalogue_dish, forecast_menu_details, snapshot_menu
from app.services.menu_history import menu_history
from app.services.ingredients import calculate_ingredients
from ml.forecasting.menu_predict import MODEL_NAME


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


def _response(forecast, items):
    return ForecastResponse(
        id=forecast.id, meal_date=forecast.meal_date, meal_type=forecast.meal_type,
        expected_people=forecast.expected_people, model_version=forecast.model_version,
        menu_mode=forecast.menu_mode,
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
    dishes = [catalogue_dish(foods[key]) for key in request.food_item_ids]
    history = menu_history(db, kitchen_id, request.meal_date)
    active = db.scalar(select(ModelVersion).where(
        ModelVersion.model_name == MODEL_NAME, ModelVersion.is_active.is_(True),
    ))
    try:
        items = [
            ForecastDishResponse.model_validate(details)
            for details in forecast_menu_details(
                foods, dishes, kitchen_id, request.meal_date, request.meal_type.value,
                request.expected_people, request.menu_mode.value, history, active_model=active,
            )
        ]
    except (ValueError, OverflowError) as exc:
        raise HTTPException(422, "Unable to calculate quantities for the requested menu") from exc
    forecast = Forecast(
        kitchen_id=kitchen_id, meal_date=request.meal_date, meal_type=request.meal_type,
        expected_people=request.expected_people, menu_mode=request.menu_mode,
        menu_context=snapshot_menu(dishes),
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
