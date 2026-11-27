from datetime import datetime

from sqlalchemy import (
    String, Text, Float, ForeignKey,
    DateTime, Enum, func, CheckConstraint,
    UniqueConstraint
)
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.enums import DonationStatus, DeliveryStatus


class Donation(Base):
    __tablename__ = "donations"

    __table_args__ = (
        CheckConstraint(
            "match_score IS NULL OR match_score BETWEEN 0 AND 100",
            name="ck_donation_match_score"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    kitchen_id: Mapped[int] = mapped_column(
        ForeignKey("kitchens.id"),
        index=True
    )

    ngo_id: Mapped[int] = mapped_column(
        ForeignKey("ngos.id"),
        index=True
    )

    requirement_id: Mapped[int] = mapped_column(
        ForeignKey("ngo_requirements.id")
    )

    status: Mapped[DonationStatus] = mapped_column(
        Enum(DonationStatus, name="donation_status"),
        default=DonationStatus.PENDING,
        index=True
    )

    match_score: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    rejection_reason: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now()
    )

    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )


class DonationItem(Base):
    __tablename__ = "donation_items"

    __table_args__ = (
        UniqueConstraint(
            "donation_id", "waste_log_id",
            name="uq_donation_waste_log"
        ),
        CheckConstraint(
            "offered_servings > 0",
            name="ck_donation_offered_servings"
        ),
        CheckConstraint(
            "received_servings IS NULL OR "
            "(received_servings >= 0 AND "
            "received_servings <= offered_servings)",
            name="ck_donation_received_servings"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    donation_id: Mapped[int] = mapped_column(
        ForeignKey("donations.id", ondelete="CASCADE"),
        index=True
    )

    waste_log_id: Mapped[int] = mapped_column(
        ForeignKey("waste_logs.id"),
        index=True
    )

    offered_servings: Mapped[float] = mapped_column(Float)

    received_servings: Mapped[float | None] = mapped_column(
        Float,
        nullable=True
    )


class Delivery(Base):
    __tablename__ = "deliveries"

    id: Mapped[int] = mapped_column(primary_key=True)

    donation_id: Mapped[int] = mapped_column(
        ForeignKey("donations.id"),
        unique=True
    )

    delivery_person_id: Mapped[int] = mapped_column(
        ForeignKey("delivery_personnel.id"),
        index=True
    )

    status: Mapped[DeliveryStatus] = mapped_column(
        Enum(DeliveryStatus, name="delivery_status"),
        default=DeliveryStatus.ASSIGNED
    )

    assigned_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )

    dispatched_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    delivered_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True
    )

    delivery_notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )