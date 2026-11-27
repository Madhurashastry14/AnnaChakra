from datetime import date

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models.enums import FoodRole, MealType, MenuMode, ServingUnit
from app.schemas.analytics import WasteMetrics
from app.schemas.forecast import ForecastRequest, PositiveID


class MenuRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    meal_date: date
    meal_type: MealType
    expected_people: PositiveID
    menu_mode: MenuMode = MenuMode.CHOICE_BASED
    vegetarian_only: bool = False
    max_main_dishes: int = Field(default=2, ge=1, le=4)
    max_accompaniments: int = Field(default=2, ge=0, le=4)
    max_dishes: int = Field(default=6, ge=1, le=10)
    required_food_item_ids: list[PositiveID] = Field(default_factory=list, max_length=10)
    excluded_food_item_ids: list[PositiveID] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def validate_ids(self):
        required, excluded = set(self.required_food_item_ids), set(self.excluded_food_item_ids)
        if (len(required) != len(self.required_food_item_ids) or len(excluded) != len(self.excluded_food_item_ids)
                or required & excluded):
            raise ValueError("Required and excluded IDs must be unique and disjoint")
        if len(required) > self.max_dishes:
            raise ValueError("Required food items exceed the total dish limit")
        return self


class RecommendedDish(BaseModel):
    food_item_id: int
    food_item_name: str
    food_role: FoodRole
    serving_unit: ServingUnit
    recommendation_score: float
    recommendation_method: str
    data_availability: str
    records_analyzed: int
    waste_metrics: WasteMetrics | None
    reasons: list[str]


class MenuResponse(BaseModel):
    meal_date: date
    meal_type: MealType
    expected_people: int
    menu_mode: MenuMode
    recommendation_method: str
    recommended_food_item_ids: list[int]
    recommended_items: list[RecommendedDish]
    warnings: list[str]
    forecast_request: ForecastRequest
