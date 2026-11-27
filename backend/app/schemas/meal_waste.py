from datetime import date, datetime

from pydantic import BaseModel

from app.models.enums import ServingUnit, WasteType


class LoggingDraft(BaseModel):
    meal_record_item_id: int
    food_item_id: int
    confirmed_servings: float
    waste_type: WasteType


class SurplusPayload(LoggingDraft):
    prepared_at: datetime | None


class MealWasteItem(BaseModel):
    meal_record_item_id: int
    food_item_id: int
    food_item_name: str
    serving_unit: ServingUnit
    prepared_servings: float
    served_servings: float
    recorded_unserved: float
    recorded_plate_waste: float | None
    logged_unserved: float
    logged_spoiled: float
    logged_plate_waste: float
    remaining_unserved: float
    remaining_plate_waste: float | None
    waste_log_ids: list[int]
    recorded_preparation_times: list[datetime]
    logging_drafts: list[LoggingDraft]


class MealWasteSummary(BaseModel):
    meal_record_id: int
    meal_date: date
    items: list[MealWasteItem]


class SurplusDraft(BaseModel):
    meal_record_id: int
    meal_record_item_id: int
    food_item_id: int
    food_item_name: str
    serving_unit: ServingUnit
    recorded_unserved: float
    remaining_unserved: float
    required_safety_information: list[str]
    requires_quantity_confirmation: bool
    warnings: list[str]
    draft: SurplusPayload


class SurplusDrafts(BaseModel):
    meal_record_id: int
    meal_date: date
    drafts: list[SurplusDraft]
