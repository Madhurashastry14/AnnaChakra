from datetime import date, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import PredictionMethod
from app.models.food import FoodItem
from app.models.forecast import Forecast, ForecastItem
from scripts.seed_food_items import seed_food_catalogue
from test_forecasts import api


@pytest.fixture
def seeded_menu(api):
    client, actor, engine = api
    with Session(engine) as db:
        seed_food_catalogue(db)
        ids = {name: food_id for name, food_id in db.execute(select(FoodItem.name, FoodItem.id))}
    return client, actor, engine, ids


def forecast(client, ids, names, *, attendance=200, mode=None, meal_date=None):
    payload = {"meal_date": (meal_date or date.today()).isoformat(), "meal_type": "LUNCH",
               "expected_people": attendance, "food_item_ids": [ids[name] for name in names]}
    if mode:
        payload["menu_mode"] = mode
    result = client.post("/api/v1/forecasts", json=payload)
    assert result.status_code == 201, result.text
    return result.json()


def test_choice_menu_uses_portions_and_allocates_exhaustively(seeded_menu):
    client, _, _, ids = seeded_menu
    plan = forecast(client, ids, ("Chapati", "Steamed Rice", "Biryani"))
    assert plan["menu_mode"] == "CHOICE_BASED"
    assert [item["estimated_diners"] for item in plan["items"]] == [67, 67, 66]
    assert [item["predicted_servings"] for item in plan["items"]] == [201, 67, 66]
    assert all(item["prediction_method"] == "BASELINE" for item in plan["items"])
    assert sum(item["preference_share"] for item in plan["items"]) == pytest.approx(1)


@pytest.mark.parametrize(("mode", "diners", "sambar"), [
    ("CHOICE_BASED", [100, 100], 75), ("FIXED_MEAL", [200, 200], 150),
])
def test_sambar_is_tied_to_rice_recipients(seeded_menu, mode, diners, sambar):
    client, _, _, ids = seeded_menu
    plan = forecast(client, ids, ("Chapati", "Steamed Rice", "Sambar"), mode=mode)
    first, second, accompaniment = plan["items"]
    assert [first["estimated_diners"], second["estimated_diners"]] == diners
    assert accompaniment["food_role"] == "ACCOMPANIMENT"
    assert accompaniment["preference_share"] is None
    assert accompaniment["estimated_diners"] == sambar
    assert accompaniment["recommended_servings"] == sambar
    assert ids["Steamed Rice"] in accompaniment["compatible_main_food_item_ids"]
    assert ids["Chapati"] not in accompaniment["compatible_main_food_item_ids"]


def test_manual_and_linked_feedback_learn_different_kitchen_preferences(seeded_menu):
    client, actor, _, ids = seeded_menu
    menu = ("Chapati", "Steamed Rice", "Biryani")

    def log(day, quantity, *, mode=None, forecast_id=None, shortage=False):
        payload = {"meal_date": day.isoformat(), "meal_type": "LUNCH", "actual_people": 100,
                   "items": [{"food_item_id": ids[name], "prepared_servings": served,
                              "leftover_servings": 0, "shortage_occurred": shortage}
                             for name, served in zip(menu, quantity)]}
        if forecast_id is not None:
            payload["forecast_id"] = forecast_id
        if mode is not None:
            payload["menu_mode"] = mode
        response = client.post("/api/v1/meal-records", json=payload)
        assert response.status_code == 201, response.text
        return response.json()

    today = date.today()
    previous = today - timedelta(days=5)
    plan = forecast(client, ids, menu, meal_date=previous)
    feedback = log(previous, (240, 10, 10), forecast_id=plan["id"])
    assert feedback["menu_mode"] == "CHOICE_BASED"
    once = forecast(client, ids, menu, attendance=300)
    log(today - timedelta(days=4), (240, 10, 10), mode="CHOICE_BASED")
    log(today - timedelta(days=3), (0, 100, 0), mode="FIXED_MEAL")
    log(today - timedelta(days=2), (0, 100, 0))
    log(today - timedelta(days=1), (0, 100, 0), mode="CHOICE_BASED", shortage=True)
    learned = forecast(client, ids, menu, attendance=300)
    assert learned["items"][0]["estimated_diners"] > once["items"][0]["estimated_diners"] > 100
    assert learned["items"][0]["historical_observation_count"] == 2
    assert learned["items"][0]["prediction_method"] == "LOCAL_HISTORY"
    assert sum(item["estimated_diners"] for item in learned["items"]) == 300
    actor.id = 2
    log(previous, (30, 80, 10), mode="CHOICE_BASED")
    other = forecast(client, ids, menu, attendance=300)
    assert other["items"][1]["estimated_diners"] > other["items"][0]["estimated_diners"]
    assert other["items"][1]["historical_observation_count"] == 1


def test_legacy_rows_and_saved_forecasts_keep_original_quantities(seeded_menu):
    client, _, engine, ids = seeded_menu
    saved = forecast(client, ids, ("Chapati", "Steamed Rice", "Biryani"))
    with Session(engine) as session:
        legacy = Forecast(kitchen_id=1, meal_date=date.today(), meal_type="LUNCH", expected_people=200)
        session.add(legacy)
        session.flush()
        legacy_id = legacy.id
        session.add(ForecastItem(forecast_id=legacy_id, food_item_id=ids["Chapati"],
                                 predicted_servings=600, recommended_servings=600,
                                 prediction_method=PredictionMethod.BASELINE))
        food = session.get(FoodItem, ids["Chapati"])
        food.default_servings_per_person = 4
        session.commit()
    legacy = client.get(f"/api/v1/forecasts/{legacy_id}").json()
    assert legacy["menu_mode"] is None
    assert legacy["items"][0]["estimated_diners"] is None
    assert legacy["items"][0]["recommended_servings"] == 600
    assert client.get(f"/api/v1/forecasts/{saved['id']}").json() == saved


def test_seed_backfill_preserves_existing_ids_and_admin_settings(seeded_menu):
    _, _, engine, ids = seeded_menu
    with Session(engine) as session:
        rice = session.get(FoodItem, ids["Steamed Rice"])
        rice.name = "steamed rice"
        rice.food_role = None
        sambar = session.get(FoodItem, ids["Sambar"])
        sambar.uptake_rate = 0.2
        sambar.compatible_main_food_item_ids = []
        session.commit()
        inserted, _ = seed_food_catalogue(session)
        assert inserted == 0
        assert session.get(FoodItem, ids["Steamed Rice"]).food_role == "MAIN_DISH"
        assert session.get(FoodItem, ids["Sambar"]).uptake_rate == pytest.approx(0.2)
        assert session.get(FoodItem, ids["Sambar"]).compatible_main_food_item_ids == []
