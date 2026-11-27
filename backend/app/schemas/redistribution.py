from datetime import date, datetime
from typing import Annotated, Literal

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


class OfferItem(StrictBody):
    waste_log_id: PositiveID
    offered_servings: Quantity


class MatchRequest(StrictBody):
    waste_log_ids: list[PositiveID] = Field(default_factory=list, max_length=30)
    items: list[OfferItem] = Field(default_factory=list, max_length=30)
    max_distance_km: Annotated[float, Field(gt=0, le=100, allow_inf_nan=False)] | None = None

    @model_validator(mode="after")
    def validate_items(self):
        ids = self.waste_log_ids or [item.waste_log_id for item in self.items]
        if not ids or (self.waste_log_ids and self.items) or len(ids) != len(set(ids)):
            raise ValueError("Provide unique waste log IDs or unique items")
        return self


class OfferRequest(StrictBody):
    requirement_id: PositiveID
    items: list[OfferItem] = Field(min_length=1, max_length=30)
    notes: Notes | None = None

    @model_validator(mode="after")
    def distinct_batches(self):
        if len({line.waste_log_id for line in self.items}) != len(self.items):
            raise ValueError("Waste log IDs must be unique")
        return self


class ReasonRequest(StrictBody):
    reason: Notes


class AssignmentRequest(StrictBody):
    delivery_person_id: PositiveID
    notes: Notes | None = None


class ReceiptItem(StrictBody):
    donation_item_id: PositiveID
    received_servings: Capacity
    rejection_reason: Notes | None = None


class ReceiptRequest(StrictBody):
    inspected: Literal[True]
    items: list[ReceiptItem] = Field(min_length=1, max_length=30)
    notes: Notes | None = None

    @model_validator(mode="after")
    def distinct_items(self):
        if len({line.donation_item_id for line in self.items}) != len(self.items):
            raise ValueError("Donation item IDs must be unique")
        return self
