from dataclasses import dataclass
from math import ceil
from statistics import mean

from app.models.enums import PredictionMethod
from app.services.ingredients import calculate_ingredients
from ml.forecasting.history import (
    HISTORY_WINDOW_DAYS, eligible_history, forecast_quantity, serving_rate,
)
from ml.forecasting.predict import institutional_prediction


@dataclass(frozen=True)
class DishPrediction:
    predicted_servings: float
    recommended_servings: int
    prediction_method: PredictionMethod
    historical_observation_count: int
    model_version: str | None
    ingredients: list
    warnings: list[str]


def forecast_dish(food, kitchen_id, meal_date, meal_type, expected_people, observations,
                  *, active_model=None, window_days=HISTORY_WINDOW_DAYS, smoothing=10):
    kitchen_key = str(kitchen_id)
    history = eligible_history(
        observations, kitchen_key, str(food.id), meal_type.value, meal_date, window_days,
    )
    history.sort(key=lambda row: row.meal_date)
    count = len(history)
    default_rate = food.default_servings_per_person
    quantity = forecast_quantity(expected_people, default_rate, history, smoothing)
    method = PredictionMethod.LOCAL_HISTORY if history else PredictionMethod.BASELINE
    warnings = [] if history else ["No eligible prior meal records for this dish and meal type."]
    version = None
    if history and active_model is not None:
        served = [row.served for row in history]
        prediction = institutional_prediction(active_model.artifact_path, {
            "kitchen_key": kitchen_key, "food_item_name": str(food.id),
            "meal_type": meal_type.value, "serving_unit": food.serving_unit.value,
            "expected_people": expected_people, "day_of_week": meal_date.weekday(),
            "month": meal_date.month, "weekend": int(meal_date.weekday() >= 5),
            "default_servings_per_person": default_rate, "historical_rate": serving_rate(history),
            "previous_demand": served[-1], "rolling_7": mean(served[-7:]),
            "rolling_30": mean(served[-30:]), "history_count": count,
            "history_window_days": window_days,
        }, version=active_model.version)
        if prediction is None:
            warnings.append("The active model did not support this forecast. Used local history.")
        else:
            quantity, version = prediction
            method = PredictionMethod.ML
    recommended = ceil(quantity)
    return DishPrediction(
        quantity, recommended, method, count, version,
        calculate_ingredients(food.ingredients_per_serving, recommended), warnings,
    )
