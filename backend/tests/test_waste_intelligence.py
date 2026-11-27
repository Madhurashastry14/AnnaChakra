from datetime import date, timedelta
from io import BytesIO

import pytest
from PIL import Image, ImageDraw
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.forecast import Forecast
from app.models.food import FoodItem
from app.models.vision import VisionPrediction
from test_menu_forecasts import seeded_menu
from test_forecasts import api
from test_vision_waste import waste_api

ANALYTICS = "/api/v1/analytics"
WASTE = "/api/v1/waste-logs"
MENU = "/api/v1/menu/recommend"


def meal(client, items, *, days=1, mode="CHOICE_BASED", meal_type="LUNCH"):
    response = client.post("/api/v1/meal-records", json={
        "meal_date": (date.today() - timedelta(days=days)).isoformat(), "meal_type": meal_type,
        "menu_mode": mode, "actual_people": 20, "items": [
            {"food_item_id": food_id, "prepared_servings": prepared, "leftover_servings": leftover,
             "plate_waste_servings": plate, "shortage_occurred": shortage}
            for food_id, prepared, leftover, plate, shortage in items
        ],
    })
    assert response.status_code == 201, response.text
    return response.json()


def three_pieces():
    im = Image.new("RGB", (480, 300), "white")
    for x in (40, 180, 320):
        ImageDraw.Draw(im).ellipse((x, 90, x + 80, 170), fill="#a96735")
    stream = BytesIO()
    im.save(stream, "PNG")
    return stream.getvalue()


def test_count_metadata_confirmation_and_duplicate_upload(waste_api):
    pytest.importorskip("cv2")
    client, actor, engine, _ = waste_api

    def upload():
        response = client.post("/api/v1/vision/predict", files={
            "image": ("pieces.png", three_pieces(), "image/png"),
        })
        assert response.status_code == 200, response.text
        return response.json()

    first, duplicate = upload(), upload()
    assert first["estimated_servings"] == 3 and first["counting_status"] == "ESTIMATED"
    prediction_id = first["prediction_id"]
    with Session(engine) as db:
        saved = db.get(VisionPrediction, prediction_id)
        assert saved.result["estimated_servings"] == 3 and len(saved.result["boxes"]) == 3
    manual = client.post(f"/api/v1/vision/predictions/{prediction_id}/count", json={"food_item_id": 1})
    assert manual.json()["counting_status"] == "UNSUPPORTED_FOOD"
    log = client.post(WASTE, json={"prediction_id": prediction_id, "food_item_id": 2,
                                  "confirmed_servings": 4, "waste_type": "UNSERVED_SURPLUS"})
    assert log.status_code == 201, log.text
    assert log.json()["confirmed_servings"] == 4 and log.json()["estimated_servings"] == 3
    corrected = client.patch(f"{WASTE}/{log.json()['id']}", json={"food_item_id": 1, "confirmed_servings": 2.5})
    assert corrected.json()["estimated_servings"] is None and corrected.json()["predicted_food"] == "Chapati"
    again = client.post(WASTE, json={"prediction_id": duplicate["prediction_id"], "food_item_id": 2,
                                    "confirmed_servings": 3, "waste_type": "UNSERVED_SURPLUS"})
    assert again.status_code == 409
    actor.id = 2
    assert client.post(f"/api/v1/vision/predictions/{prediction_id}/count", json={"food_item_id": 2}).status_code == 404


def test_explicit_count_without_model(waste_api, monkeypatch):
    pytest.importorskip("cv2")
    client, _, _, _ = waste_api
    monkeypatch.setattr("app.services.vision.predict", lambda *args: {
        "model_version": None, "top_predictions": [], "warnings": ["Manual fallback."],
    })
    image = client.post("/api/v1/vision/predict", files={"image": ("pieces.png", three_pieces(), "image/png")}).json()
    assert image["counting_status"] == "NOT_ATTEMPTED" and image["estimated_servings"] is None
    result = client.post(f"/api/v1/vision/predictions/{image['prediction_id']}/count", json={"food_item_id": 2})
    assert result.json()["estimated_servings"] == 3 and result.json()["requires_quantity_confirmation"]


def test_drafts_and_unknown_plate_waste(api):
    client, actor, _ = api
    recorded = meal(client, [(1, 20, 8, None, False)])
    item_id = recorded["items"][0]["id"]
    path = f"/api/v1/meal-records/{recorded['id']}"
    assert client.get(path + "/waste-summary").json()["items"][0]["remaining_plate_waste"] is None
    draft = client.get(path + "/surplus-drafts").json()["drafts"][0]
    assert draft["draft"]["confirmed_servings"] == 8 and "prepared_at" in draft["required_safety_information"]
    assert client.get(WASTE).json() == []
    payload = {"food_item_id": 1, "meal_record_item_id": item_id, "confirmed_servings": 5,
               "waste_type": "UNSERVED_SURPLUS"}
    saved = client.post(WASTE, json=payload)
    assert saved.status_code == 201 and saved.json()["available_servings"] == 0
    assert client.post(WASTE, json=payload).status_code == 409
    plate = client.post(WASTE, json=payload | {"waste_type": "PLATE_WASTE", "confirmed_servings": 1})
    assert plate.json()["safety_status"] == "INELIGIBLE"
    summary = client.get(path + "/waste-summary").json()["items"][0]
    assert (summary["logged_unserved"], summary["remaining_unserved"], summary["logged_plate_waste"]) == (5, 3, 1)
    assert summary["remaining_plate_waste"] is None and summary["recorded_unserved"] == 8
    assert [draft["waste_type"] for draft in summary["logging_drafts"]] == ["UNSERVED_SURPLUS"]
    actor.id = 2
    assert client.get(path + "/surplus-drafts").status_code == 404


def test_weighted_waste_metrics_filters_and_isolation(seeded_menu):
    client, actor, _, ids = seeded_menu
    rice, chapati = ids["Steamed Rice"], ids["Chapati"]
    saved = meal(client, [(rice, 100, 30, 7, False), (chapati, 100, 10, None, False)], days=2)
    meal(client, [(rice, 20, 0, None, True)], days=3)
    meal(client, [(rice, 0, 0, 0, False)], days=4, mode="FIXED_MEAL")
    meal(client, [(rice, 100, 80, 1, False)], days=5, meal_type="DINNER")
    payload = {"food_item_id": rice, "meal_record_item_id": saved["items"][0]["id"],
               "confirmed_servings": 5, "waste_type": "UNSERVED_SURPLUS"}
    assert client.post(WASTE, json=payload).status_code == 201
    filters = {"meal_type": "LUNCH", "start_date": (date.today() - timedelta(days=5)).isoformat()}
    result = client.get(ANALYTICS + "/waste-summary", params=filters).json()
    row = next(data for data in result if data["food_item_id"] == rice and data["menu_mode"] == "CHOICE_BASED")
    assert row["total_prepared"] == 120 and row["total_served"] == 90 and row["total_unserved"] == 30
    assert row["total_consumed"] == 63 and row["total_plate_waste"] == 7
    assert row["overproduction_rate"] == 25 and row["plate_waste_rate"] == 10
    assert row["food_acceptance_rate"] == 90 and row["consumption_efficiency"] == 63
    assert row["plate_waste_measurement_coverage"] == 50 and row["shortage_frequency"] == 50
    assert next(data for data in result if data["menu_mode"] == "FIXED_MEAL")["overproduction_rate"] is None
    piece = next(data for data in result if data["food_item_id"] == chapati)
    assert piece["serving_unit"] == "piece" and piece["total_consumed"] is None
    trend = client.get(ANALYTICS + "/waste-trends", params=filters | {"food_item_id": rice}).json()
    assert len(trend) == 3 and all("date" in point for point in trend)
    actor.id = 2
    assert client.get(ANALYTICS + "/food-acceptance", params=filters | {"food_item_id": rice}).json() == []


def test_insights_and_forecast_backed_portion_review(seeded_menu, monkeypatch):
    client, _, _, ids = seeded_menu
    monkeypatch.setattr("app.services.waste_insights.settings.WASTE_MIN_RECORDS", 2)
    rice, chapati, biryani, poha = (ids[name] for name in ("Steamed Rice", "Chapati", "Biryani", "Poha"))
    for day in (2, 3):
        meal(client, [(rice, 100, 30, 20, False), (chapati, 20, 0, None, True),
                      (biryani, 20, 0, 0, False)], days=day)
    meal(client, [(poha, 20, 0, None, False)], days=4)
    response = client.get(ANALYTICS + "/waste-insights").json()
    kinds = {row["insight_type"] for row in response["insights"]}
    assert {"RECURRING_OVERPRODUCTION", "HIGH_PLATE_WASTE", "FREQUENT_SHORTAGE",
            "INSUFFICIENT_HISTORY", "INCOMPLETE_WASTE_MEASUREMENTS", "EFFICIENT_PREPARATION"} <= kinds
    forecast = client.post("/api/v1/forecasts", json={
        "food_item_ids": [rice, chapati, biryani], "expected_people": 20, "meal_type": "LUNCH",
        "meal_date": date.today().isoformat(),
    }).json()
    portions = client.get(ANALYTICS + "/portion-recommendations", params={"forecast_id": forecast["id"]}).json()
    rice_row = next(row for row in portions["recommendations"] if row["food_item_id"] == rice)
    assert rice_row["portion_recommendation"] == "REVIEW_PORTIONS"
    assert rice_row["forecast_preparation_quantity"] == forecast["items"][0]["recommended_servings"]
    assert rice_row["catalogue_servings_per_person"] == 1


def test_menu_constraints_history_and_forecast_contract(seeded_menu):
    client, actor, engine, ids = seeded_menu
    rice, chapati, idli, sambar = (ids[name] for name in ("Steamed Rice", "Chapati", "Idli", "Sambar"))
    base = {"meal_date": date.today().isoformat(), "meal_type": "LUNCH", "expected_people": 100,
            "vegetarian_only": True, "max_main_dishes": 1, "max_accompaniments": 0,
            "excluded_food_item_ids": sorted(set(ids.values()) - {rice, chapati})}
    cold = client.post(MENU, json=base)
    assert cold.status_code == 200, cold.text
    cold = cold.json()
    assert cold["recommendation_method"] == "CATALOGUE_BASED"
    assert client.post(MENU, json=base).json() == cold
    assert cold["recommended_food_item_ids"] == [rice]
    for day in range(1, 7):
        meal(client, [(rice, 100, 45, None, day == 1), (chapati, 100, 0, 0, False)], days=day)
    # Same-day feedback cannot affect a forecast recommendation for that date.
    meal(client, [(rice, 100, 0, 0, False), (chapati, 100, 40, 20, False)], days=0)
    learned = client.post(MENU, json=base)
    assert learned.status_code == 200, learned.text
    learned = learned.json()
    assert learned["recommendation_method"] == "HYBRID"
    assert learned["recommended_food_item_ids"] == [chapati]
    assert learned["recommended_items"][0]["records_analyzed"] == 6
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(Forecast)) == 0
    assert client.post("/api/v1/forecasts", json=learned["forecast_request"]).status_code == 201
    actor.id = 2
    assert client.post(MENU, json=base).json() == cold
    assert client.post(MENU, json=base | {"required_food_item_ids": [idli]}).status_code == 422
    assert client.post(MENU, json=base | {"required_food_item_ids": [9999]}).status_code == 404
    result = client.post(MENU, json=base | {
        "excluded_food_item_ids": [], "required_food_item_ids": [rice, sambar],
        "max_accompaniments": 1, "max_dishes": 2, "menu_mode": "FIXED_MEAL",
    })
    assert result.status_code == 200, result.text
    assert result.json()["recommended_food_item_ids"] == [rice, sambar]
    assert client.post(MENU, json=base | {
        "excluded_food_item_ids": [], "required_food_item_ids": [chapati, sambar], "max_accompaniments": 1,
    }).status_code == 422


def test_menu_variety_and_vegetarian_constraint(seeded_menu, monkeypatch):
    client, _, engine, ids = seeded_menu
    rice, chapati, biryani = (ids[name] for name in ("Steamed Rice", "Chapati", "Biryani"))
    monkeypatch.setattr("app.services.menu_optimizer.settings.MENU_SCORE_WEIGHTS", (0, 0, 0, 1, 0))
    with Session(engine) as db:
        db.get(FoodItem, biryani).is_vegetarian = False
        db.commit()
    meal(client, [(rice, 20, 0, None, False)], days=1)
    request = {"meal_date": date.today().isoformat(), "meal_type": "LUNCH", "expected_people": 30,
               "max_main_dishes": 1, "max_accompaniments": 0, "vegetarian_only": True,
               "excluded_food_item_ids": sorted(set(ids.values()) - {rice, chapati, biryani})}
    proposed = client.post(MENU, json=request)
    assert proposed.status_code == 200, proposed.text
    assert proposed.json()["recommended_food_item_ids"] == [chapati]
    assert client.post(MENU, json=request | {"required_food_item_ids": [biryani]}).status_code == 422
