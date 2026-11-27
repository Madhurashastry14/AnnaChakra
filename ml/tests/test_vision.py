from io import BytesIO

import numpy as np
import pytest

pytest.importorskip("PIL")
from PIL import Image

from ml.vision import predict as vision
from ml.vision.config import CLASSES, IMAGE_SIZE
from ml.vision.inspect_dataset import inspect
from ml.vision.preprocessing import decode_image, mobilenet_input
from ml.vision.train import load_partition


def test_inspection_duplicate_prevention_and_shared_preprocessing(tmp_path):
    labels = CLASSES[:2]
    rng = np.random.default_rng(42)
    for label in labels:
        folder = tmp_path / label
        folder.mkdir()
        for index in range(10):
            array = rng.integers(0, 256, size=(34, 29, 3), dtype=np.uint8)
            Image.fromarray(array).save(folder / f"{index}.png")
    folder = tmp_path / labels[0]
    (folder / "copy.png").write_bytes((folder / "0.png").read_bytes())
    (folder / "broken.png").write_text("invalid", encoding="utf-8")
    report, manifest = inspect(tmp_path, labels)
    assert inspect(tmp_path, labels) == (report, manifest)
    assert len(report["unreadable"]) == len(report["exact_duplicates"]) == 1
    assert report["split_counts"] == {"train": 14, "validation": 4, "test": 2}
    rows = [row for group in manifest["splits"].values() for row in group]
    assert len(rows) == len({row["sha256"] for row in rows})
    x, _ = load_partition(tmp_path, [rows[0]], list(labels))
    image, _ = decode_image(tmp_path / rows[0]["path"])
    np.testing.assert_array_equal(x[0], mobilenet_input(image))
    assert x[0].shape == (*IMAGE_SIZE, 3)


def test_unavailable_low_confidence_and_top_three(tmp_path, monkeypatch):
    image = Image.new("RGB", IMAGE_SIZE)
    assert vision.predict(image, tmp_path)["model_version"] is None
    for name in (vision.MODEL_FILE, vision.METADATA_FILE, vision.CLASSES_FILE):
        (tmp_path / name).write_text("bad artifact", encoding="utf-8")
    def corrupt(*args):
        raise ValueError("corrupt")
    monkeypatch.setattr(vision, "_load", corrupt)
    assert vision.predict(image, tmp_path)["model_version"] is None
    def model(batch, *, training):
        assert not training and batch.shape == (1, *IMAGE_SIZE, 3)
        return [[0.35, 0.22, 0.12, 0.10, 0.07, 0.06, 0.05, 0.03]]
    monkeypatch.setattr(vision, "_load", lambda *args: (model, CLASSES, "test"))
    result = vision.predict(image, tmp_path)
    assert result["model_version"] == "test"
    assert [row["label"] for row in result["top_predictions"]] == list(CLASSES[:3])
    assert result["warnings"] and "Low confidence" in result["warnings"][0]
