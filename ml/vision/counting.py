"""Conservative contour counting on plain backgrounds with separated pieces."""
from dataclasses import dataclass, field
from math import pi


SUPPORTED = frozenset({"chapati", "kuzhi_paniyaram", "idli", "poori", "dosa"})
METHOD = "OPENCV_CONTOUR"


def food_key(name):
    return "_".join(name.casefold().replace("_", " ").split())


@dataclass(frozen=True)
class CountResult:
    counting_status: str
    estimated_servings: int | None = None
    counting_method: str | None = None
    boxes: list[list[float]] = field(default_factory=list)
    counting_warnings: list[str] = field(default_factory=list)
    requires_quantity_confirmation: bool = True


def count_visible(image, food):
    if food_key(food) not in SUPPORTED:
        return CountResult("UNSUPPORTED_FOOD", counting_warnings=["Enter the quantity manually for this food."])
    try:
        import cv2
        import numpy as np
    except ImportError:
        return CountResult("DETECTION_FAILED", counting_warnings=["Counting is unavailable. Enter quantity manually."])

    def reject(reason, status="UNSUITABLE_IMAGE"):
        return CountResult(status, counting_method=METHOD, counting_warnings=[reason])

    rgb = np.asarray(image.convert("RGB"))
    height, width = rgb.shape[:2]
    if min(height, width) < 100:
        return reject("Use a larger, well-lit image with separated pieces.")
    scale = min(1, 800 / max(height, width))
    rgb = cv2.resize(rgb, (round(width * scale), round(height * scale)), interpolation=cv2.INTER_AREA)
    if min(rgb.shape[:2]) < 80:
        return reject("The image is too narrow for a reliable count.")
    lab = cv2.cvtColor(cv2.GaussianBlur(rgb, (5, 5), 0), cv2.COLOR_RGB2LAB).astype(np.float32)
    border = np.concatenate((lab[:5].reshape(-1, 3), lab[-5:].reshape(-1, 3),
                             lab[:, :5].reshape(-1, 3), lab[:, -5:].reshape(-1, 3)))
    background = np.median(border, axis=0)
    if background[0] < 30 or np.percentile(np.linalg.norm(border - background, axis=1), 90) > 22:
        return reject("The image is dark or lacks a uniform background.")
    difference = np.clip(np.linalg.norm(lab - background, axis=2), 0, 255).astype(np.uint8)
    if np.percentile(difference, 98) < 22:
        return reject("No clearly separated foreground pieces were detected.", "DETECTION_FAILED")
    threshold, _ = cv2.threshold(difference, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    mask = (difference > max(16, threshold)).astype(np.uint8)
    if mask[0].any() or mask[-1].any() or mask[:, 0].any() or mask[:, -1].any():
        return reject("Foreground touches the image border. Include all piece edges.")
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
    mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
    total = mask.size
    if not 0.015 <= mask.mean() <= 0.65:
        return reject("Foreground coverage is too small or poorly separated.")
    components, _, stats, _ = cv2.connectedComponentsWithStats(mask)
    substantial = stats[1:, cv2.CC_STAT_AREA] >= total * 0.006
    if components - 1 - int(substantial.sum()) > 5:
        return reject("The image contains too much foreground noise.")
    contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    objects = [(cv2.contourArea(c), c) for c in contours if cv2.contourArea(c) >= total * 0.006]
    if not objects or len(objects) > 40:
        return reject("Could not isolate a defensible set of pieces.", "DETECTION_FAILED")
    median_area = float(np.median([area for area, _ in objects]))
    boxes = []
    h, w = mask.shape
    for area, contour in objects:
        perimeter = cv2.arcLength(contour, True)
        hull_area = cv2.contourArea(cv2.convexHull(contour))
        x, y, bw, bh = cv2.boundingRect(contour)
        if (not 0.55 <= area / median_area <= 1.65 or area > 0.32 * total
                or not perimeter or 4 * pi * area / perimeter**2 < 0.68
                or not hull_area or area / hull_area < 0.90 or min(bw, bh) / max(bw, bh) < 0.55):
            return reject("Irregular or overlapping pieces prevent a defensible estimate.")
        if min(x, y, w - x - bw, h - y - bh) <= 2:
            return reject("Foreground is clipped by the image border.")
        boxes.append([round(v, 5) for v in (x / w, y / h, bw / w, bh / h)])
    return CountResult("ESTIMATED", len(boxes), METHOD, sorted(boxes),
                       ["Experimental estimate of visible pieces only. Confirm the quantity."])
