import pandas as pd

from ml.forecasting.features import chronological_split
from ml.forecasting.generate_dataset import generate_dataset
from ml.forecasting.menu_features import CATEGORIES, NUMBERS, menu_model_inputs, training_menu_features


def test_menu_features_are_chronological_and_use_only_prior_feedback():
    raw = generate_dataset(days=8)
    sample = raw[~raw.menu_id.isin(raw.loc[raw.shortage_occurred, "menu_id"])].copy()
    original = training_menu_features(sample)
    cutoff = original.meal_date.sort_values().unique()[3]
    same_or_future = sample.meal_date.ge(cutoff)
    sample.loc[same_or_future, "prepared_servings"] += 25
    changed = training_menu_features(sample)
    before = original.meal_date.le(cutoff)
    pd.testing.assert_frame_equal(
        original.loc[before, CATEGORIES + NUMBERS], changed.loc[before, CATEGORIES + NUMBERS]
    )
    parts = chronological_split(original)
    ids = [set(part.menu_id) for part in parts]
    assert not ids[0] & ids[1] and not ids[1] & ids[2]
    assert list(menu_model_inputs(original)) == CATEGORIES + NUMBERS + ["menu_tokens"]
    assert "selected_diners" not in menu_model_inputs(original)


def test_shortage_censors_entire_menu():
    source = generate_dataset(days=2)
    meal_id = source.menu_id.iat[0]
    source.loc[source.menu_id.eq(meal_id), "shortage_occurred"] = False
    source.loc[source.index[0], "shortage_occurred"] = True
    assert meal_id not in set(training_menu_features(source).menu_id)


def test_model_recipient_caps_are_based_on_the_predicted_main_allocation():
    from ml.forecasting.menu import ACCOMPANIMENT, CHOICE, MAIN
    from ml.forecasting.menu_train import constrained_predictions
    import pytest

    rows = [
        {"food_item_name": key, "food_role": role, "default_servings_per_person": portion,
         "compatible_keys": compatible, "history_count": 0, "expected_people": 7,
         "menu_mode": CHOICE}
        for key, role, portion, compatible in (
            ("chapati", MAIN, 3, ()), ("rice", MAIN, 1, ()),
            ("sambar", ACCOMPANIMENT, 1, ("rice",)),
        )
    ]
    predictions = constrained_predictions(rows, [3.0, 1.0, 1.0])
    assert predictions["chapati"].quantity == 15
    assert predictions["rice"].diners == predictions["sambar"].diners == 2
    assert constrained_predictions(rows, [0.0, -1.0, 1.0])["chapati"].diners == 4
    with pytest.raises(ValueError, match="finite"):
        constrained_predictions(rows, [1, float("inf"), 0])
