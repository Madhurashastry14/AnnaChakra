"""Fit an eight-class head on frozen ImageNet MobileNetV2 features."""
import argparse
import hashlib
import json
import os
from datetime import datetime, timezone
from pathlib import Path
from time import perf_counter
from uuid import uuid4

from ml.vision.config import ARTIFACTS, CLASSES, DATASET, IMAGE_SIZE, SEED
from ml.vision.preprocessing import decode_image, mobilenet_input

MODEL_FILE = "food_classifier.keras"
CLASSES_FILE = "class_names.json"
METADATA_FILE = "vision_metadata.json"
HISTORY_FILE = "training_history.json"
MANIFEST_FILE = "dataset_split.json"


def read_manifest(output):
    path = output / MANIFEST_FILE
    manifest = json.loads(path.read_text(encoding="utf-8"))
    if tuple(manifest["classes"]) != CLASSES:
        raise ValueError("Manifest classes do not match the model configuration")
    seen = set()
    for rows in manifest["splits"].values():
        if {row["label"] for row in rows} != set(CLASSES):
            raise ValueError("Each partition must cover the configured classes")
        for row in rows:
            if row["sha256"] in seen:
                raise ValueError("Manifest contains duplicate images")
            seen.add(row["sha256"])
    return manifest, hashlib.sha256(path.read_bytes()).hexdigest()


def load_partition(root, rows, classes):
    from io import BytesIO

    import numpy as np

    inputs = np.empty((len(rows), *IMAGE_SIZE, 3), dtype=np.float32)
    labels = np.empty(len(rows), dtype=np.int64)
    for index, row in enumerate(rows):
        path = (root / row["path"]).resolve()
        if not path.is_relative_to(root.resolve()):
            raise ValueError("Image path must stay within the dataset")
        payload = path.read_bytes()
        if hashlib.sha256(payload).hexdigest() != row["sha256"]:
            raise ValueError(f"Dataset changed since inspection: {row['path']}")
        image, _ = decode_image(BytesIO(payload))
        inputs[index] = mobilenet_input(image)
        labels[index] = classes.index(row["label"])
    return inputs, labels


def tensorflow_for_cli(output):
    os.environ.setdefault("KERAS_HOME", str(output.resolve()))
    os.environ.setdefault("TF_NUM_INTRAOP_THREADS", "4")
    os.environ.setdefault("TF_NUM_INTEROP_THREADS", "2")
    import tensorflow as tf
    return tf


def build_model(tf):
    keras = tf.keras
    inputs = keras.Input(shape=(*IMAGE_SIZE, 3))
    augmentation = keras.Sequential([
        keras.layers.RandomFlip("horizontal", seed=SEED),
        keras.layers.RandomRotation(0.055, seed=SEED + 1),
        keras.layers.RandomZoom(0.12, seed=SEED + 2),
        keras.layers.RandomBrightness(0.08, value_range=(-1, 1), seed=SEED + 3),
    ], name="training_augmentation")
    base = keras.applications.MobileNetV2(weights="imagenet", include_top=False, input_shape=(*IMAGE_SIZE, 3))
    base.trainable = False
    x = base(augmentation(inputs), training=False)
    x = keras.layers.GlobalAveragePooling2D()(x)
    x = keras.layers.Dropout(0.25, seed=SEED + 4)(x)
    outputs = keras.layers.Dense(len(CLASSES), activation="softmax")(x)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer=keras.optimizers.Adam(learning_rate=0.001),
                  loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    return model


def train(root, output, epochs=8, batch_size=16):
    tf = tensorflow_for_cli(output)
    tf.keras.utils.set_random_seed(SEED)
    tf.config.experimental.enable_op_determinism()
    manifest, manifest_hash = read_manifest(output)
    model = build_model(tf)
    datasets = {}
    for name in ("train", "validation"):
        xy = load_partition(root, manifest["splits"][name], list(CLASSES))
        dataset = tf.data.Dataset.from_tensor_slices(xy)
        if name == "train":
            dataset = dataset.shuffle(len(xy[0]), seed=SEED)
        options = tf.data.Options()
        options.threading.private_threadpool_size = 2
        datasets[name] = dataset.batch(batch_size).with_options(options).prefetch(1)
    checkpoint = output / "best_training_checkpoint.keras"
    callbacks = [
        tf.keras.callbacks.ModelCheckpoint(checkpoint, monitor="val_loss", save_best_only=True),
        tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=2, restore_best_weights=True),
    ]
    started = perf_counter()
    history = model.fit(datasets["train"], validation_data=datasets["validation"],
                        epochs=epochs, callbacks=callbacks, verbose=2).history
    seconds = perf_counter() - started
    os.replace(checkpoint, output / MODEL_FILE)
    metadata = {
        "model_name": "food_classifier", "version": uuid4().hex, "architecture": "MobileNetV2",
        "input_shape": [*IMAGE_SIZE, 3], "class_names": list(CLASSES),
        "dataset_source": "Local Indian Food Images copy (exact upstream release unverified)",
        "manifest_sha256": manifest_hash, "trained_at": datetime.now(timezone.utc).isoformat(),
        "training": {"initial_weights": "imagenet", "base_frozen": True, "optimizer": "Adam",
                     "learning_rate": 0.001, "requested_epochs": epochs, "epochs_run": len(history["loss"]),
                     "fit_seconds": seconds, "batch_size": batch_size, "seed": SEED},
        "split_counts": {name: len(rows) for name, rows in manifest["splits"].items()},
        "evaluation_metrics": None,
        "limitations": ["Small closed-set prepared-food dataset", "No food safety or quantity inference",
                        "Confidence is an uncalibrated softmax score"],
    }
    for name, payload in ((CLASSES_FILE, list(CLASSES)), (METADATA_FILE, metadata), (HISTORY_FILE, history)):
        (output / name).write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Training fit completed in {seconds:.1f} seconds")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=ARTIFACTS)
    parser.add_argument("--epochs", type=int, choices=range(5, 11), default=8)
    args = parser.parse_args()
    train(args.dataset, args.output, epochs=args.epochs)


if __name__ == "__main__":
    main()
