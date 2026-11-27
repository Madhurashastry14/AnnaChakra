from pathlib import Path

ML_ROOT = Path(__file__).resolve().parents[1]
DATASET = ML_ROOT / "datasets" / "vision"
ARTIFACTS = ML_ROOT / "artifacts" / "vision"
CLASSES = ("aloo_gobi", "biryani", "chana_masala", "chapati", "dal_tadka",
           "kuzhi_paniyaram", "palak_paneer", "poha")
IMAGE_SIZE = (224, 224)
SEED = 42
MAX_PIXELS = 20_000_000
FORMATS = {"JPEG": ".jpg", "PNG": ".png", "WEBP": ".webp"}
