import pytest

pytest.importorskip("cv2")
from PIL import Image, ImageDraw

from ml.vision.counting import count_visible


def test_separated_shapes_and_fallbacks():
    image = Image.new("RGB", (480, 300), "white")
    draw = ImageDraw.Draw(image)
    for x in (40, 180, 320):
        draw.ellipse((x, 90, x + 80, 170), fill="#a96735")
    result = count_visible(image, "Chapati")
    assert result.estimated_servings == len(result.boxes) == 3
    assert count_visible(image, "Biryani").counting_status == "UNSUPPORTED_FOOD"
    assert count_visible(Image.new("RGB", image.size, "white"), "Idli").estimated_servings is None
    assert count_visible(Image.new("RGB", image.size, "black"), "Idli").counting_status == "UNSUITABLE_IMAGE"
    draw.ellipse((90, 90, 170, 170), fill="#a96735")
    assert count_visible(image, "Chapati").estimated_servings is None
