from dataclasses import asdict
from math import ceil, isfinite

from app.models.enums import PredictionMethod
from app.services.ingredients import calculate_ingredients
from ml.forecasting.menu import Dish
from ml.forecasting.menu_history import personalized_menu
from ml.forecasting.menu_predict import predict_menu_artifact


def catalogue_dish(food):
    return Dish(str(food.id), food.food_role.value if food.food_role is not None else None,
                food.default_servings_per_person, food.uptake_rate, food.preference_weight,
                tuple(map(str, food.compatible_main_food_item_ids)))


def snapshot_menu(dishes):
    return [asdict(dish) for dish in dishes]


def restore_menu(context):
    return tuple(Dish(**(data | {"compatible": tuple(data["compatible"])})) for data in context)


def forecast_menu_details(foods, dishes, kitchen_id, meal_date, meal_type, expected, mode, history,
                          *, active_model=None):
    kitchen = str(kitchen_id)
    predictions = personalized_menu(dishes, expected, mode, kitchen, meal_type, meal_date, history)
    version = None
    model_failed = False
    if active_model is not None:
        try:
            from ml.forecasting.menu_features import build_menu_features
            units = {str(food.id): food.serving_unit.value for food in foods.values()}
            features = build_menu_features(dishes, units, expected, mode, kitchen, meal_type, meal_date, history)
            candidate = predict_menu_artifact(
                active_model.artifact_path, features, meal_date, version=active_model.version,
            )
        except ImportError:
            candidate = None
        if candidate is not None:
            predictions, version = candidate
        else:
            model_failed = True
    details = []
    for dish in dishes:
        food = foods[int(dish.key)]
        prediction = predictions[dish.key]
        quantity = prediction.quantity
        if not isfinite(quantity) or not 0 <= quantity <= 2147483647:
            raise ValueError("Prediction outside the valid quantity range")
        recommended = ceil(quantity)
        method = (PredictionMethod.ML if version else PredictionMethod.LOCAL_HISTORY
                  if prediction.history_count else PredictionMethod.BASELINE)
        warnings = list(prediction.warnings)
        if model_failed:
            warnings.append("The active menu model is unavailable for this forecast. Used menu allocation.")
        if prediction.history_count == 0:
            warnings.append("No eligible prior meal records for this dish and menu context.")
        details.append({
            "food_item_id": food.id, "name": food.name, "serving_unit": food.serving_unit,
            "expected_people": expected, "predicted_servings": quantity,
            "recommended_servings": recommended, "prediction_method": method,
            "historical_observation_count": prediction.history_count, "model_version": version,
            "ingredients": calculate_ingredients(food.ingredients_per_serving, recommended),
            "warnings": warnings, "food_role": dish.role, "estimated_diners": prediction.diners,
            "preference_share": prediction.share, "allocation_method": prediction.method,
            "compatible_main_food_item_ids": list(map(int, dish.compatible)),
        })
    return details
