from datetime import datetime

from sqlalchemy import (
    String, Text, Float, Boolean, ForeignKey,
    DateTime, Enum, func, CheckConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import WasteType, SafetyStatus


class WasteLog(Base):
    __tablename__ = "waste_logs"

    __table_args__ = (
        CheckConstraint(
            "confirmed_servings >= 0",
            name="ck_waste_confirmed_servings"
        ),
        CheckConstraint(
            "estimated_servings IS NULL OR estimated_servings >= 0",
            name="ck_waste_estimated_servings"
        ),
        CheckConstraint(
            "confidence_score IS NULL OR "
            "confidence_score BETWEEN 0 AND 1",
            name="ck_waste_confidence"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    kitchen_id: Mapped[int] = mapped_column(
        ForeignKey("kitchens.id"),
        index=True
    )

    meal_record_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("meal_record_items.id"),
        nullable=True
    )

    food_item_id: Mapped[int] = mapped_column(
        ForeignKey("food_items.id")
    )

    prediction_id: Mapped[str | None] = mapped_column(ForeignKey("vision_predictions.id"), index=True)
    model_version: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)

    image_url: Mapped[str | None] = mapped_column(
        String(500),
        nullable=True
    )

    predicted_food: Mapped[str | None] = mapped_column(
        String(150),
        nullable=True
    )

    confidence_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    estimated_servings: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    confirmed_servings: Mapped[float] = mapped_column(Float)

    waste_type: Mapped[WasteType] = mapped_column(
        Enum(WasteType, name="waste_type")
    )

    prepared_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )

    storage_temperature: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    safe_handling_confirmed: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    safety_status: Mapped[SafetyStatus] = mapped_column(
        Enum(SafetyStatus, name="safety_status"),
        default=SafetyStatus.PENDING
    )

    safety_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    safe_until: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )
