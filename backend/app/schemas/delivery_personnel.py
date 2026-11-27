from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.organization import normalize_phone_number


class DeliveryPersonnelCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=150)
    phone: str = Field(min_length=7, max_length=20)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: object) -> object:
        return normalize_phone_number(value)


class DeliveryPersonnelUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, min_length=7, max_length=20)
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_and_require_name(cls, value: object) -> object:
        if value is None:
            raise ValueError("Name cannot be null")
        return value.strip() if isinstance(value, str) else value

    @field_validator("phone", mode="before")
    @classmethod
    def validate_phone(cls, value: object) -> object:
        return normalize_phone_number(value)

    @field_validator("is_active", mode="before")
    @classmethod
    def require_active_value(cls, value: object) -> object:
        if value is None:
            raise ValueError("is_active cannot be null")
        return value

    @model_validator(mode="after")
    def require_update_fields(self) -> "DeliveryPersonnelUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("At least one field must be provided")
        return self


class DeliveryPersonnelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    phone: str
    is_active: bool


class DeliveryPersonnelListResponse(BaseModel):
    items: list[DeliveryPersonnelResponse]
    total: int
