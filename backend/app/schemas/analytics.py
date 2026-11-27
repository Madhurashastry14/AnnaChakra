from datetime import date

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
