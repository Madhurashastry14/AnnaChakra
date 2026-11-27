"""Evaluate the selected checkpoint on the held-out manifest partition."""
import argparse
import json
from pathlib import Path

from ml.vision.config import ARTIFACTS, DATASET
from ml.vision.train import (
    HISTORY_FILE, METADATA_FILE, MODEL_FILE, load_partition, read_manifest, tensorflow_for_cli,
)


def evaluate(root, output):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from sklearn.metrics import ConfusionMatrixDisplay, accuracy_score, classification_report, confusion_matrix

    tf = tensorflow_for_cli(output)
    manifest, digest = read_manifest(output)
    metadata_path = output / METADATA_FILE
    metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
    classes = manifest["classes"]
    if digest != metadata["manifest_sha256"] or classes != metadata["class_names"]:
        raise ValueError("The held-out manifest does not match the trained artifact")
    history = json.loads((output / HISTORY_FILE).read_text(encoding="utf-8"))
    model = tf.keras.models.load_model(output / MODEL_FILE, compile=False, safe_mode=True)
    x, y = load_partition(root, manifest["splits"]["test"], classes)
    predictions = model.predict(x, batch_size=16, verbose=0)
    labels = list(range(len(classes)))
    classified = predictions.argmax(axis=1)
    stats = classification_report(y, classified, labels=labels, target_names=classes,
                                  output_dict=True, zero_division=0)
    confusion = confusion_matrix(y, classified, labels=labels)
    pairs = sorted(
        ((int(confusion[i, j]), classes[i], classes[j]) for i in labels for j in labels
         if i != j and confusion[i, j]), reverse=True,
    )
    result = {
        "test_count": len(y), "accuracy": float(accuracy_score(y, classified)),
        "macro_precision": stats["macro avg"]["precision"], "macro_recall": stats["macro avg"]["recall"],
        "macro_f1": stats["macro avg"]["f1-score"], "weighted_f1": stats["weighted avg"]["f1-score"],
        "per_class": {name: stats[name] for name in classes}, "confusion_matrix": confusion.tolist(),
        "class_order": classes, "confused_pairs": pairs, "history": history,
    }
    figure, ax = plt.subplots(figsize=(9, 7))
    ConfusionMatrixDisplay(confusion, display_labels=classes).plot(ax=ax, xticks_rotation=45, colorbar=False)
    figure.tight_layout()
    figure.savefig(output / "confusion_matrix.png")
    plt.close(figure)
    for name in ("accuracy", "loss"):
        figure, ax = plt.subplots()
        epochs = range(1, len(history[name]) + 1)
        ax.plot(epochs, history[name], label="Training")
        ax.plot(epochs, history[f"val_{name}"], label="Validation")
        ax.set(xlabel="Epoch", ylabel=name.title())
        ax.legend()
        figure.savefig(output / f"training_{name}.png")
        plt.close(figure)
    metadata["evaluation_metrics"] = {key: result[key] for key in
                                      ("accuracy", "macro_precision", "macro_recall", "macro_f1", "weighted_f1")}
    metadata_path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    (output / "evaluation_results.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps(metadata["evaluation_metrics"], indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dataset", type=Path, default=DATASET)
    parser.add_argument("--output", type=Path, default=ARTIFACTS)
    args = parser.parse_args()
    evaluate(args.dataset, args.output)


if __name__ == "__main__":
    main()
