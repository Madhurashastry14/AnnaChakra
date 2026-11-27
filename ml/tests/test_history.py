from datetime import date
from dataclasses import replace

import pytest

from ml.forecasting.history import Observation, eligible_history, forecast_quantity


def test_new_and_personalized_kitchen():
    assert forecast_quantity(100, 2) == 200
    row = Observation("a", "rice", "LUNCH", date(2025, 1, 1), 40, 50, 10, False)
    assert forecast_quantity(100, 2, [row]) == pytest.approx(100 * (1 + 20) / 11)
    assert forecast_quantity(100, 2, [row] * 10) == pytest.approx(150)


def test_history_excludes_invalid_unrelated_and_nonpreceding_records():
    row = Observation("a", "rice", "LUNCH", date(2025, 1, 2), 10, 20, 5, False)
    target = date(2025, 1, 3)
    rows = [row, replace(row, kitchen_key="b"), replace(row, food_key="dosa"),
            replace(row, meal_type="DINNER"), replace(row, meal_date=target),
            replace(row, meal_date=date(2024, 1, 1)), replace(row, actual_people=0),
            replace(row, shortage=True), replace(row, leftover=21),
            replace(row, prepared=float("inf")), replace(row, plate_waste=16)]
    assert eligible_history(rows, "a", "rice", "LUNCH", target) == [row]
