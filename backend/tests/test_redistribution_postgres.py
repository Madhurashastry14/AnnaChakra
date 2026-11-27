import os
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from threading import Barrier
from uuid import uuid4

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.core.database import Base, engine
from app.models.donation import Donation
from app.models.organization import NGORequirement
from app.schemas.redistribution import OfferRequest
from app.services.donations import create_offer
from app.services.ngo_requirements import local_date
from test_redistribution import configure_policy, seed_participants, utcnow


@pytest.mark.skipif(os.getenv("FORECAST_TEST_POSTGRES") != "1", reason="Requires PostgreSQL")
@pytest.mark.parametrize("share_capacity", [True, False])
def test_concurrent_offer_reservations(monkeypatch, share_capacity):
    configure_policy(monkeypatch)
    assert engine.dialect.name == "postgresql"
    schema = "redistribution_test_" + uuid4().hex
    with engine.begin() as conn:
        conn.exec_driver_sql(f'CREATE SCHEMA "{schema}"')
    isolated = create_engine(engine.url, connect_args={"options": f"-c search_path={schema} -c lock_timeout=5000"})
    try:
        Base.metadata.create_all(isolated)
        with Session(isolated) as db:
            seed_participants(db)
            now = utcnow()
            requirements = [
                NGORequirement(ngo_id=1, people_to_feed=20, remaining_capacity=0, capacity_servings=0,
                               capacity_pieces=25 if share_capacity else 50,
                               required_date=local_date(now), available_until=now + timedelta(hours=2))
                for _ in range(2)
            ]
            db.add_all(requirements)
            db.flush()
            first, second = (row.id for row in requirements)
            db.commit()
        requests = [(first, 1), (first, 3)] if share_capacity else [(first, 1), (second, 1)]
        barrier = Barrier(2)

        def attempt(pair):
            requirement_id, waste_id = pair
            with Session(isolated) as db:
                request = OfferRequest(requirement_id=requirement_id, items=[
                    {"waste_log_id": waste_id, "offered_servings": 20 if share_capacity else 30},
                ])
                barrier.wait(timeout=10)
                try:
                    create_offer(db, 1, request)
                    return 201
                except HTTPException as exc:
                    db.rollback()
                    return exc.status_code

        with ThreadPoolExecutor(max_workers=2) as pool:
            assert sorted(pool.map(attempt, requests)) == [201, 409]
        with Session(isolated) as db:
            assert db.scalar(select(func.count()).select_from(Donation)) == 1
    finally:
        isolated.dispose()
        with engine.begin() as conn:
            conn.exec_driver_sql(f'DROP SCHEMA "{schema}" CASCADE')
