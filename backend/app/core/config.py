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

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()