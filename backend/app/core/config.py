from pathlib import Path

from pydantic import Field
from ml.vision.config import ARTIFACTS, MAX_PIXELS
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    VISION_UPLOAD_DIR: Path = Path(__file__).resolve().parents[2] / "uploads" / "vision"
    VISION_ARTIFACT_DIR: Path = ARTIFACTS
    VISION_MAX_BYTES: int = Field(default=5 * 1024 * 1024, gt=0)
    VISION_MAX_PIXELS: int = Field(default=MAX_PIXELS, gt=0)
    VISION_CONFIDENCE_THRESHOLD: float = Field(default=0.65, ge=0, le=1)
    SAFETY_POLICY_PATH: Path | None = None
    WASTE_MIN_RECORDS: int = Field(default=5, ge=2)
    WASTE_MIN_COVERAGE: float = Field(default=80, ge=0, le=100)
    WASTE_SURPLUS_THRESHOLD: float = Field(default=15, gt=0, le=100)
    WASTE_PLATE_THRESHOLD: float = Field(default=15, gt=0, le=100)
    WASTE_SHORTAGE_THRESHOLD: float = Field(default=20, gt=0, le=100)
    WASTE_EFFICIENT_THRESHOLD: float = Field(default=5, ge=0, le=100)
    WASTE_EFFICIENCY_FLOOR: float = Field(default=65, ge=0, le=100)
    WASTE_PREFERENCE_CHANGE: float = Field(default=25, gt=0)

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()