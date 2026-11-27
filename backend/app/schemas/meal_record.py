from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import MealType
from app.schemas.forecast import PositiveID

Quantity = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class MealDishRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food_item_id: PositiveID
    prepared_servings: Quantity
    leftover_servings: Quantity
    plate_waste_servings: Quantity | None = None
    shortage_occurred: bool

    @model_validator(mode="after")
    def validate_quantities(self):
        if self.leftover_servings > self.prepared_servings:
            raise ValueError("Leftovers cannot exceed prepared quantity")
        if (self.plate_waste_servings is not None
                and self.plate_waste_servings > self.prepared_servings - self.leftover_servings + 1e-9):
            raise ValueError("Plate waste cannot exceed served quantity")
        return self


class MealRecordRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    forecast_id: PositiveID | None = None
    meal_date: date
    meal_type: MealType
    actual_people: Annotated[int, Field(strict=True, ge=0, le=2147483647)]
    items: list[MealDishRequest] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_menu(self):
        if len(self.items) != len({item.food_item_id for item in self.items}):
            raise ValueError("Food item IDs must be unique")
        return self


class MealRecordPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    forecast_id: PositiveID | None = None
    meal_date: date | None = None
    meal_type: MealType | None = None
    actual_people: Annotated[int, Field(strict=True, ge=0, le=2147483647)] | None = None
    items: list[MealDishRequest] | None = None


class MealDishResponse(MealDishRequest):
    model_config = ConfigDict(from_attributes=True)

    id: int
    served_servings: float
    consumed_servings: float | None


class MealRecordResponse(MealRecordRequest):
    id: int
    created_at: datetime
    items: list[MealDishResponse]
