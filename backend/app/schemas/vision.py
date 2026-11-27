from pydantic import BaseModel

from app.models.enums import ServingUnit


class TopPrediction(BaseModel):
    label: str
    food: str
    food_item_id: int | None
    confidence: float
    serving_unit: ServingUnit | None


class CountResponse(BaseModel):
    estimated_servings: int | None = None
    counting_method: str | None = None
    counting_status: str = "NOT_ATTEMPTED"
    count_food_item_id: int | None = None
    boxes: list[list[float]] = []
    counting_warnings: list[str] = []
    requires_quantity_confirmation: bool = True


class VisionResponse(CountResponse):
    prediction_id: str
    image_id: str
    predicted_food: str | None
    food_item_id: int | None
    confidence: float | None
    confidence_score: float | None
    serving_unit: ServingUnit | None
    model_version: str | None
    top_predictions: list[TopPrediction]
    quantity_method: str = "UNAVAILABLE"
    requires_confirmation: bool = True
    requires_food_confirmation: bool = True
    warnings: list[str]
