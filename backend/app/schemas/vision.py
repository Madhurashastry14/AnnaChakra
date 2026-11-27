from pydantic import BaseModel

from app.models.enums import ServingUnit


class TopPrediction(BaseModel):
    label: str
    food: str
    food_item_id: int | None
    confidence: float
    serving_unit: ServingUnit | None


class VisionResponse(BaseModel):
    prediction_id: str
    image_id: str
    predicted_food: str | None
    food_item_id: int | None
    confidence: float | None
    confidence_score: float | None
    serving_unit: ServingUnit | None
    model_version: str | None
    top_predictions: list[TopPrediction]
    estimated_servings: None = None
    quantity_method: str = "UNAVAILABLE"
    requires_confirmation: bool = True
    requires_food_confirmation: bool = True
    requires_quantity_confirmation: bool = True
    warnings: list[str]
