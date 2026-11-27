import json
import logging
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

import pytest

from app.core.config import BACKEND_DIR, Settings, settings
from app.models.enums import SafetyStatus, VerificationStatus, WasteType
from app.services.safety import SafetyPolicy, _read_policy, current_policy, screen_waste


@pytest.fixture(autouse=True)
def clear_policy_cache():
    _read_policy.cache_clear()
    yield
    _read_policy.cache_clear()


def policy_document(version="fixture-v1", authority="Fixture policy"):
    return {
        "version": version,
        "authority_reference": authority,
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
    }


def write_policy(path: Path, version="fixture-v1", authority="Fixture policy"):
    path.write_text(json.dumps(policy_document(version, authority)), encoding="utf-8")


def simulated_policy():
    return SafetyPolicy.model_validate(
        policy_document("demo-v1", "Simulated test policy; not for real redistribution.")
    )


def valid_record(now, *, prepared_minutes_ago=10, evidence_changes=None, waste_type=None):
    prepared = now - timedelta(minutes=prepared_minutes_ago)
    evidence = {
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
    evidence.update(evidence_changes or {})
    record = SimpleNamespace(
        waste_type=waste_type or WasteType.UNSERVED_SURPLUS,
        safety_evidence=evidence,
        safe_handling_confirmed=True,
        prepared_at=prepared,
        storage_temperature=70,
    )
    return record, prepared


def test_settings_env_file_is_anchored_to_backend():
    assert Path(Settings.model_config["env_file"]) == BACKEND_DIR / ".env"


def test_relative_policy_path_loads_from_backend_when_working_directory_changes(
    monkeypatch, tmp_path
):
    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr(settings, "APP_ENV", "demo")
    monkeypatch.setattr(
        settings, "SAFETY_POLICY_PATH", Path("config/safety_policy.demo.json")
    )

    policy = current_policy()

    assert policy is not None
    assert policy.version == "demo-v1"
    assert "biryani" in policy.rules


@pytest.mark.parametrize("contents", [None, "{not-json", '{"version":"invalid"}'])
def test_missing_or_invalid_policy_fails_closed(monkeypatch, tmp_path, contents):
    policy_path = tmp_path / "policy.json"
    if contents is not None:
        policy_path.write_text(contents, encoding="utf-8")
    monkeypatch.setattr(settings, "APP_ENV", "test")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", policy_path)

    assert current_policy() is None


def test_demo_policy_is_rejected_outside_demo_and_test(monkeypatch, tmp_path):
    policy_path = tmp_path / "policy.json"
    write_policy(
        policy_path,
        version="demo-v1",
        authority="Simulated policy; not approved for real redistribution.",
    )
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", policy_path)

    monkeypatch.setattr(settings, "APP_ENV", "production")
    assert current_policy() is None

    for environment in ("demo", "test"):
        monkeypatch.setattr(settings, "APP_ENV", environment)
        assert current_policy().version == "demo-v1"


def test_startup_logs_policy_version_and_supported_foods(monkeypatch, tmp_path, caplog):
    from fastapi.testclient import TestClient

    from app.main import app

    policy_path = tmp_path / "policy.json"
    write_policy(policy_path, version="fixture-v1")
    monkeypatch.setattr(settings, "APP_ENV", "test")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", policy_path)
    caplog.set_level(logging.INFO, logger="app.main")

    with TestClient(app):
        pass

    assert "Food safety policy loaded" in caplog.text
    assert "version=fixture-v1" in caplog.text
    assert "supported_foods=biryani" in caplog.text


def test_policy_content_change_reloads_even_if_size_and_mtime_are_unchanged(
    monkeypatch, tmp_path
):
    policy_path = tmp_path / "policy.json"
    write_policy(policy_path, version="fixture-v1")
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "SAFETY_POLICY_PATH", policy_path)
    first = current_policy()
    original_stat = policy_path.stat()

    write_policy(policy_path, version="fixture-v2")
    os.utime(policy_path, ns=(original_stat.st_atime_ns, original_stat.st_mtime_ns))

    assert policy_path.stat().st_size == original_stat.st_size
    assert policy_path.stat().st_mtime_ns == original_stat.st_mtime_ns
    assert first.version == "fixture-v1"
    assert current_policy().version == "fixture-v2"


def test_valid_simulated_biryani_evidence_is_eligible_with_deadline():
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    record, prepared = valid_record(now)
    policy = simulated_policy()

    result = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, policy, now
    )

    measured = datetime.fromisoformat(record.safety_evidence["temperature_measured_at"])
    assert result.status == SafetyStatus.ELIGIBLE
    assert result.policy_version == "demo-v1"
    assert result.safe_until == min(
        prepared + timedelta(minutes=120),
        measured + timedelta(minutes=60),
    )


def test_unverified_kitchen_and_missing_unserved_confirmation_stay_pending():
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    policy = simulated_policy()
    record, _ = valid_record(now)

    unverified = screen_waste(
        record, "Biryani", VerificationStatus.PENDING, policy, now
    )
    assert unverified.status == SafetyStatus.PENDING

    record, _ = valid_record(now, evidence_changes={"unserved_confirmed": None})
    missing_confirmation = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, policy, now
    )
    assert missing_confirmation.status == SafetyStatus.PENDING


def test_expired_holding_deadline_is_ineligible():
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    record, _ = valid_record(now, prepared_minutes_ago=121)

    result = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, simulated_policy(), now
    )

    assert result.status == SafetyStatus.INELIGIBLE
    assert any("holding deadline has passed" in reason for reason in result.reasons)


def test_invalid_temperature_is_ineligible_and_stale_reading_is_pending():
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    policy = simulated_policy()
    record, _ = valid_record(now, evidence_changes={"temperature_history_min_c": 64})

    invalid = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, policy, now
    )
    assert invalid.status == SafetyStatus.INELIGIBLE

    record, _ = valid_record(
        now,
        prepared_minutes_ago=90,
        evidence_changes={
            "temperature_measured_at": (now - timedelta(minutes=61)).isoformat()
        },
    )
    stale = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, policy, now
    )
    assert stale.status == SafetyStatus.PENDING
    assert any("current temperature reading" in reason for reason in stale.reasons)


def test_plate_waste_remains_ineligible():
    now = datetime(2026, 11, 27, 12, 0, tzinfo=timezone.utc)
    record, _ = valid_record(now, waste_type=WasteType.PLATE_WASTE)

    result = screen_waste(
        record, "Biryani", VerificationStatus.VERIFIED, simulated_policy(), now
    )

    assert result.status == SafetyStatus.INELIGIBLE
    assert any("Only unserved surplus" in reason for reason in result.reasons)
