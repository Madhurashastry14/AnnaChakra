import os
from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session

from app.core.database import Base, engine
from app.models.food import FoodItem
from app.models.meal_record import MealRecord, MealRecordItem
from app.models.organization import Kitchen
from app.models.user import User
from app.models.vision import VisionPrediction
from app.models.waste import WasteLog
from app.schemas.waste import WasteRequest
from app.services.waste import save_waste


@pytest.mark.skipif(os.getenv("FORECAST_TEST_POSTGRES") != "1", reason="Requires PostgreSQL")
def test_concurrent_writers_cannot_duplicate_images_or_exceed_leftover_balance():
    assert engine.dialect.name == "postgresql"
    schema = "waste_race_" + uuid4().hex
    with engine.begin() as connection:
        connection.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    isolated = create_engine(engine.url, connect_args={"options": f"-c search_path={schema} -c lock_timeout=5000"})
    try:
        Base.metadata.create_all(isolated)
        with Session(isolated) as session:
            user = User(name="Test Kitchen Staff", email="race@example.invalid",
                        password_hash="unused", role="KITCHEN_STAFF")
            food = FoodItem(name="Chapati", category="main", serving_unit="piece",
                            is_vegetarian=True, default_servings_per_person=3)
            session.add_all([user, food])
            session.flush()
            kitchen = Kitchen(manager_id=user.id, name="Test kitchen", address="Local",
                              latitude=0, longitude=0, phone="1234")
            session.add(kitchen)
            session.flush()
            meal = MealRecord(kitchen_id=kitchen.id, actual_people=10, meal_date=date.today(), meal_type="LUNCH")
            session.add(meal)
            session.flush()
            item = MealRecordItem(meal_record_id=meal.id, food_item_id=food.id, prepared_servings=20,
                                  leftover_servings=5, shortage_occurred=False)
            session.add(item)
            refs = [uuid4().hex, uuid4().hex]
            for reference in refs:
                session.add(VisionPrediction(id=reference, kitchen_id=kitchen.id, image_format="PNG",
                                             result={"image_digest": "identical-test-pixels"}))
            session.flush()
            kitchen_id, food_id, item_id = kitchen.id, food.id, item.id
            session.commit()

        def race(bodies):
            barrier = Barrier(2)

            def attempt(body):
                with Session(isolated) as session:
                    kitchen = session.get(Kitchen, kitchen_id)
                    request = WasteRequest(food_item_id=food_id, confirmed_servings=4,
                                           waste_type="UNSERVED_SURPLUS", **body)
                    barrier.wait(timeout=10)
                    try:
                        save_waste(session, kitchen, request)
                        return 201
                    except HTTPException as exc:
                        session.rollback()
                        return exc.status_code

            with ThreadPoolExecutor(max_workers=2) as workers:
                return sorted(workers.map(attempt, bodies))

        assert race([{"meal_record_item_id": item_id}] * 2) == [201, 409]
        assert race([{"prediction_id": reference} for reference in refs]) == [201, 409]
        with Session(isolated) as session:
            assert len(list(session.scalars(select(WasteLog)))) == 2
    finally:
        isolated.dispose()
        # Only this test's randomly generated schema contains its disposable fixtures.
        with engine.begin() as connection:
            connection.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
