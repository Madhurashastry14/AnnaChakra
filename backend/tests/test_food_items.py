from collections.abc import Generator, Iterator
from contextlib import contextmanager
from datetime import date, datetime, timezone
from typing import Literal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.enums import (
    MealType,
    PredictionMethod,
    SafetyStatus,
    ServingUnit,
    UserRole,
    WasteType,
)
from app.models.food import FoodItem
from app.models.forecast import Forecast, ForecastItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.organization import Kitchen
from app.models.user import User
from app.models.waste import WasteLog
from scripts import seed_food_items as food_seed


@compiles(JSONB, "sqlite")
def _compile_jsonb_for_sqlite(
    _type: JSONB,
    _compiler: object,
    **_kwargs: object,
) -> str:
    return "JSON"


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Kitchen.__table__,
            FoodItem.__table__,
            Forecast.__table__,
            ForecastItem.__table__,
            MealRecord.__table__,
            MealRecordItem.__table__,
            WasteLog.__table__,
        ],
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db() -> Iterator[Session]:
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@contextmanager
def _test_session() -> Generator[Session, None, None]:
    session_generator = app.dependency_overrides[get_db]()
    try:
        yield next(session_generator)
    finally:
        session_generator.close()


def _admin_headers() -> dict[str, str]:
    with _test_session() as db:
        admin = User(
            name="Catalogue Administrator",
            email="food-admin@example.com",
            password_hash=hash_password("ExamplePassword123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        token = create_access_token(admin.id, UserRole.ADMIN)
    return {"Authorization": f"Bearer {token}"}


def _user_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Kitchen Staff",
            "email": "food-staff@example.com",
            "password": "ExamplePassword123",
            "role": "KITCHEN_STAFF",
        },
    )
    assert response.status_code == 201
    login = client.post(
        "/api/v1/auth/login",
        json={
            "email": "food-staff@example.com",
            "password": "ExamplePassword123",
        },
    )
    assert login.status_code == 200
    return {"Authorization": f"Bearer {login.json()['access_token']}"}


def _food_payload(
    name: str,
    *,
    category: str = "rice",
    serving_unit: str = "serving",
    is_vegetarian: bool = True,
) -> dict[str, object]:
    return {
        "name": name,
        "category": category,
        "serving_unit": serving_unit,
        "is_vegetarian": is_vegetarian,
        "default_servings_per_person": 1,
        "ingredients_per_serving": [
            {"name": "Raw rice", "quantity": 75, "unit": "g"},
            {"name": "Water", "quantity": 150, "unit": "ml"},
        ],
    }


def _create_food(
    client: TestClient,
    headers: dict[str, str],
    name: str,
    *,
    category: str = "rice",
    serving_unit: str = "serving",
    is_vegetarian: bool = True,
) -> dict[str, object]:
    response = client.post(
        "/api/v1/food-items",
        headers=headers,
        json=_food_payload(
            name,
            category=category,
            serving_unit=serving_unit,
            is_vegetarian=is_vegetarian,
        ),
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_food_catalogue_listing_filters_and_pagination(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    _create_food(client, admin_headers, "Steamed Rice")
    _create_food(client, admin_headers, "Biryani")
    _create_food(
        client,
        admin_headers,
        "Chapati",
        category="bread",
        serving_unit="piece",
    )
    _create_food(
        client,
        admin_headers,
        "Vegetable Curry",
        category="curry",
    )
    _create_food(
        client,
        admin_headers,
        "Chicken Curry",
        category="curry",
        is_vegetarian=False,
    )
    headers = _user_headers(client)

    rice = client.get(
        "/api/v1/food-items",
        headers=headers,
        params={"search": "r", "category": "RICE"},
    )
    non_vegetarian = client.get(
        "/api/v1/food-items",
        headers=headers,
        params={"is_vegetarian": False, "category": "Curry"},
    )
    pieces = client.get(
        "/api/v1/food-items",
        headers=headers,
        params={"serving_unit": "piece"},
    )
    paged = client.get(
        "/api/v1/food-items",
        headers=headers,
        params={"limit": 1, "offset": 1},
    )

    assert rice.json()["total"] == 2
    assert [item["name"] for item in rice.json()["items"]] == [
        "Biryani",
        "Steamed Rice",
    ]
    assert non_vegetarian.json()["total"] == 1
    assert non_vegetarian.json()["items"][0]["name"] == "Chicken Curry"
    assert pieces.json()["items"][0]["serving_unit"] == "piece"
    assert paged.json()["total"] == 5
    assert len(paged.json()["items"]) == 1


def test_food_details_require_authentication_and_return_not_found(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    item = _create_food(client, admin_headers, "Steamed Rice")
    user_headers = _user_headers(client)

    detail = client.get(
        f"/api/v1/food-items/{item['id']}",
        headers=user_headers,
    )
    unauthorized = client.get(f"/api/v1/food-items/{item['id']}")
    missing = client.get("/api/v1/food-items/99999", headers=user_headers)

    assert detail.status_code == 200
    assert detail.json()["ingredients_per_serving"][0] == {
        "name": "Raw rice",
        "quantity": 75.0,
        "unit": "g",
    }
    assert unauthorized.status_code == 401
    assert missing.status_code == 404


def test_food_creation_is_admin_only_and_case_insensitively_unique(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    user_headers = _user_headers(client)
    created = client.post(
        "/api/v1/food-items",
        headers=admin_headers,
        json=_food_payload("Steamed Rice"),
    )
    duplicate = client.post(
        "/api/v1/food-items",
        headers=admin_headers,
        json=_food_payload("STEAMED RICE"),
    )
    forbidden = client.post(
        "/api/v1/food-items",
        headers=user_headers,
        json=_food_payload("Poha"),
    )

    assert created.status_code == 201
    assert duplicate.status_code == 409
    assert forbidden.status_code == 403
    assert "password_hash" not in created.json()


@pytest.mark.parametrize(
    "invalid_ingredient",
    [
        {"name": "Rice", "quantity": 0, "unit": "g"},
        {"name": "Rice", "quantity": 1, "unit": "cup"},
        {
            "name": "Rice",
            "quantity": 1,
            "unit": "g",
            "unexpected": True,
        },
    ],
)
def test_food_creation_validates_recipe_ingredients(
    client: TestClient,
    invalid_ingredient: dict[str, object],
) -> None:
    payload = _food_payload("Rice")
    payload["ingredients_per_serving"] = [invalid_ingredient]

    response = client.post(
        "/api/v1/food-items",
        headers=_admin_headers(),
        json=payload,
    )

    assert response.status_code == 422


def test_food_creation_rejects_duplicate_ingredients_and_unknown_fields(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    duplicate_ingredients = _food_payload("Rice")
    duplicate_ingredients["ingredients_per_serving"] = [
        {"name": "Rice", "quantity": 10, "unit": "g"},
        {"name": " rice ", "quantity": 5, "unit": "g"},
    ]
    protected = {**_food_payload("Chapati"), "id": 123}

    duplicate = client.post(
        "/api/v1/food-items",
        headers=admin_headers,
        json=duplicate_ingredients,
    )
    extra_field = client.post(
        "/api/v1/food-items",
        headers=admin_headers,
        json=protected,
    )

    assert duplicate.status_code == 422
    assert extra_field.status_code == 422


def _insert_historical_reference(
    db: Session,
    food_item_id: int,
    history: Literal["forecast", "meal_record", "waste_log"],
) -> None:
    user = User(
        name="Kitchen Manager",
        email=f"{history}@example.com",
        password_hash="not-used",
        role=UserRole.KITCHEN_STAFF,
    )
    db.add(user)
    db.flush()
    kitchen = Kitchen(
        manager_id=user.id,
        name="Test Kitchen",
        address="Test Address",
        latitude=0,
        longitude=0,
        phone="1234567890",
    )
    db.add(kitchen)
    db.flush()

    if history == "forecast":
        forecast = Forecast(
            kitchen_id=kitchen.id,
            meal_date=date(2026, 1, 1),
            meal_type=MealType.LUNCH,
            expected_people=1,
        )
        db.add(forecast)
        db.flush()
        db.add(
            ForecastItem(
                forecast_id=forecast.id,
                food_item_id=food_item_id,
                predicted_servings=1,
                recommended_servings=1,
                prediction_method=PredictionMethod.BASELINE,
            )
        )
    elif history == "meal_record":
        meal_record = MealRecord(
            kitchen_id=kitchen.id,
            meal_date=date(2026, 1, 1),
            meal_type=MealType.LUNCH,
            actual_people=1,
        )
        db.add(meal_record)
        db.flush()
        db.add(
            MealRecordItem(
                meal_record_id=meal_record.id,
                food_item_id=food_item_id,
                prepared_servings=1,
                leftover_servings=0,
                shortage_occurred=False,
            )
        )
    else:
        db.add(
            WasteLog(
                kitchen_id=kitchen.id,
                food_item_id=food_item_id,
                confirmed_servings=1,
                waste_type=WasteType.UNSERVED_SURPLUS,
                prepared_at=datetime.now(timezone.utc),
                safety_status=SafetyStatus.PENDING,
            )
        )
    db.commit()


@pytest.mark.parametrize("history", ["forecast", "meal_record", "waste_log"])
def test_serving_unit_cannot_change_after_historical_use(
    client: TestClient,
    history: Literal["forecast", "meal_record", "waste_log"],
) -> None:
    admin_headers = _admin_headers()
    item = _create_food(client, admin_headers, "Steamed Rice")
    with _test_session() as db:
        _insert_historical_reference(db, item["id"], history)

    unchanged = client.patch(
        f"/api/v1/food-items/{item['id']}",
        headers=admin_headers,
        json={"serving_unit": "serving"},
    )
    forbidden_change = client.patch(
        f"/api/v1/food-items/{item['id']}",
        headers=admin_headers,
        json={"serving_unit": "piece"},
    )

    assert unchanged.status_code == 200
    assert forbidden_change.status_code == 409


def test_food_item_updates_are_partial_and_protect_system_fields(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    item = _create_food(client, admin_headers, "Steamed Rice")
    updated = client.patch(
        f"/api/v1/food-items/{item['id']}",
        headers=admin_headers,
        json={"category": "rice-main"},
    )
    protected = client.patch(
        f"/api/v1/food-items/{item['id']}",
        headers=admin_headers,
        json={"created_at": "2026-01-01T00:00:00Z"},
    )
    missing = client.patch(
        "/api/v1/food-items/99999",
        headers=admin_headers,
        json={"category": "rice"},
    )

    assert updated.status_code == 200
    assert updated.json()["category"] == "rice-main"
    assert protected.status_code == 422
    assert missing.status_code == 404


def test_ingredient_calculation_endpoint_handles_servings_pieces_and_zero(
    client: TestClient,
) -> None:
    admin_headers = _admin_headers()
    rice = _create_food(client, admin_headers, "Steamed Rice")
    chapati = _create_food(
        client,
        admin_headers,
        "Chapati",
        category="bread",
        serving_unit="piece",
    )
    user_headers = _user_headers(client)

    calculated = client.post(
        f"/api/v1/food-items/{rice['id']}/ingredients/calculate",
        headers=user_headers,
        json={"quantity": 190},
    )
    zero = client.post(
        f"/api/v1/food-items/{rice['id']}/ingredients/calculate",
        headers=user_headers,
        json={"quantity": 0},
    )
    fractional_piece = client.post(
        f"/api/v1/food-items/{chapati['id']}/ingredients/calculate",
        headers=user_headers,
        json={"quantity": 1.5},
    )

    assert calculated.status_code == 200
    assert calculated.json()["ingredients"] == [
        {"name": "Raw rice", "quantity": 14.25, "unit": "kg"},
        {"name": "Water", "quantity": 28.5, "unit": "l"},
    ]
    assert zero.status_code == 200
    assert [item["quantity"] for item in zero.json()["ingredients"]] == [0, 0]
    assert fractional_piece.status_code == 422


def test_seed_food_catalogue_is_idempotent_and_preserves_custom_recipes(
    client: TestClient,
) -> None:
    with _test_session() as db:
        custom_idli = FoodItem(
            name="Idli",
            category="custom",
            serving_unit=ServingUnit.PIECE,
            is_vegetarian=True,
            default_servings_per_person=4,
            ingredients_per_serving=[
                {"name": "Custom batter", "quantity": 50, "unit": "g"}
            ],
        )
        db.add(custom_idli)
        db.commit()

        inserted, skipped = food_seed.seed_food_catalogue(db)
        assert inserted == 19
        assert skipped == 1

        inserted_again, skipped_again = food_seed.seed_food_catalogue(db)
        saved_idli = db.scalar(select(FoodItem).where(FoodItem.name == "Idli"))

    assert inserted_again == 0
    assert skipped_again == 20
    assert saved_idli is not None
    assert saved_idli.category == "custom"
    assert saved_idli.default_servings_per_person == 4


def test_admin_configures_menu_roles_and_compatibility(client):
    headers = _admin_headers()
    base = {"category": "menu", "serving_unit": "serving", "is_vegetarian": True,
            "default_servings_per_person": 1}
    route = "/api/v1/food-items"
    main = client.post(route, headers=headers, json=base | {
        "name": "Rice", "food_role": "MAIN_DISH",
    }).json()
    result = client.post(route, headers=headers, json=base | {
        "name": "Sambar", "food_role": "ACCOMPANIMENT", "uptake_rate": 0.6,
        "compatible_main_food_item_ids": [main["id"]],
    })
    assert result.status_code == 201, result.text
    assert result.json()["compatible_main_food_item_ids"] == [main["id"]]
    assert client.patch(f"{route}/{main['id']}", headers=headers,
                        json={"food_role": "SIDE_DISH"}).status_code == 422
