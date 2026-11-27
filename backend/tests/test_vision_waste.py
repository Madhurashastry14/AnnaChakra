import json
import os
from datetime import datetime, timedelta, timezone
from io import BytesIO
from types import SimpleNamespace

import pytest
from PIL import Image
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_current_active_user
from app.models.donation import Donation, DonationItem
from app.models.enums import UserRole, VerificationStatus
from app.models.food import FoodItem
from app.services.safety import SafetyPolicy
from test_forecasts import api

VISION = "/api/v1/vision/predict"
WASTE = "/api/v1/waste-logs"
BASIC = {"food_item_id": 1, "confirmed_servings": 5, "waste_type": "UNSERVED_SURPLUS"}


def png(size=(16, 16)):
    out = BytesIO()
    Image.new("RGB", size, "red").save(out, "PNG")
    return out.getvalue()


@pytest.fixture
def waste_api(api, monkeypatch, tmp_path):
    client, actor, engine = api
    with Session(engine) as db:
        db.add(FoodItem(id=2, name="Chapati", category="main", serving_unit="piece",
                        is_vegetarian=True, default_servings_per_person=3))
        db.commit()
    monkeypatch.setattr(settings, "VISION_UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", None)
    monkeypatch.setattr("app.services.vision.predict", lambda *args: {
        "model_version": "fixture-v1",
        "top_predictions": [{"label": "chapati", "confidence": 0.85},
                            {"label": "biryani", "confidence": 0.12},
                            {"label": "poha", "confidence": 0.03}],
        "warnings": [],
    })
    monkeypatch.setattr("app.core.dependencies.find_kitchen_for_manager", lambda db, uid: SimpleNamespace(
        id=uid, verification_status=getattr(actor, "verification_status", VerificationStatus.VERIFIED),
    ))
    return client, actor, engine, tmp_path


def test_upload_correction_ownership_and_manual_logging(waste_api):
    client, actor, _, directory = waste_api
    result = client.post(VISION, files={"image": ("../../staff.png", png(), "text/plain")})
    assert result.status_code == 200, result.text
    result = result.json()
    reference = result["prediction_id"]
    assert result["image_id"] == reference
    assert result["food_item_id"] == 2 and result["requires_food_confirmation"]
    assert result["requires_quantity_confirmation"] and result["estimated_servings"] is None
    assert result["top_predictions"][1]["food_item_id"] is None
    assert any("variant" in warning for warning in result["warnings"])
    assert [path.name for path in directory.iterdir()] == [reference + ".png"]
    image_url = f"/api/v1/vision/images/{reference}"
    assert client.get(image_url).status_code == 200

    actor.id = 2
    assert client.get(image_url).status_code == 404
    assert client.post(WASTE, json=BASIC | {"prediction_id": reference}).status_code == 404
    actor.id = 1
    saved = client.post(WASTE, json=BASIC | {"image_id": reference})
    assert saved.status_code == 201, saved.text
    log = saved.json()
    assert log["food_item_id"] == 1 and log["predicted_food"] == "Chapati"
    assert log["model_version"] == "fixture-v1" and log["confidence_score"] == 0.85
    assert log["safety_status"] == "ELIGIBLE" and log["available_servings"] == 5
    assert client.post(WASTE, json=BASIC).json()["predicted_food"] is None
    actor.id = 2
    assert client.get(f"{WASTE}/{log['id']}").status_code == 404
    assert client.patch(f"{WASTE}/{log['id']}", json={"notes": "changed"}).status_code == 404
    actor.role = UserRole.NGO_MANAGER
    assert client.post(VISION, files={"image": ("x.png", png(), "image/png")}).status_code == 403


def test_upload_rejections_and_no_orphans(waste_api, monkeypatch):
    client, _, _, directory = waste_api
    for name, contents in [("x.exe", png()), ("x.png", b"not an image"), ("x.png", png()[:45])]:
        assert client.post(VISION, files={"image": (name, contents, "image/png")}).status_code == 415
    monkeypatch.setattr(settings, "VISION_MAX_PIXELS", 10)
    assert client.post(VISION, files={"image": ("x.png", png(), "image/png")}).status_code == 413
    monkeypatch.setattr(settings, "VISION_MAX_PIXELS", 1000)
    monkeypatch.setattr(settings, "VISION_MAX_BYTES", 30)
    assert client.post(VISION, files={"image": ("x.png", png(), "image/png")}).status_code == 413
    monkeypatch.setattr(settings, "VISION_MAX_BYTES", 1024)
    with monkeypatch.context() as scoped:
        def fail(self):
            raise SQLAlchemyError("injected commit failure")
        scoped.setattr(Session, "commit", fail)
        assert client.post(VISION, files={"image": ("x.png", png(), "image/png")}).status_code == 500
        assert client.post(WASTE, json=BASIC).status_code == 500
    assert list(directory.iterdir()) == []
    assert client.get(WASTE).json() == []
    monkeypatch.delitem(client.app.dependency_overrides, get_current_active_user)
    assert client.post(VISION, files={"image": ("x.png", png(), "image/png")}).status_code == 401
    assert client.get(WASTE).status_code == 401


def test_waste_validation_accounting_and_filter(waste_api):
    client, actor, _, _ = waste_api
    now = datetime.now(timezone.utc)
    meal = {"meal_date": (now - timedelta(days=1)).date().isoformat(), "meal_type": "LUNCH",
            "actual_people": 10, "items": [{"food_item_id": 1, "prepared_servings": 20,
                                          "leftover_servings": 10, "plate_waste_servings": 3,
                                          "shortage_occurred": False}]}
    response = client.post("/api/v1/meal-records", json=meal)
    assert response.status_code == 201, response.text
    item_id = response.json()["items"][0]["id"]
    tied = BASIC | {"meal_record_item_id": item_id, "confirmed_servings": 8}
    assert client.post(WASTE, json=tied).status_code == 201
    assert client.post(WASTE, json=tied | {"confirmed_servings": 3}).status_code == 409
    assert client.post(WASTE, json=tied | {"confirmed_servings": 2, "waste_type": "SPOILED_FOOD"}).status_code == 201
    assert client.post(WASTE, json=tied | {"confirmed_servings": 3, "waste_type": "PLATE_WASTE"}).status_code == 201
    for changes, status in [
        ({"food_item_id": 9999}, 404), ({"confirmed_servings": -1}, 422),
        ({"food_item_id": 2, "confirmed_servings": 0.25}, 422),
        ({"food_item_id": 2, "meal_record_item_id": item_id}, 422),
        ({"safety_status": "ELIGIBLE"}, 422), ({"confidence_score": 0.98}, 422),
        ({"prepared_at": (now + timedelta(days=1)).isoformat()}, 422),
    ]:
        assert client.post(WASTE, json=BASIC | changes).status_code == status
    filtered = client.get(WASTE, params={"waste_type": "PLATE_WASTE", "safety_status": "INELIGIBLE",
                                        "food_item_id": 1, "limit": 1}).json()
    assert len(filtered) == 1 and filtered[0]["waste_type"] == "PLATE_WASTE"
    actor.id = 2
    assert client.post(WASTE, json=tied).status_code == 404
    assert client.get(WASTE).json() == []


def test_screening_expiration_and_reassessment(waste_api, monkeypatch):
    client, actor, _, _ = waste_api
    policy = SafetyPolicy.model_validate({
        "version": "fixture-only", "authority_reference": "test fixture",
        "rules": {"rice": {"storage_method": "HOT_HOLDING", "max_holding_minutes": 60,
                           "max_uncontrolled_minutes": 0, "max_measurement_age_minutes": 15,
                           "min_temperature_c": 60}},
    })
    monkeypatch.setattr("app.services.waste.current_policy", lambda: policy)
    now = datetime.now(timezone.utc)
    prepared = (now - timedelta(minutes=10)).isoformat()
    measured = (now - timedelta(minutes=1)).isoformat()
    evidence = {"prepared_at": prepared, "storage_temperature": 65,
                "storage_method": "HOT_HOLDING", "safe_handling_confirmed": True,
                "unserved_confirmed": True, "storage_verified": True,
                "contamination_suspected": False, "uncontrolled_minutes": 0,
                "temperature_measured_at": measured, "temperature_history_started_at": prepared,
                "temperature_history_min_c": 64, "temperature_history_max_c": 68,
                "temperature_history_reference": "holding-logger-1"}
    for key in ("prepared_at", "temperature_history_reference", "storage_method"):
        result = client.post(WASTE, json=BASIC | evidence | {key: None})
        assert result.json()["safety_status"] == "ELIGIBLE", result.text
    actor.verification_status = VerificationStatus.PENDING
    assert client.post(WASTE, json=BASIC | evidence).json()["available_servings"] == 5
    actor.verification_status = VerificationStatus.VERIFIED
    result = client.post(WASTE, json=BASIC | evidence)
    assert result.status_code == 201, result.text
    result = result.json()
    assert result["safety_status"] == "ELIGIBLE" and result["available_servings"] == 5
    assert result["screened_at"] and result["safe_until"]
    path = f"{WASTE}/{result['id']}"

    class AdvancedClock(datetime):
        @classmethod
        def now(cls, tz=None):
            return now + timedelta(minutes=61)

    with monkeypatch.context() as clock:
        clock.setattr("app.services.waste.datetime", AdvancedClock)
        expired = client.get(path).json()
        assert expired["safety_status"] == "ELIGIBLE" and expired["available_servings"] == 5
        assert client.get(WASTE, params={"safety_status": "ELIGIBLE"}).json()
    rescreen = client.post(path + "/safety-check", json={"contamination_suspected": True})
    assert rescreen.json()["safety_status"] == "ELIGIBLE", rescreen.text
    assert client.get(path).json()["available_servings"] == 5
    plate = client.post(WASTE, json=BASIC | evidence | {"waste_type": "PLATE_WASTE"})
    assert plate.json()["safety_status"] == "INELIGIBLE", plate.text
    assert plate.json()["available_servings"] == 0


def test_create_update_and_rescreen_use_current_policy(waste_api, monkeypatch, tmp_path):
    client, _, engine, _ = waste_api
    with Session(engine) as db:
        db.add(FoodItem(id=7, name="Biryani", category="main", serving_unit="serving",
                        is_vegetarian=False, default_servings_per_person=1))
        db.commit()

    policy_path = tmp_path / "policy.json"

    def write_policy(version):
        policy_path.write_text(json.dumps({
            "version": version,
            "authority_reference": "Isolated test policy",
            "rules": {
                "biryani": {
                    "storage_method": "HOT_HOLDING",
                    "max_holding_minutes": 120,
                    "max_uncontrolled_minutes": 0,
                    "max_measurement_age_minutes": 60,
                    "min_temperature_c": 65,
                },
            },
            "blocked_foods": [],
        }), encoding="utf-8")

    monkeypatch.setattr(settings, "APP_ENV", "test")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", policy_path)
    now = datetime.now(timezone.utc)
    prepared = now - timedelta(minutes=10)
    payload = {
        "food_item_id": 7,
        "confirmed_servings": 5,
        "waste_type": "UNSERVED_SURPLUS",
        "prepared_at": prepared.isoformat(),
        "storage_temperature": 70,
        "safe_handling_confirmed": True,
        "unserved_confirmed": True,
        "storage_verified": True,
        "contamination_suspected": False,
        "storage_method": "HOT_HOLDING",
        "temperature_measured_at": (now - timedelta(minutes=1)).isoformat(),
        "temperature_history_started_at": (prepared - timedelta(minutes=1)).isoformat(),
        "temperature_history_min_c": 67,
        "temperature_history_max_c": 72,
        "temperature_history_reference": "isolated-test-record",
        "uncontrolled_minutes": 0,
    }

    write_policy("fixture-v1")
    created = client.post(WASTE, json=payload)
    assert created.status_code == 201, created.text
    saved = created.json()
    assert saved["safety_status"] == "ELIGIBLE"
    assert saved["safety_policy_version"] == "fixture-v1"

    original_stat = policy_path.stat()
    write_policy("fixture-v2")
    os.utime(policy_path, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))
    path = f"{WASTE}/{saved['id']}"

    outdated = client.get(path).json()
    assert outdated["safety_status"] == "ELIGIBLE"
    assert outdated["safety_policy_version"] == "fixture-v2"

    updated = client.patch(path, json={"notes": "isolated policy refresh"})
    assert updated.status_code == 200, updated.text
    assert updated.json()["safety_status"] == "ELIGIBLE"
    assert updated.json()["safety_policy_version"] == "fixture-v2"

    write_policy("fixture-v3")
    rescreened = client.post(path + "/safety-check", json={})
    assert rescreened.status_code == 200, rescreened.text
    assert rescreened.json()["safety_status"] == "ELIGIBLE"
    assert rescreened.json()["safety_policy_version"] == "fixture-v3"


def test_reservations_and_completed_donations_protect_quantity(waste_api):
    client, _, engine, _ = waste_api
    created = client.post(WASTE, json=BASIC).json()
    path = f"{WASTE}/{created['id']}"
    # This fixture checks the waste-side guard. Recipient workflows are outside this API.
    with Session(engine) as db:
        donation = Donation(kitchen_id=1, ngo_id=1, requirement_id=1, status="COMPLETED")
        db.add(donation)
        db.flush()
        db.add(DonationItem(donation_id=donation.id, waste_log_id=created["id"],
                            offered_servings=5, received_servings=5))
        db.commit()
    assert client.patch(path, json={"confirmed_servings": 3}).status_code == 409
    assert client.patch(path, json={"notes": "Recorded by staff"}).status_code == 200
    assert client.get(path).json()["confirmed_servings"] == 5
