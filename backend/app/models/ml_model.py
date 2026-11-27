from datetime import datetime

from sqlalchemy import (
    String, Integer, Boolean,
    DateTime, func, UniqueConstraint,
    CheckConstraint, Index, text
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ModelVersion(Base):
    __tablename__ = "model_versions"

    __table_args__ = (
        UniqueConstraint(
            "model_name", "version",
            name="uq_model_name_version"
        ),
        CheckConstraint(
            "training_records >= 0",
            name="ck_model_training_records"
        ),
        Index(
            "uq_active_model_per_name",
            "model_name",
            unique=True,
            postgresql_where=text("is_active = true")
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)

    model_name: Mapped[str] = mapped_column(String(100))

    version: Mapped[str] = mapped_column(String(50))

    artifact_path: Mapped[str] = mapped_column(String(500))

    training_records: Mapped[int] = mapped_column(
        Integer,
        default=0
    )

    evaluation_metrics: Mapped[dict] = mapped_column(
        JSONB,
        default=dict
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        default=False
    )

    trained_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now()
    )