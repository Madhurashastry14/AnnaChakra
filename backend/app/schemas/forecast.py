from datetime import date, datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.models.enums import MealType, PredictionMethod, ServingUnit
from app.schemas.food import CalculatedIngredient

PositiveID = Annotated[int, Field(strict=True, gt=0, le=2147483647)]


class ForecastRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meal_date: date
    meal_type: MealType
    expected_people: PositiveID
    food_item_ids: list[PositiveID] = Field(min_length=1)

    @field_validator("food_item_ids")
    @classmethod
    def unique_food_items(cls, values):
        if len(set(values)) != len(values):
            raise ValueError("Food item IDs must be unique")
        return values


class ForecastDishResponse(BaseModel):
    food_item_id: int
    name: str
    serving_unit: ServingUnit
    expected_people: int
    predicted_servings: float
    recommended_servings: int
    prediction_method: PredictionMethod
    historical_observation_count: int | None = None
    model_version: str | None = None
    ingredients: list[CalculatedIngredient]
    warnings: list[str]


class ForecastResponse(BaseModel):
    id: int
    meal_date: date
    meal_type: MealType
    expected_people: int
    model_version: str | None
    items: list[ForecastDishResponse]
    created_at: datetime
