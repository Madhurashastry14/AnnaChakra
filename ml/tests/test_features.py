import pandas as pd
import pytest

from ml.forecasting.features import chronological_split, temporal_features
from ml.forecasting.inspect_dataset import WORKBOOK
from ml.forecasting.preprocessing import restaurant_records


def test_same_day_records_never_see_each_other():
    rows = pd.DataFrame({
        "meal_date": pd.to_datetime(["2025-01-01", "2025-01-02", "2025-01-02", "2025-01-03"]),
        "dish": ["rice"] * 4,
        "observed_demand": [10, 30, 50, 60],
    })
    features = temporal_features(rows, ["dish"])
    assert features.history_count.tolist() == [0, 1, 1, 3]
    assert features.rolling_7.iloc[1:].tolist() == [10, 10, 30]


@pytest.mark.skipif(not WORKBOOK.is_file(), reason="Local Kaggle workbook is unavailable")
def test_workbook_and_chronological_split():
    rows = restaurant_records(pd.read_excel(WORKBOOK))
    assert len(rows) == 1000
    assert rows.censored.sum() == 69
    train, validation, test = chronological_split(rows)
    assert train.meal_date.max() < validation.meal_date.min()
    assert validation.meal_date.max() < test.meal_date.min()
    assert sum(map(len, (train, validation, test))) == len(rows)
