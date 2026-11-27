"""Date-based features with strictly earlier observations."""
import numpy as np
import pandas as pd

CALENDAR = ["day_of_week", "month", "weekend"]
HISTORY = ["previous_demand", "rolling_7", "rolling_30", "history_count"]
RESTAURANT_KEYS = ["restaurant_id", "food_item"]
INSTITUTIONAL_KEYS = ["kitchen_key", "food_item_name", "meal_type"]


def calendar_features(frame):
    frame = frame.copy()
    dates = pd.to_datetime(frame["meal_date"])
    frame["day_of_week"] = dates.dt.day_of_week
    frame["month"] = dates.dt.month
    frame["weekend"] = (frame["day_of_week"] >= 5).astype(int)
    return frame


def temporal_features(frame, keys, *, institutional=False, window_days=90):
    """Use date batches, with stable source order to break earlier-date ties."""
    result = calendar_features(frame).sort_values("meal_date", kind="stable").reset_index(drop=True)
    names = HISTORY + (["historical_rate"] if institutional else [])
    output = np.full((len(result), len(names)), np.nan)
    for _, group in result.groupby(keys, sort=False):
        history = []
        for date, batch in group.groupby("meal_date", sort=False):
            if institutional and window_days is not None:
                cutoff = date - pd.Timedelta(days=window_days)
                history = [row for row in history if row[0] >= cutoff]
            demand = [row[1] for row in history]
            values = [
                demand[-1] if demand else np.nan,
                np.mean(demand[-7:]) if demand else np.nan,
                np.mean(demand[-30:]) if demand else np.nan,
                len(demand),
            ]
            if institutional:
                values.append(sum(demand) / sum(row[2] for row in history) if history else np.nan)
            output[batch.index] = values
            for row in batch.itertuples():
                history.append((date, row.observed_demand, row.actual_people if institutional else None))
    result[names] = output
    return result


def chronological_split(frame):
    dates = pd.Index(frame["meal_date"].unique()).sort_values()
    train_end, validation_end = int(len(dates) * 0.7), int(len(dates) * 0.85)
    if not 0 < train_end < validation_end < len(dates):
        raise ValueError("Too few unique dates for chronological training, validation and testing")
    return tuple(frame[frame["meal_date"].isin(part)] for part in
                 (dates[:train_end], dates[train_end:validation_end], dates[validation_end:]))
