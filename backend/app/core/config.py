from pathlib import Path

from math import isfinite

from pydantic import Field, field_validator
from ml.vision.config import ARTIFACTS, MAX_PIXELS
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    DATABASE_URL: str
    SECRET_KEY: str
    APP_ENV: str = Field(default="development", min_length=1)
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    VISION_UPLOAD_DIR: Path = Path(__file__).resolve().parents[2] / "uploads" / "vision"
    VISION_ARTIFACT_DIR: Path = ARTIFACTS
    VISION_MAX_BYTES: int = Field(default=5 * 1024 * 1024, gt=0)
    VISION_MAX_PIXELS: int = Field(default=MAX_PIXELS, gt=0)
    VISION_CONFIDENCE_THRESHOLD: float = Field(default=0.65, ge=0, le=1)
    SAFETY_POLICY_PATH: Path | None = None
    REDISTRIBUTION_TIMEZONE: str = "Asia/Kolkata"
    MATCH_MAX_DISTANCE_KM: float = Field(default=25, gt=0, le=100)
    MATCH_ROAD_FACTOR: float = Field(default=1.6, ge=1, le=5)
    MATCH_SPEED_KMH: float = Field(default=20, gt=0, le=60)
    MATCH_HANDLING_MINUTES: int = Field(default=15, ge=1, le=120)
    MATCH_WEIGHTS: tuple[float, float, float, float] = (0.35, 0.30, 0.20, 0.15)
    WASTE_MIN_RECORDS: int = Field(default=5, ge=2)
    WASTE_MIN_COVERAGE: float = Field(default=80, ge=0, le=100)
    WASTE_SURPLUS_THRESHOLD: float = Field(default=15, gt=0, le=100)
    WASTE_PLATE_THRESHOLD: float = Field(default=15, gt=0, le=100)
    WASTE_SHORTAGE_THRESHOLD: float = Field(default=20, gt=0, le=100)
    WASTE_EFFICIENT_THRESHOLD: float = Field(default=5, ge=0, le=100)
    WASTE_EFFICIENCY_FLOOR: float = Field(default=65, ge=0, le=100)
    WASTE_PREFERENCE_CHANGE: float = Field(default=25, gt=0)

    MENU_SCORE_WEIGHTS: tuple[float, float, float, float, float] = (0.30, 0.25, 0.25, 0.10, 0.10)

    @field_validator("MENU_SCORE_WEIGHTS", "MATCH_WEIGHTS")
    @classmethod
    def valid_menu_weights(cls, values):
        if not all(isfinite(value) and 0 <= value <= 1 for value in values) or not sum(values):
            raise ValueError("Menu score weights must be within [0, 1], with a positive sum")
        return values

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        extra="ignore"
    )


settings = Settings()