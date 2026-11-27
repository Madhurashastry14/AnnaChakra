"""Measure the local image dataset and produce deterministic, deduplicated splits."""
import argparse
import hashlib
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image

from ml.vision.config import ARTIFACTS, CLASSES, DATASET, SEED
from ml.vision.preprocessing import decode_image

SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
SPLITS = {"train": 70, "validation": 16, "test": 14}


def difference_hash(image):
    pixels = list(image.convert("L").resize((9, 8), Image.Resampling.BILINEAR).get_flattened_data())
    return sum(1 << (y * 8 + x) for y in range(8) for x in range(8)
               if pixels[y * 9 + x] > pixels[y * 9 + x + 1])


def inspect(root=DATASET, classes=CLASSES, seed=SEED):
    root = Path(root)
    folders = sorted(path for path in root.iterdir() if path.is_dir())
    counts, formats, dimensions = {}, Counter(), Counter()
    invalid, unsupported, candidates = [], [], []
    hashes = {}
    exact, near = [], []
    for folder in folders:
        counts[folder.name] = {"files": 0, "valid": 0}
        for path in sorted(folder.rglob("*")):
            if not path.is_file():
                continue
            record = {"path": path.relative_to(root).as_posix(), "label": folder.name}
            counts[folder.name]["files"] += 1
            if path.suffix.lower() not in SUFFIXES:
                unsupported.append(record["path"])
                continue
            try:
                image, format_name = decode_image(path)
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                pixels = hashlib.sha256(str(image.size).encode() + image.tobytes()).hexdigest()
            except (OSError, ValueError, SyntaxError, Image.DecompressionBombError):
                invalid.append(record["path"])
                continue
            counts[folder.name]["valid"] += 1
            formats[format_name] += 1
            dimensions[f"{image.width}x{image.height}"] += 1
            if pixels in hashes:
                exact.append([hashes[pixels], record["path"]])
            else:
                hashes[pixels] = record["path"]
            if folder.name in classes:
                candidates.append((record | {"sha256": digest}, pixels, difference_hash(image)))
    # Group exact-pixel and near matches transitively across all selected classes.
    groups = list(range(len(candidates)))

    def group(index):
        while groups[index] != index:
            index = groups[index]
        return index

    for i, (record, digest, perceptual) in enumerate(candidates):
        for j, (other, other_digest, other_hash) in enumerate(candidates[:i]):
            same = digest == other_digest
            similar = (perceptual ^ other_hash).bit_count() <= 3
            if same or similar:
                groups[group(i)] = group(j)
                if similar and not same:
                    near.append([other["path"], record["path"]])
    components = defaultdict(list)
    for index, (record, _, _) in enumerate(candidates):
        components[group(index)].append(record)
    buckets = defaultdict(list)
    conflicts = []
    for records in components.values():
        if len({record["label"] for record in records}) > 1:
            conflicts.extend(record["path"] for record in records)
        else:
            buckets[records[0]["label"]].append(records[0])
    manifest = {split: [] for split in SPLITS}
    rng = random.Random(seed)
    for label in classes:
        records = buckets[label]
        rng.shuffle(records)
        sizes = {name: len(records) * ratio // 100 for name, ratio in SPLITS.items()}
        order = sorted(SPLITS, key=lambda name: len(records) * SPLITS[name] % 100, reverse=True)
        for name in order[:len(records) - sum(sizes.values())]:
            sizes[name] += 1
        cursor = 0
        for name, size in sizes.items():
            manifest[name].extend(records[cursor:cursor + size])
            cursor += size
    selected = {label: len(buckets[label]) for label in classes}
    report = {"classes": counts, "formats": dict(formats), "dimensions": dict(dimensions),
              "unreadable": invalid, "unsupported": unsupported, "exact_duplicates": exact,
              "potential_near_duplicates": near, "conflicting_images_removed": conflicts,
              "missing_classes": [label for label in classes if not selected[label]],
              "selected_counts": selected, "selected_class_imbalance": max(selected.values()) - min(selected.values()),
              "split_counts": {name: len(rows) for name, rows in manifest.items()}}
    return report, {"classes": list(classes), "seed": seed, "splits": manifest}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=ARTIFACTS)
    args = parser.parse_args()
    report, manifest = inspect(args.dataset)
    args.output.mkdir(parents=True, exist_ok=True)
    for name, payload in (("dataset_inspection", report), ("dataset_split", manifest)):
        (args.output / f"{name}.json").write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(json.dumps({key: report[key] for key in ("selected_counts", "split_counts", "missing_classes")}, indent=2))


if __name__ == "__main__":
    main()
