from datetime import date
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.dependencies import get_current_active_user
from app.main import app
from app.models.enums import MealType, ServingUnit, UserRole
from app.models.food import FoodItem
from app.models.meal_record import MealRecord, MealRecordItem


@compiles(JSONB, "sqlite")
def sqlite_jsonb(element, compiler, **kwargs):
    return "JSON"


@pytest.fixture
def api(monkeypatch):
    engine = create_engine("sqlite://", poolclass=StaticPool,
                           connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(FoodItem(id=1, name="Rice", category="main", serving_unit=ServingUnit.SERVING,
                        is_vegetarian=True, default_servings_per_person=1,
                        ingredients_per_serving=[{"name": "Raw rice", "quantity": 75, "unit": "g"}]))
        db.add_all([
            MealRecord(id=1, kitchen_id=1, meal_date=date(2026, 11, 26),
                       meal_type=MealType.LUNCH, actual_people=10),
            MealRecord(id=2, kitchen_id=2, meal_date=date(2026, 11, 26),
                       meal_type=MealType.LUNCH, actual_people=10),
        ])
        db.add_all([
            MealRecordItem(meal_record_id=1, food_item_id=1, prepared_servings=20,
                           leftover_servings=0, shortage_occurred=False),
            MealRecordItem(meal_record_id=2, food_item_id=1, prepared_servings=100,
                           leftover_servings=0, shortage_occurred=False),
        ])
        db.commit()

    def get_session():
        with Session(engine) as db:
            yield db

    actor = SimpleNamespace(role=UserRole.KITCHEN_STAFF, id=1)
    monkeypatch.setattr("app.core.dependencies.find_kitchen_for_manager",
                        lambda db, user_id: SimpleNamespace(id=user_id))
    monkeypatch.setitem(app.dependency_overrides, get_db, get_session)
    monkeypatch.setitem(app.dependency_overrides, get_current_active_user, lambda: actor)
    with TestClient(app) as client:
        yield client, actor, engine
    engine.dispose()


MENU = {"meal_date": "2026-11-27", "meal_type": "LUNCH",
        "expected_people": 20, "food_item_ids": [1]}


def test_forecasts_are_persisted_and_kitchen_scoped(api):
    client, actor, _ = api
    response = client.post("/api/v1/forecasts", json=MENU)
    assert response.status_code == 201, response.text
    saved = response.json()
    item, = saved["items"]
    assert item["prediction_method"] == "LOCAL_HISTORY"
    assert item["historical_observation_count"] == 1
    assert item["recommended_servings"] == 22
    assert item["ingredients"][0]["quantity"] == 1.65
    route = f"/api/v1/forecasts/{saved['id']}"
    assert client.get(route).json() == saved
    assert client.get("/api/v1/forecasts", params={"meal_date": MENU["meal_date"]}).json() == [saved]
    actor.id = 2
    assert client.get(route).status_code == 404
    assert client.get("/api/v1/forecasts").json() == []
    actor.role = UserRole.NGO_MANAGER
    assert client.post("/api/v1/forecasts", json=MENU).status_code == 403


@pytest.mark.parametrize(("changes", "status"), [
    ({"expected_people": 0}, 422), ({"food_item_ids": []}, 422),
    ({"food_item_ids": [1, 1]}, 422), ({"food_item_ids": [999]}, 404),
    ({"meal_type": "SUPPER"}, 422), ({"kitchen_id": 2}, 422),
])
def test_forecast_validation(api, changes, status):
    client, _, _ = api
    assert client.post("/api/v1/forecasts", json=MENU | changes).status_code == status
    assert client.get("/api/v1/forecasts").json() == []
