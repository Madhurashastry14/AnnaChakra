from math import fsum

from app.models.food import FoodItem

from app.services.forecast_records import get_forecast_response
from app.services.waste_analytics import group_history, history_rows, metrics
from app.services.waste_insights import waste_insights


def portion_recommendations(db, kitchen_id, query, forecast=None):
    query = dict(query)
    forecast_items = {}
    if forecast is not None:
        query |= {"meal_type": forecast.meal_type, "menu_mode": forecast.menu_mode, "before": forecast.meal_date}
        forecast_items = {item.food_item_id: item for item in get_forecast_response(db, forecast).items}
    rows = history_rows(db, kitchen_id, **query)
    if forecast_items:
        keys = {str(key) for key in forecast_items}
        rows = [row for row in rows if row[2].id in forecast_items and row[0].menu_mode == forecast.menu_mode
                and row[0].menu_context and {dish["key"] for dish in row[0].menu_context} == keys]
    result = []
    for comparable in group_history(rows).values():
        report = metrics(comparable)
        food = comparable[0][2]
        insights = waste_insights(comparable)
        kinds = {item["insight_type"] for item in insights}
        fit = [row for row in comparable if row[0].actual_people > 0 and not row[1].shortage_occurred]
        quantity = forecast_items.get(food.id)
        result.append({
            "food_item_id": food.id, "food_item_name": food.name, "serving_unit": food.serving_unit,
            "catalogue_servings_per_person": food.default_servings_per_person, "observed_metrics": report,
            "records_analyzed": report.records_analyzed,
            "uncensored_served_per_attendee": (fsum(item.served_servings for _, item, _ in fit)
                                               / sum(meal.actual_people for meal, _, _ in fit)) if fit else None,
            "uncensored_records": len(fit),
            "portion_recommendation": ("REVIEW_PORTIONS" if "HIGH_PLATE_WASTE" in kinds else "NO_CHANGE_SUGGESTED"),
            "preparation_recommendation": (
                "REVIEW_SHORTAGE_RISK" if report.shortage_records else
                "REVIEW_RECURRING_SURPLUS" if "RECURRING_OVERPRODUCTION" in kinds else "FOLLOW_MENU_FORECAST"
            ),
            "forecast_preparation_quantity": quantity.recommended_servings if quantity else None,
            "expected_people": forecast.expected_people if forecast else None,
            "suggested_actions": [item["recommendation"] for item in insights] or [
                "Use the selected menu's forecast and monitor meal feedback."
            ],
            "warnings": ["No automatic changes to catalogue portions or preparation quantities."],
        })
    for food_id, item in forecast_items.items():
        if (query.get("food_item_id") not in (None, food_id)
                or any(row["food_item_id"] == food_id for row in result)):
            continue
        food = db.get(FoodItem, food_id)
        result.append({
            "food_item_id": food_id, "food_item_name": item.name, "serving_unit": item.serving_unit,
            "catalogue_servings_per_person": food.default_servings_per_person, "observed_metrics": None,
            "records_analyzed": 0, "uncensored_records": 0, "uncensored_served_per_attendee": None,
            "portion_recommendation": "INSUFFICIENT_HISTORY", "preparation_recommendation": "FOLLOW_MENU_FORECAST",
            "forecast_preparation_quantity": item.recommended_servings, "expected_people": forecast.expected_people,
            "suggested_actions": ["Use the existing menu forecast and collect comparable meal feedback."],
            "warnings": ["No matching prior meal records."],
        })
    return result
