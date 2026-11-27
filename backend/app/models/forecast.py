from datetime import date, datetime

from sqlalchemy import (
    Date, DateTime, Integer, Float, String, JSON,
    ForeignKey, Enum, func, CheckConstraint,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import MealType, MenuMode, PredictionMethod


class Forecast(Base):
    __tablename__ = "forecasts"

    __table_args__ = (
        CheckConstraint(
            "expected_people > 0",
            name="ck_forecast_expected_people"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    kitchen_id: Mapped[int] = mapped_column(
        ForeignKey("kitchens.id"),
        index=True
    )

    meal_date: Mapped[date] = mapped_column(Date)

    meal_type: Mapped[MealType] = mapped_column(
        Enum(MealType, name="meal_type")
    )

    expected_people: Mapped[int] = mapped_column(Integer)

    menu_mode: Mapped[MenuMode | None] = mapped_column(Enum(MenuMode, name="menu_mode"))
    menu_context: Mapped[list[dict] | None] = mapped_column(JSON)

    model_version: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )


class ForecastItem(Base):
    __tablename__ = "forecast_items"

    __table_args__ = (
        UniqueConstraint(
            "forecast_id", "food_item_id",
            name="uq_forecast_food_item"
        ),
        CheckConstraint(
            "predicted_servings >= 0",
            name="ck_predicted_servings"
        ),
        CheckConstraint(
            "recommended_servings >= predicted_servings",
            name="ck_recommended_servings"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    forecast_id: Mapped[int] = mapped_column(
        ForeignKey("forecasts.id", ondelete="CASCADE"),
        index=True
    )

    food_item_id: Mapped[int] = mapped_column(
        ForeignKey("food_items.id")
    )

    predicted_servings: Mapped[float] = mapped_column(Float)

    recommended_servings: Mapped[int] = mapped_column(Integer)

    prediction_method: Mapped[PredictionMethod] = mapped_column(
        Enum(PredictionMethod, name="prediction_method")
    )

    prediction_details: Mapped[dict | None] = mapped_column(JSON, nullable=True)
