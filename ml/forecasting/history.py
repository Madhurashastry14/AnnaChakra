"""Serving-rate forecasting independent of any model or ML dependency."""
from dataclasses import dataclass
from datetime import date, timedelta
from math import isfinite

HISTORY_WINDOW_DAYS = 90
SMOOTHING = 10


@dataclass(frozen=True)
class Observation:
    kitchen_key: str
    food_key: str
    meal_type: str
    meal_date: date
    actual_people: int
    prepared: float
    leftover: float
    shortage: bool
    plate_waste: float | None = None

    @property
    def served(self):
        return self.prepared - self.leftover

    @property
    def valid(self):
        return (
            self.actual_people > 0 and not self.shortage
            and isfinite(self.prepared) and isfinite(self.leftover)
            and 0 <= self.leftover <= self.prepared
            and (self.plate_waste is None or (
                isfinite(self.plate_waste) and 0 <= self.plate_waste <= self.served + 1e-9
            ))
        )


def eligible_history(observations, kitchen_key, food_key, meal_type, meal_date,
                     window_days=HISTORY_WINDOW_DAYS):
    if window_days is not None and window_days <= 0:
        raise ValueError("History window must be positive")
    cutoff = meal_date - timedelta(days=window_days) if window_days is not None else date.min
    return [row for row in observations
            if (row.kitchen_key, row.food_key, row.meal_type) == (kitchen_key, food_key, meal_type)
            and cutoff <= row.meal_date < meal_date and row.valid]


def blended_rate(default_rate, historical_rate, count, smoothing=SMOOTHING):
    if not isfinite(smoothing) or smoothing <= 0:
        raise ValueError("Smoothing must be finite and positive")
    if not count:
        return default_rate
    weight = count / (count + smoothing)
    return weight * historical_rate + (1 - weight) * default_rate


def serving_rate(history):
    if not history:
        return None
    return sum(row.served for row in history) / sum(row.actual_people for row in history)


def forecast_quantity(expected_people, default_rate, history=(), smoothing=SMOOTHING):
    if expected_people <= 0 or not isfinite(default_rate) or default_rate <= 0:
        raise ValueError("Expected attendance and catalogue serving rate must be positive")
    return expected_people * blended_rate(default_rate, serving_rate(history), len(history), smoothing)
