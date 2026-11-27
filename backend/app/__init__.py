"""Backend package, including support for the sibling forecasting package."""
import sys
from pathlib import Path

# The backend entry point also runs with backend/ as its working directory.
_project_root = Path(__file__).resolve().parents[2]
if (_project_root / "ml" / "forecasting").is_dir():
    sys.path.append(str(_project_root))
