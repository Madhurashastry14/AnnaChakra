from contextlib import nullcontext

import pandas as pd

from ml.forecasting import retrain
from ml.forecasting.train import institutional_records


def test_insufficient_data_leaves_registry_untouched(monkeypatch):
    class ReadOnlyFactory:
        def __call__(self):
            return nullcontext(object())

    monkeypatch.setattr(retrain, "extract_records", lambda session: pd.DataFrame())
    assert "Insufficient" in retrain.retrain(ReadOnlyFactory())


def test_unlinked_meals_remain_available_only_for_history():
    rows = pd.DataFrame({
        "meal_date": ["2026-01-01", "2026-01-02"], "kitchen_key": ["1", "1"],
        "food_item_name": ["1", "1"], "meal_type": ["LUNCH", "LUNCH"],
        "serving_unit": ["serving", "serving"], "expected_people": [None, 10],
        "actual_people": [10, 10], "default_servings_per_person": [1, 1],
        "prepared_servings": [12, 12], "leftover_servings": [2, 1],
        "plate_waste_servings": [None, None], "shortage_occurred": [False, False],
    })
    assert len(institutional_records(rows)) == 1
    history = institutional_records(rows, keep_history_only=True)
    assert history.observed_demand.tolist() == [10, 11]
    assert history.expected_people.isna().sum() == 1


def test_candidate_requires_test_and_validation_gain_for_each_unit():
    report = {"serving": {
        "ML": {"records": 20, "wape": 0.09}, "BASELINE": {"wape": 0.18},
        "LOCAL_HISTORY": {"wape": 0.1},
    }}
    metadata = {"supported_quantity_units": ["serving"], "metrics": {"validation": report, "test": report}}
    assert retrain.eligible(metadata)
    metadata["supported_quantity_units"].append("piece")
    assert not retrain.eligible(metadata)
