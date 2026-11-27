import math
import re
from datetime import datetime

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from app.models.enums import VerificationStatus

_PHONE_PATTERN = re.compile(r"^\+?[0-9][0-9 ().-]*[0-9]$")


def normalize_phone_number(value: object) -> object:
    if not isinstance(value, str):
        raise ValueError("A phone number is required")

    phone = value.strip()
    digits = [character for character in phone if character.isdigit()]
    if (
        not 7 <= len(phone) <= 20
        or not 7 <= len(digits) <= 15
        or _PHONE_PATTERN.fullmatch(phone) is None
    ):
        raise ValueError("Enter a valid phone number")
    return phone


class OrganizationInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=2000)
    latitude: float = Field(ge=-90, le=90, allow_inf_nan=False)
    longitude: float = Field(ge=-180, le=180, allow_inf_nan=False)
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("name", "address", mode="before")
    @classmethod
    def strip_required_text(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def reject_null_coordinates(cls, value: object) -> object:
        if value is None:
            raise ValueError("Coordinates cannot be null")
        if isinstance(value, bool):
            raise ValueError("Coordinates must be numeric")
        return value

    @field_validator("latitude", "longitude")
    @classmethod
    def require_finite_coordinates(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Coordinates must be finite")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: object) -> object:
        return normalize_phone_number(value)


class OrganizationUpdateInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=200)
    address: str | None = Field(default=None, min_length=1, max_length=2000)
    latitude: float | None = Field(
        default=None,
        ge=-90,
        le=90,
        allow_inf_nan=False,
    )
    longitude: float | None = Field(
        default=None,
        ge=-180,
        le=180,
        allow_inf_nan=False,
    )
    phone: str | None = Field(default=None, min_length=7, max_length=20)

    @field_validator("name", "address", mode="before")
    @classmethod
    def strip_and_require_text(cls, value: object) -> object:
        if value is None:
            raise ValueError("This field cannot be null")
        return value.strip() if isinstance(value, str) else value

    @field_validator("latitude", "longitude", mode="before")
    @classmethod
    def reject_null_coordinates(cls, value: object) -> object:
        if value is None:
            raise ValueError("Coordinates cannot be null")
        if isinstance(value, bool):
            raise ValueError("Coordinates must be numeric")
        return value

    @field_validator("latitude", "longitude")
    @classmethod
    def require_finite_coordinates(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("Coordinates must be finite")
        return value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: object) -> object:
        return normalize_phone_number(value)

    @model_validator(mode="after")
    def require_update_fields(self) -> "OrganizationUpdateInput":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class KitchenCreateRequest(OrganizationInput):
    pass


class KitchenUpdateRequest(OrganizationUpdateInput):
    pass


class NGOCreateRequest(OrganizationInput):
    pass


class NGOUpdateRequest(OrganizationUpdateInput):
    pass


class OrganizationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    manager_id: int
    name: str
    address: str
    latitude: float
    longitude: float
    phone: str
    verification_status: VerificationStatus
    is_simulated: bool = False
    created_at: datetime


class KitchenResponse(OrganizationResponse):
    pass


class NGOResponse(OrganizationResponse):
    pass


class KitchenListResponse(BaseModel):
    items: list[KitchenResponse]
    total: int


class NGOListResponse(BaseModel):
    items: list[NGOResponse]
    total: int


class VerificationUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    verification_status: VerificationStatus
