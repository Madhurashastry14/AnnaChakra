"""Evaluate documented holding evidence against an operator-approved policy."""
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings
from app.models.enums import SafetyStatus, VerificationStatus, WasteType

logger = logging.getLogger(__name__)
DEFAULT_VERSION = "unconfigured-v1"
Storage = Literal["HOT_HOLDING", "REFRIGERATED", "FROZEN", "AMBIENT", "UNKNOWN"]
Temperature = Annotated[float, Field(allow_inf_nan=False)]


class HoldingRule(BaseModel):
    model_config = ConfigDict(extra="forbid")

    storage_method: Storage
    max_holding_minutes: int = Field(gt=0, le=525600)
    max_uncontrolled_minutes: int = Field(ge=0, le=525600)
    max_measurement_age_minutes: int = Field(gt=0, le=525600)
    min_temperature_c: Temperature | None = None
    max_temperature_c: Temperature | None = None

    @model_validator(mode="after")
    def validate_policy(self):
        low, high = self.min_temperature_c, self.max_temperature_c
        if self.storage_method == "UNKNOWN" or (low is None and high is None):
            raise ValueError("An approved rule requires a known method and a temperature boundary")
        if low is not None and high is not None and low > high:
            raise ValueError("Temperature bounds are reversed")
        if self.storage_method == "REFRIGERATED" and (high is None or high >= 7):
            raise ValueError("This conservative refrigerated policy must specify a maximum below 7 C")
        return self


class SafetyPolicy(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: str = Field(min_length=1, max_length=100)
    authority_reference: str = Field(min_length=1)
    rules: dict[str, HoldingRule]
    blocked_foods: set[str] = Field(default_factory=set)


@lru_cache(maxsize=4)
def _read_policy(path, modified, size):
    return SafetyPolicy.model_validate_json(path.read_text(encoding="utf-8"))


def current_policy():
    if settings.SAFETY_POLICY_PATH is None:
        return None
    try:
        path = Path(settings.SAFETY_POLICY_PATH).resolve()
        stat = path.stat()
        return _read_policy(path, stat.st_mtime_ns, stat.st_size)
    except (OSError, ValueError) as exc:
        logger.warning("Food safety policy unavailable (%s)", type(exc).__name__)
        return None


@dataclass(frozen=True)
class Screening:
    status: SafetyStatus
    reasons: list[str]
    screened_at: datetime
    safe_until: datetime | None
    policy_version: str


def screen_waste(record, food_name, kitchen_status, policy, now=None):
    """Use this same check immediately before matching, dispatch, and receipt."""
    now = now or datetime.now(timezone.utc)
    version = policy.version if policy else DEFAULT_VERSION
    evidence = record.safety_evidence or {}
    pending, failed = [], []
    if record.waste_type != WasteType.UNSERVED_SURPLUS:
        failed.append("Only unserved surplus can be considered for redistribution.")
    if evidence.get("contamination_suspected") is True:
        failed.append("Contamination has been reported.")
    if kitchen_status != VerificationStatus.VERIFIED:
        pending.append("The kitchen must be verified before redistribution.")
    if not record.safe_handling_confirmed or evidence.get("unserved_confirmed") is not True:
        pending.append("Staff must confirm unserved status and handling conditions.")
    method = evidence.get("storage_method")
    if method in (None, "UNKNOWN") or evidence.get("storage_verified") is not True:
        pending.append("Controlled storage conditions have not been verified.")
    if evidence.get("contamination_suspected") is None:
        pending.append("Contamination status is unknown.")
    prepared = record.prepared_at
    if prepared is not None and prepared.tzinfo is None:
        prepared = prepared.replace(tzinfo=timezone.utc)
    if prepared is None:
        pending.append("Preparation timestamp is missing.")
    elif prepared > now:
        failed.append("Preparation timestamp is in the future.")

    def timestamp(key):
        value = evidence.get(key)
        return datetime.fromisoformat(value) if value else None

    discard_at = timestamp("discard_at")
    if discard_at is not None and now >= discard_at:
        failed.append("The recorded discard deadline has passed.")
    food = food_name.strip().casefold()
    if policy and food in policy.blocked_foods:
        failed.append("This food is restricted by the configured policy.")
    rule = policy.rules.get(food) if policy else None
    deadline = None
    if rule is None:
        pending.append("No approved holding limits are configured for this food.")
    else:
        deadline = prepared + timedelta(minutes=rule.max_holding_minutes) if prepared else None
        if deadline is not None and now >= deadline:
            failed.append("The configured holding deadline has passed.")
        if method not in (None, "UNKNOWN") and method != rule.storage_method:
            failed.append("The recorded storage method differs from the approved method.")
    measured = timestamp("temperature_measured_at")
    start = timestamp("temperature_history_started_at")
    low, high = evidence.get("temperature_history_min_c"), evidence.get("temperature_history_max_c")
    uncontrolled = evidence.get("uncontrolled_minutes")
    temperature = record.storage_temperature
    covered = (prepared and measured and start and start <= prepared <= measured <= now and start < measured
               and evidence.get("temperature_history_reference") and low is not None and high is not None
               and low <= high and temperature is not None and low <= temperature <= high)
    if not covered:
        pending.append("Documented temperature history covering the holding period is required.")
    if uncontrolled is None:
        pending.append("Time outside controlled storage has not been documented.")
    if rule:
        if uncontrolled is not None and uncontrolled > rule.max_uncontrolled_minutes:
            failed.append("Time outside controlled storage exceeded the approved limit.")
        if any((rule.min_temperature_c is not None and value < rule.min_temperature_c)
               or (rule.max_temperature_c is not None and value > rule.max_temperature_c)
               for value in (low, high, temperature) if value is not None):
            failed.append("The recorded temperature exceeded approved bounds.")
        if measured is not None and measured <= now:
            freshness = measured + timedelta(minutes=rule.max_measurement_age_minutes)
            if now >= freshness:
                pending.append("A current temperature reading and updated history are required.")
            if deadline is not None:
                deadline = min(deadline, freshness)
    if failed:
        return Screening(SafetyStatus.INELIGIBLE, failed + pending, now, None, version)
    if pending or deadline is None:
        return Screening(SafetyStatus.PENDING, pending, now, None, version)
    return Screening(SafetyStatus.ELIGIBLE, ["The record passed the configured redistribution checks."],
                     now, min(deadline, discard_at) if discard_at else deadline, version)
