from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.dependencies import get_current_active_user
from app.core.security import create_access_token
from app.main import app
from app.models.donation import Donation
from app.models.enums import UserRole
from app.models.food import FoodItem
from app.models.organization import DeliveryPersonnel, Kitchen, NGO, NGORequirement
from app.models.user import User
from app.models.waste import WasteLog
from app.services.matching import distance_between, haversine, score_match, travel_minutes
from app.services.ngo_requirements import local_date
from app.services.safety import SafetyPolicy
from test_forecasts import sqlite_jsonb

POLICY = {
    "version": "test-holding-v1", "authority_reference": "Isolated software fixture",
    "rules": {"chapati": {"storage_method": "HOT_HOLDING", "max_holding_minutes": 180,
                        "max_uncontrolled_minutes": 0, "max_measurement_age_minutes": 90,
                        "min_temperature_c": 65}},
}
REQ = "/api/v1/ngo-requirements"
DON = "/api/v1/donations"


def utcnow():
    return datetime.now(timezone.utc)


def evidence(prepared, measured=None):
    return {"unserved_confirmed": True, "storage_verified": True, "contamination_suspected": False,
            "storage_method": "HOT_HOLDING", "temperature_history_started_at": prepared.isoformat(),
            "temperature_measured_at": (measured or utcnow() - timedelta(minutes=1)).isoformat(),
            "temperature_history_min_c": 66, "temperature_history_max_c": 69,
            "temperature_history_reference": "test-record", "uncontrolled_minutes": 0}


def seed_participants(db):
    now = utcnow()
    roles = [UserRole.KITCHEN_STAFF, UserRole.NGO_MANAGER, UserRole.NGO_MANAGER,
             UserRole.KITCHEN_STAFF, UserRole.ADMIN]
    db.add_all([User(id=i, name=f"User {i}", email=f"test{i}@example.com", password_hash="unused", role=role)
                for i, role in enumerate(roles, 1)])
    db.flush()
    org = dict(address="Test location", latitude=12.1, longitude=76.7, phone="1234",
               verification_status="VERIFIED")
    db.add_all([Kitchen(id=1, manager_id=1, name="Kitchen", **org),
                Kitchen(id=2, manager_id=4, name="Other Kitchen", **org),
                NGO(id=1, manager_id=2, name="NGO", **org),
                NGO(id=2, manager_id=3, name="Other NGO", **org)])
    db.add(FoodItem(id=1, name="Chapati", category="bread", serving_unit="piece",
                    is_vegetarian=True, default_servings_per_person=3))
    db.flush()
    db.add_all([DeliveryPersonnel(id=1, kitchen_id=1, name="Driver", phone="1234"),
                DeliveryPersonnel(id=2, kitchen_id=2, name="Other driver", phone="1234")])
    prepared = now - timedelta(minutes=10)
    for i, kind in enumerate(("UNSERVED_SURPLUS", "PLATE_WASTE", "UNSERVED_SURPLUS"), 1):
        db.add(WasteLog(id=i, kitchen_id=1, food_item_id=1, confirmed_servings=50,
                        waste_type=kind, prepared_at=prepared, safe_handling_confirmed=True,
                        storage_temperature=67, safety_evidence=evidence(prepared),
                        screened_at=now, safety_status="ELIGIBLE", safety_policy_version=POLICY["version"],
                        safe_until=now + timedelta(minutes=70)))
    db.commit()
    return prepared


def configure_policy(monkeypatch):
    policy = SafetyPolicy.model_validate(POLICY)
    monkeypatch.setattr(settings, "APP_ENV", "test")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", None)
    monkeypatch.setattr("app.services.waste.current_policy", lambda: policy)
    return policy


@pytest.fixture
def redistribution(monkeypatch):
    configure_policy(monkeypatch)
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        prepared = seed_participants(db)
    actor = {"id": 1}

    def session():
        with Session(engine) as db:
            yield db

    def user():
        with Session(engine) as db:
            return db.get(User, actor["id"])

    monkeypatch.setitem(app.dependency_overrides, get_db, session)
    monkeypatch.setitem(app.dependency_overrides, get_current_active_user, user)
    with TestClient(app) as client:
        yield client, actor, engine, prepared
    engine.dispose()


def requirement(client, actor, **changes):
    actor["id"] = 2
    now = utcnow()
    body = {"people_to_feed": 10, "capacity_pieces": 25, "required_date": local_date(now).isoformat(),
            "available_until": (now + timedelta(hours=2)).isoformat(), "accepted_categories": ["bread"]}
    response = client.post(REQ, json=body | changes)
    assert response.status_code == 201, response.text
    actor["id"] = 1
    return response.json()


def offer(client, req_id, quantity=20, waste_log_id=1):
    return client.post(DON, json={"requirement_id": req_id, "items": [
        {"waste_log_id": waste_log_id, "offered_servings": quantity},
    ]})


def test_requirement_ownership_diet_and_matches(redistribution):
    client, actor, engine, _ = redistribution
    req = requirement(client, actor, capacity_pieces=15)
    capacity_only_servings = requirement(client, actor, capacity_pieces=0, capacity_servings=100)
    assert capacity_only_servings["remaining_capacity_by_unit"] == {"piece": 0, "serving": 100}
    assert client.get(REQ).status_code == 403
    actor["id"] = 3
    assert client.get(f"{REQ}/{req['id']}").status_code == 404
    actor["id"] = 2
    assert client.patch(f"{REQ}/{req['id']}", json={"people_to_feed": 0}).status_code == 422
    assert client.patch(f"{REQ}/{req['id']}", json={"available_until": "2020-01-01T18:00:00Z"}).status_code == 422
    assert client.get(f"{REQ}/{req['id']}").json()["remaining_capacity_by_unit"]["piece"] == 15
    actor["id"] = 1
    matches = client.post("/api/v1/matches", json={"waste_log_ids": [1, 2]}).json()
    assert matches["total"] == 1
    candidate = matches["items"][0]
    assert candidate["suggested_allocation"][0]["offered_servings"] == 15
    assert candidate["score_components"]["compatibility"] == 50
    assert 0 <= candidate["match_score"] <= 100
    excluded = next(row for row in matches["exclusions"] if row["requirement_id"] == capacity_only_servings["id"])
    assert excluded["batches"][0]["reasons"] == ["No remaining piece capacity."]
    assert matches["unavailable_batches"][0]["reasons"] == ["Plate waste cannot be redistributed."]
    assert any(row["requirement_id"] is None for row in matches["exclusions"])
    assert client.post("/api/v1/matches", json={"waste_log_ids": [1, 1]}).status_code == 422
    assert offer(client, req["id"], 1.5).status_code == 422
    assert offer(client, req["id"], waste_log_id=2).status_code == 409
    assert [row["waste_log_id"] for row in client.get("/api/v1/waste-logs/available-surplus").json()] == [1, 3]
    with Session(engine) as db:
        ngo = db.get(NGO, 1)
        ngo.verification_status = "PENDING"
        db.commit()
    result = client.post("/api/v1/matches", json={"waste_log_ids": [1]}).json()
    assert result["total"] == 0
    assert "NGO verification is pending." in result["exclusions"][0]["reasons"]


def test_match_availability_at_local_midnight_and_delivery_cutoff(redistribution, monkeypatch):
    client, actor, engine, _ = redistribution
    req = requirement(client, actor)
    monkeypatch.setattr(settings, "REDISTRIBUTION_TIMEZONE", "Asia/Kolkata")
    now = datetime(2030, 1, 1, 18, 30, tzinfo=timezone.utc)
    monkeypatch.setattr("app.services.matching.now_utc", lambda: now)
    with Session(engine) as db:
        kitchen, ngo = db.get(Kitchen, 1), db.get(NGO, 1)
        arrival = now + timedelta(minutes=travel_minutes(distance_between(kitchen, ngo)))
        row = db.get(NGORequirement, req["id"])
        row.required_date = local_date(now)
        row.available_until = arrival
        db.commit()
    response = client.post("/api/v1/matches", json={"waste_log_ids": [1]}).json()
    assert response["total"] == 0
    assert response["exclusions"][0]["reasons"][0].startswith("Estimated delivery takes")
    with Session(engine) as db:
        db.get(NGORequirement, req["id"]).available_until = arrival + timedelta(seconds=1)
        db.commit()
    response = client.post("/api/v1/matches", json={"waste_log_ids": [1]}).json()
    assert response["total"] == 1


def test_exact_food_restriction_applies_to_matches_and_offers(redistribution):
    client, actor, engine, _ = redistribution
    req = requirement(client, actor, accepted_categories=["  CHAPATI  "])
    with Session(engine) as db:
        other = FoodItem(name="Roti", category="bread", serving_unit="piece", is_vegetarian=True,
                         default_servings_per_person=1)
        db.add(other)
        db.flush()
        db.get(WasteLog, 3).food_item_id = other.id
        db.commit()
    result = client.post("/api/v1/matches", json={"waste_log_ids": [1, 3]}).json()
    assert [row["waste_log_id"] for row in result["items"][0]["suggested_allocation"]] == [1]
    assert offer(client, req["id"], waste_log_id=3).status_code == 409
    assert offer(client, req["id"]).status_code == 201


def test_full_lifecycle_partial_receipt_and_analytics(redistribution):
    client, actor, _, prepared = redistribution
    req = requirement(client, actor)
    response = offer(client, req["id"])
    assert response.status_code == 201, response.text
    donation = response.json()
    path = f"{DON}/{donation['id']}"
    assert offer(client, req["id"], 10, 3).status_code == 409
    assert client.post(path + "/accept").status_code == 403
    actor["id"] = 3
    assert client.get(path).status_code == 404
    assert client.post(path + "/accept").status_code == 404
    actor["id"] = 2
    accepted = client.post(path + "/accept")
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["accepted_at"]
    assert client.patch(f"{REQ}/{req['id']}", json={"capacity_pieces": 19}).status_code == 409
    assert client.delete(f"{REQ}/{req['id']}").status_code == 204
    actor["id"] = 1
    assert client.post(path + "/assign-delivery", json={"delivery_person_id": 2}).status_code == 404
    assigned = client.post(path + "/assign-delivery", json={"delivery_person_id": 1})
    assert assigned.status_code == 200, assigned.text
    delivery_id = assigned.json()["delivery"]["id"]
    assert client.post(f"/api/v1/deliveries/{delivery_id}/dispatch").json()["status"] == "IN_TRANSIT"
    assert client.post(path + "/cancel", json={"reason": "Late"}).status_code == 409
    assert client.post(f"/api/v1/deliveries/{delivery_id}/mark-delivered").json()["status"] == "DELIVERED"
    actor["id"] = 2
    receipt = {"inspected": True, "items": [
        {"donation_item_id": donation["items"][0]["id"], "received_servings": 12,
         "rejection_reason": "Eight pieces declined"},
    ]}
    result = client.post(path + "/confirm-receipt", json=receipt)
    assert result.status_code == 200, result.text
    assert result.json()["status"] == "COMPLETED"
    assert client.post(path + "/confirm-receipt", json=receipt).status_code == 409
    assert client.get(f"{REQ}/{req['id']}").json()["remaining_capacity_by_unit"]["piece"] == 13
    impact = client.get("/api/v1/analytics/redistribution-summary").json()
    assert impact["quantities"][0]["received_quantity"] == 12
    assert impact["quantities"][0]["serving_unit"] == "piece" and impact["ngos_served"] == 1
    actor["id"] = 3
    assert client.get("/api/v1/analytics/redistribution-summary").json()["quantities"] == []
    actor["id"] = 1
    available = client.get("/api/v1/waste-logs/available-surplus").json()
    assert 1 not in {batch["waste_log_id"] for batch in available}
    assert client.get("/api/v1/waste-logs/1").json()["available_servings"] == 0
    actor["id"] = 5
    assert len(client.get(DON, params={"ngo_id": 1, "status": "COMPLETED"}).json()) == 1


def test_expiration_rejection_and_failed_delivery_release(redistribution):
    client, actor, engine, _ = redistribution
    req = requirement(client, actor)
    first = offer(client, req["id"]).json()
    with Session(engine) as db:
        db.get(Donation, first["id"]).expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert client.get(f"{DON}/{first['id']}").json()["expired"]
    second = offer(client, req["id"])
    assert second.status_code == 201, second.text
    actor["id"] = 2
    assert client.post(f"{DON}/{first['id']}/accept").status_code == 409
    assert client.post(f"{DON}/{second.json()['id']}/reject", json={"reason": "No storage"}).status_code == 200
    actor["id"] = 1
    third = offer(client, req["id"]).json()
    path = f"{DON}/{third['id']}"
    actor["id"] = 2
    assert client.post(path + "/accept").status_code == 200
    actor["id"] = 1
    assert client.post(path + "/assign", json={"delivery_person_id": 1}).status_code == 200
    assert client.post(path + "/dispatch").status_code == 200
    assert client.post(path + "/report-failure", json={"reason": "Transport incident"}).status_code == 200
    assert client.get(path).json()["failed_at"]
    assert client.get("/api/v1/waste-logs/available-surplus").json()[0]["available_quantity"] == 30
    actor["id"] = 2
    assert client.get(f"{REQ}/{req['id']}").json()["remaining_capacity_by_unit"]["piece"] == 25


def test_policy_isolation_and_deadline(redistribution, monkeypatch):
    client, actor, engine, _ = redistribution
    req = requirement(client, actor, accepts_vegetarian=False, accepts_non_vegetarian=True)
    assert client.post("/api/v1/matches", json={"waste_log_ids": [1]}).json()["total"] == 0
    req = requirement(client, actor)
    with Session(engine) as db:
        db.get(WasteLog, 1).safe_until = utcnow() + timedelta(minutes=5)
        db.commit()
    assert offer(client, req["id"]).status_code == 409
    monkeypatch.setattr("app.services.waste.current_policy", lambda: None)
    assert client.get("/api/v1/waste-logs/available-surplus").json()
    demo = SafetyPolicy.model_validate(POLICY | {"version": "demo-v1"})
    monkeypatch.setattr("app.services.waste.current_policy", lambda: demo)
    assert client.get("/api/v1/waste-logs/available-surplus").json()
    monkeypatch.setattr(settings, "APP_ENV", "demo")
    assert client.get("/api/v1/waste-logs/available-surplus").status_code == 403


def test_distance_and_score():
    assert haversine(0, 0, 0, 1) == pytest.approx(111.195, rel=0.0001)
    with pytest.raises(ValueError):
        haversine(95, 0, 0, 1)
    score, components = score_match(0, 15, 1, 90, 0.5)
    assert score == pytest.approx(82.5)
    assert components == {"proximity": 100, "compatibility": 100, "urgency": 50,
                          "capacity_utilization": 50}


def test_demo_seeder_isolated_and_idempotent(redistribution, monkeypatch):
    from sqlalchemy import func, select
    from scripts.seed_redistribution_demo import seed, validate_target

    _, _, test_engine, _ = redistribution
    with pytest.raises(ValueError, match="dedicated"):
        validate_target()
    monkeypatch.setattr(settings, "APP_ENV", "demo")
    monkeypatch.setattr(settings, "DATABASE_URL", "postgresql+psycopg://localhost/annachakra_demo_check")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", None)
    validate_target()
    with Session(test_engine) as db:
        assert seed(db, "test-password-for-demo", "example")
        assert not seed(db, "different-test-password", "example")
        assert db.scalar(select(func.count()).select_from(Donation).where(Donation.is_simulated)) == 6
        assert db.scalar(select(func.count()).select_from(WasteLog).where(WasteLog.is_simulated)) == 7

def test_simulated_redistribution_without_policy(monkeypatch):
    monkeypatch.setattr(settings, "APP_ENV", "demo")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", None)
    engine = create_engine("sqlite://", poolclass=StaticPool, connect_args={"check_same_thread": False})
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        seed_participants(db)
        db.get(Kitchen, 1).is_simulated = True
        db.get(NGO, 1).is_simulated = True
        # A preexisting simulated fixture has only its persisted deadline.
        db.get(WasteLog, 1).is_simulated = True
        db.commit()

    def session():
        with Session(engine) as db:
            yield db

    def auth(user_id, role):
        return {"Authorization": "Bearer " + create_access_token(user_id, role)}

    kitchen = auth(1, UserRole.KITCHEN_STAFF)
    ngo = auth(2, UserRole.NGO_MANAGER)
    other_kitchen = auth(4, UserRole.KITCHEN_STAFF)
    other_ngo = auth(3, UserRole.NGO_MANAGER)
    monkeypatch.setitem(app.dependency_overrides, get_db, session)
    waste = "/api/v1/waste-logs"
    surplus = waste + "/available-surplus"
    now = utcnow()
    declaration = {"food_item_id": 1, "confirmed_servings": 20, "waste_type": "UNSERVED_SURPLUS",
                   "unserved_confirmed": True, "safe_handling_confirmed": True,
                   "contamination_suspected": False, "discard_at": (now + timedelta(hours=1)).isoformat()}
    with TestClient(app) as client:
        assert client.post(waste, json=declaration).status_code == 401
        assert client.get("/api/v1/kitchens/me", headers=kitchen).json()["is_simulated"]
        real = client.post(waste, headers=other_kitchen, json=declaration)
        assert real.status_code == 201 and real.json()["available_servings"] == 20
        created = client.post(waste, headers=kitchen, json=declaration)
        assert created.status_code == 201, created.text
        batch = created.json()
        assert batch["is_simulated"] and batch["available_servings"] == 20
        excluded = client.post(waste, headers=kitchen, json=declaration | {"waste_type": "PLATE_WASTE"})
        assert excluded.status_code == 201, excluded.text
        assert excluded.json()["available_servings"] == 0
        assert excluded.json()["safety_status"] == "INELIGIBLE"
        for allowed in ({"unserved_confirmed": False}, {"contamination_suspected": True},
                        {"safe_handling_confirmed": False}, {"discard_at": None},
                        {"discard_at": now.isoformat()}):
            row = client.post(waste, headers=kitchen, json=declaration | allowed)
            assert row.status_code == 201, row.text
            assert row.json()["available_servings"] == 20
            assert row.json()["safety_status"] == "ELIGIBLE"
        rows = client.get(surplus, headers=kitchen).json()
        available = {row["waste_log_id"]: row["available_quantity"] for row in rows}
        assert available[1] == 50 and available[batch["id"]] == 20
        assert client.get(f"{waste}/{batch['id']}", headers=other_kitchen).status_code == 404

        req = client.post(REQ, headers=ngo, json={
            "people_to_feed": 10, "capacity_pieces": 15, "required_date": local_date(now).isoformat(),
            "available_until": (now + timedelta(hours=2)).isoformat(), "accepted_categories": ["bread"],
        })
        assert req.status_code == 201, req.text
        matches = client.post("/api/v1/matches", headers=kitchen, json={"waste_log_ids": [batch["id"]]})
        assert matches.status_code == 200 and matches.json()["total"] == 1, matches.text
        candidate = matches.json()["items"][0]
        assert candidate["is_simulated"] and candidate["suggested_allocation"][0]["offered_servings"] == 15
        existing = client.post("/api/v1/matches", headers=kitchen, json={"waste_log_ids": [1]}).json()
        assert existing["total"] == 1
        assert existing["items"][0]["ngo_id"] == candidate["ngo_id"]
        assert existing["items"][0]["suggested_allocation"][0]["offered_servings"] == 15
        offer_body = {"requirement_id": req.json()["id"], "items": [
            {"waste_log_id": batch["id"], "offered_servings": 15},
        ]}
        offered = client.post(DON, headers=kitchen, json=offer_body)
        assert offered.status_code == 201 and offered.json()["is_simulated"], offered.text
        assert client.post(DON, headers=kitchen, json=offer_body).status_code == 409
        remaining = client.get(surplus, headers=kitchen).json()
        assert next(row for row in remaining if row["waste_log_id"] == batch["id"])["available_quantity"] == 5

        donation = f"{DON}/{offered.json()['id']}"
        assert client.post(donation + "/accept", headers=other_ngo).status_code == 404
        assert client.post(donation + "/accept", headers=ngo).json()["status"] == "ACCEPTED"
        assigned = client.post(donation + "/assign-delivery", headers=kitchen, json={"delivery_person_id": 1})
        assert assigned.status_code == 200 and assigned.json()["status"] == "ASSIGNED", assigned.text
        delivery = f"/api/v1/deliveries/{assigned.json()['delivery']['id']}"
        assert client.post(delivery + "/dispatch", headers=kitchen).json()["status"] == "IN_TRANSIT"
        assert client.post(delivery + "/mark-delivered", headers=kitchen).json()["status"] == "DELIVERED"
        receipt = client.post(donation + "/confirm-receipt", headers=ngo, json={"inspected": True, "items": [
            {"donation_item_id": offered.json()["items"][0]["id"], "received_servings": 15},
        ]})
        assert receipt.status_code == 200 and receipt.json()["status"] == "COMPLETED", receipt.text
        impact = client.get("/api/v1/analytics/redistribution-summary", headers=ngo).json()
        assert impact["is_simulated"] and impact["completed_donations"] == 1 and impact["ngos_served"] == 1
        assert impact["quantities"][0]["received_quantity"] == 15
        print(f"Simulated lifecycle: {batch['available_servings']} available, "
              f"{receipt.json()['status']} donation, {impact['quantities'][0]['received_quantity']} pieces received")
    engine.dispose()
