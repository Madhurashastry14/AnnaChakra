from datetime import datetime
from typing import Annotated

from pydantic import AliasChoices, AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints

from app.models.enums import SafetyStatus, ServingUnit, WasteType
from app.schemas.forecast import PositiveID
from app.services.safety import Storage

Quantity = Annotated[float, Field(strict=True, gt=0, allow_inf_nan=False)]
Reference = Annotated[str, Field(pattern=r"^[0-9a-f]{32}$")]
Temperature = Annotated[float, Field(strict=True, allow_inf_nan=False)]
Notes = Annotated[str, Field(max_length=1000)]


class SafetyEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    unserved_confirmed: bool | None = None
    storage_verified: bool | None = None
    contamination_suspected: bool | None = None
    storage_method: Storage | None = None
    temperature_measured_at: AwareDatetime | None = None
    temperature_history_started_at: AwareDatetime | None = None
    temperature_history_min_c: Temperature | None = None
    temperature_history_max_c: Temperature | None = None
    temperature_history_reference: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)] | None = None
    uncontrolled_minutes: Annotated[int, Field(strict=True, ge=0, le=525600)] | None = None
    discard_at: AwareDatetime | None = Field(default=None, validation_alias=AliasChoices("discard_at", "safe_until"))


class WasteFields(SafetyEvidence):
    model_config = ConfigDict(extra="forbid")

    prediction_id: Reference | None = Field(default=None, validation_alias=AliasChoices("prediction_id", "image_id"))
    meal_record_item_id: PositiveID | None = None
    prepared_at: AwareDatetime | None = None
    storage_temperature: Temperature | None = None
    safe_handling_confirmed: bool = False
    notes: Notes | None = None


class WasteRequest(WasteFields):
    food_item_id: PositiveID
    confirmed_servings: Quantity
    waste_type: WasteType


class WastePatch(WasteFields):
    food_item_id: PositiveID | None = None
    confirmed_servings: Quantity | None = None
    waste_type: WasteType | None = None


class WasteResponse(WasteRequest):
    id: int
    confirmed_servings: float
    created_at: datetime
    food_name: str
    serving_unit: ServingUnit
    image_id: str | None
    image_url: str | None
    predicted_food: str | None
    confidence_score: float | None
    model_version: str | None
    estimated_servings: float | None
    safety_status: SafetyStatus
    safety_notes: list[str]
    safe_until: datetime | None
    available_servings: float
    screened_at: datetime | None
    safety_policy_version: str | None


class SafetyCheck(SafetyEvidence):
    prepared_at: AwareDatetime | None = None
    storage_temperature: Temperature | None = None
    safe_handling_confirmed: bool | None = Field(default=None, validation_alias=AliasChoices(
        "safe_handling_confirmed", "handling_verified",
    ))
    notes: Notes | None = None


class SafetyResponse(BaseModel):
    waste_log_id: int
    safety_status: SafetyStatus
    reasons: list[str]
    safe_until: datetime | None
    screened_at: datetime | None
    safety_policy_version: str | None
