from datetime import date
from typing import Any

from pydantic import BaseModel

from app.models.enums import MealType, MenuMode, ServingUnit


class WasteMetrics(BaseModel):
    food_item_id: int
    food_item_name: str
    meal_type: MealType
    menu_mode: MenuMode | None
    serving_unit: ServingUnit
    records_analyzed: int
    measured_plate_waste_records: int
    shortage_eligible_records: int
    shortage_records: int
    total_prepared: float
    total_served: float
    total_unserved: float
    total_plate_waste: float | None
    total_consumed: float | None
    measured_prepared: float
    measured_served: float
    overproduction_rate: float | None
    plate_waste_rate: float | None
    food_acceptance_rate: float | None
    consumption_efficiency: float | None
    plate_waste_measurement_coverage: float
    shortage_frequency: float | None


class WasteTrend(WasteMetrics):
    date: date


class WasteInsight(BaseModel):
    food_item_id: int
    food_item_name: str
    meal_type: MealType
    menu_mode: MenuMode | None
    insight_type: str
    severity: str
    records_analyzed: int
    observed_rate: float | None
    threshold: float
    title: str
    description: str
    recommendation: str
    evidence_quality: str
    evidence: dict[str, Any]


class WasteInsights(BaseModel):
    insights: list[WasteInsight]


class PortionRecommendation(BaseModel):
    food_item_id: int
    food_item_name: str
    serving_unit: ServingUnit
    catalogue_servings_per_person: float
    observed_metrics: WasteMetrics | None
    records_analyzed: int
    uncensored_records: int
    uncensored_served_per_attendee: float | None
    portion_recommendation: str
    preparation_recommendation: str
    forecast_preparation_quantity: int | None
    expected_people: int | None
    suggested_actions: list[str]
    warnings: list[str]


class PortionRecommendations(BaseModel):
    forecast_id: int | None
    recommendations: list[PortionRecommendation]
