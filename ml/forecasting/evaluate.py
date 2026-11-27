"""Evaluate quantity forecasts, preserving the meaning of each quantity unit."""
import numpy as np
from sklearn.metrics import mean_absolute_error, r2_score, root_mean_squared_error


def metrics(actual, predicted):
    denominator = np.abs(actual).sum()
    return {
        "records": len(actual),
        "mae": float(mean_absolute_error(actual, predicted)),
        "rmse": float(root_mean_squared_error(actual, predicted)),
        "wape": float(np.abs(actual - predicted).sum() / denominator) if denominator else None,
        "r2": float(r2_score(actual, predicted)) if len(actual) > 1 and np.ptp(actual) else None,
    }


def evaluate(frame, predictions):
    return {
        unit: {method: metrics(group.observed_demand.to_numpy(), np.asarray(values)[positions])
               for method, values in predictions.items()}
        for unit, positions in frame.groupby("serving_unit").indices.items()
        for group in [frame.iloc[positions]]
    }


def comparison_plot(frame, predictions, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    groups = frame.groupby("serving_unit").indices
    figure, axes = plt.subplots(1, len(groups), figsize=(5 * len(groups), 5), squeeze=False)
    for ax, (unit, positions) in zip(axes[0], groups.items()):
        actual = frame.iloc[positions].observed_demand
        predicted = np.asarray(predictions)[positions]
        limit = max(actual.max(), predicted.max())
        ax.scatter(actual, predicted, alpha=0.35, s=9)
        ax.plot([0, limit], [0, limit], color="black")
        ax.set(xlabel="Observed", ylabel="Predicted", title=unit)
    figure.tight_layout()
    figure.savefig(path)
    plt.close(figure)
