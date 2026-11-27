"""Opt-in PostgreSQL smoke test with transactional schema isolation."""
import io
import os
from datetime import date, timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from app.core.database import engine, get_db
from app.core.security import create_access_token
from app.main import app
from app.models.enums import UserRole
from app.models.food import FoodItem
from app.models.organization import Kitchen
from app.models.user import User
from scripts.seed_food_items import seed_food_catalogue
from sqlalchemy import select


@pytest.mark.skipif(os.getenv("FORECAST_TEST_POSTGRES") != "1", reason="Requires PostgreSQL")
def test_migrated_postgres_forecast_and_retraining_extraction(monkeypatch):
    from ml.forecasting.retrain import extract_records, retrain

    assert engine.dialect.name == "postgresql"
    backend = Path(__file__).resolve().parents[1]
    output = io.StringIO()
    config = Config(str(backend / "alembic.ini"), output_buffer=output)
    config.set_main_option("script_location", str(backend / "alembic"))
    command.upgrade(config, "head", sql=True)
    migration_sql = "\n".join(line for line in output.getvalue().splitlines()
                             if line.strip() not in {"BEGIN;", "COMMIT;"})
    schema = "forecast_test_" + uuid4().hex
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
            connection.exec_driver_sql(f'SET LOCAL search_path TO "{schema}"')
            connection.exec_driver_sql(migration_sql, execution_options={"no_parameters": True})
            factory = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")
            with factory.begin() as session:
                user = User(name="Test staff", email="forecast-test@example.invalid",
                            password_hash="unused", role=UserRole.KITCHEN_STAFF)
                session.add(user)
                session.flush()
                session.add(Kitchen(manager_id=user.id, name="Test kitchen", address="Local",
                                    latitude=0, longitude=0, phone="1234"))
                user_id = user.id
            with factory() as session:
                seed_food_catalogue(session)
                food_id = session.scalar(select(FoodItem.id).where(FoodItem.name == "Steamed Rice"))

            def get_session():
                with factory() as session:
                    yield session

            token = create_access_token(user_id, UserRole.KITCHEN_STAFF)
            monkeypatch.setitem(app.dependency_overrides, get_db, get_session)
            with TestClient(app) as client:
                assert client.get("/api/v1/forecasts").status_code == 401
                client.headers["Authorization"] = f"Bearer {token}"
                meal_date = date.today() - timedelta(days=1)
                menu = {"meal_date": meal_date.isoformat(), "meal_type": "LUNCH",
                        "expected_people": 100, "food_item_ids": [food_id]}
                response = client.post("/api/v1/forecasts", json=menu)
                assert response.status_code == 201, response.text
                forecast = response.json()
                assert forecast["items"][0]["prediction_method"] == "BASELINE"
                response = client.post("/api/v1/meal-records", json={
                    "forecast_id": forecast["id"], "meal_date": menu["meal_date"],
                    "meal_type": "LUNCH", "actual_people": 90, "items": [{
                        "food_item_id": food_id, "prepared_servings": 100, "leftover_servings": 25,
                        "shortage_occurred": False,
                    }],
                })
                assert response.status_code == 201, response.text
                assert response.json()["items"][0]["served_servings"] == 75
                assert response.json()["menu_mode"] == "CHOICE_BASED"
                latest = client.post("/api/v1/forecasts", json=menu | {
                    "meal_date": date.today().isoformat(),
                })
                assert latest.status_code == 201, latest.text
                assert latest.json()["items"][0]["prediction_method"] == "LOCAL_HISTORY"
                meal_item_id = response.json()["items"][0]["id"]
                waste = client.post("/api/v1/waste-logs", json={
                    "food_item_id": food_id, "meal_record_item_id": meal_item_id,
                    "confirmed_servings": 15, "waste_type": "UNSERVED_SURPLUS",
                })
                assert waste.status_code == 201, waste.text
                assert waste.json()["safety_status"] == "PENDING"
                assert client.post("/api/v1/waste-logs", json={
                    "food_item_id": food_id, "meal_record_item_id": meal_item_id,
                    "confirmed_servings": 11, "waste_type": "UNSERVED_SURPLUS",
                }).status_code == 409

            with factory() as session:
                records = extract_records(session)
                assert len(records) == 1
                assert records.iloc[0].expected_people == 100
                assert records.iloc[0].menu_mode == "CHOICE_BASED"
            assert "Insufficient" in retrain(factory)
        finally:
            transaction.rollback()
