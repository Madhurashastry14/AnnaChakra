from datetime import date, datetime
from typing import Annotated

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field, StringConstraints, model_validator

from app.schemas.forecast import PositiveID

Quantity = Annotated[float, Field(strict=True, gt=0, le=1e9, allow_inf_nan=False)]
Capacity = Annotated[float, Field(strict=True, ge=0, le=1e9, allow_inf_nan=False)]
Pieces = Annotated[int, Field(strict=True, ge=0, le=1000000000)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=1000)]


class StrictBody(BaseModel):
    model_config = ConfigDict(extra="forbid")


class RequirementCreate(StrictBody):
    people_to_feed: PositiveID
    capacity_servings: Capacity = 0
    capacity_pieces: Pieces = 0
    accepted_categories: list[Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]] = Field(default_factory=list, max_length=30)
    accepts_vegetarian: bool = True
    accepts_non_vegetarian: bool = False
    required_date: date
    available_until: AwareDatetime
    is_active: bool = True


class RequirementPatch(RequirementCreate):
    people_to_feed: PositiveID | None = None
    required_date: date | None = None
    available_until: AwareDatetime | None = None

    @model_validator(mode="after")
    def nonnull_updates(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Requirement fields cannot be null")
        return self


class RequirementResponse(RequirementCreate):
    id: int
    ngo_id: int
    remaining_capacity: float
    remaining_capacity_by_unit: dict[str, float]
    created_at: datetime
    updated_at: datetime | None
