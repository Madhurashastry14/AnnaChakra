"""Shared decoding and MobileNetV2 input preprocessing."""
from PIL import Image, ImageOps

from ml.vision.config import FORMATS, IMAGE_SIZE, MAX_PIXELS


class ImageLimitError(ValueError):
    pass


def decode_image(source, max_pixels=MAX_PIXELS):
    with Image.open(source, formats=list(FORMATS)) as image:
        if image.width * image.height > max_pixels:
            raise ImageLimitError("Decoded image dimensions exceed the configured limit")
        if getattr(image, "n_frames", 1) != 1:
            raise ValueError("Only still images are supported")
        format_name = image.format
        image.verify()
    if hasattr(source, "seek"):
        source.seek(0)
    with Image.open(source, formats=list(FORMATS)) as image:
        return ImageOps.exif_transpose(image).convert("RGB"), format_name


def resize(image):
    return image.resize(IMAGE_SIZE, Image.Resampling.BILINEAR)


def mobilenet_input(image):
    import numpy as np
    return np.asarray(resize(image), dtype=np.float32) / 127.5 - 1.0
