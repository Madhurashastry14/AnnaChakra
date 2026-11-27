import pandas as pd

from ml.forecasting.generate_dataset import generate_dataset


def test_synthetic_records():
    data = generate_dataset(days=10)
    pd.testing.assert_frame_equal(data, generate_dataset(days=10))
    meals = data.groupby(["kitchen_key", "meal_date", "meal_type"])
    assert meals[["expected_people", "actual_people"]].nunique().eq(1).all().all()
    assert data.kitchen_key.nunique() == 8
    assert data.is_synthetic.all()
    assert (data.expected_people != data.actual_people).any()
    assert data.shortage_occurred.any()
    assert (data.leftover_servings > 0).any()
    served = data.prepared_servings - data.leftover_servings
    assert (served >= 0).all()
    assert (data.plate_waste_servings <= served + 1e-9).all()
    piece_columns = ["prepared_servings", "leftover_servings", "plate_waste_servings"]
    assert (data.loc[data.serving_unit == "piece", piece_columns] % 1 == 0).all().all()
