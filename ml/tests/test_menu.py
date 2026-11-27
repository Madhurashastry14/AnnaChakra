import pytest

from ml.forecasting.menu import ACCOMPANIMENT, CHOICE, FIXED, MAIN, Dish, forecast_menu

MAINS = [Dish("chapati", MAIN, 3), Dish("rice", MAIN, 1), Dish("biryani", MAIN, 1)]


def test_three_choice_mains_allocate_exactly_200():
    result = forecast_menu(MAINS, 200, CHOICE)
    assert [item.diners for item in result.values()] == [67, 67, 66]
    assert [item.quantity for item in result.values()] == [201, 67, 66]


def test_accompaniment_uses_only_compatible_main_recipients():
    dishes = MAINS[:2] + [Dish("sambar", ACCOMPANIMENT, 1, 0.6, compatible=("rice",))]
    choice = forecast_menu(dishes, 200, CHOICE)
    fixed = forecast_menu(dishes, 200, FIXED)
    assert [item.quantity for item in choice.values()] == [300, 100, 60]
    assert [item.quantity for item in fixed.values()] == [600, 200, 120]
    assert choice["sambar"].share is None
    assert fixed["rice"].share is None


def test_empty_main_small_attendance_and_invalid_weights():
    result = forecast_menu([Dish("a", None, 1, weight=float("nan")), *MAINS], 1, CHOICE)
    assert result["a"].diners == 1
    assert result["rice"].diners == 0
    assert result["a"].warnings
    result = forecast_menu([Dish("sambar", ACCOMPANIMENT, 1, compatible=("rice",))], 20, CHOICE)
    assert result["sambar"].quantity == 0
    assert len(result["sambar"].warnings) == 2
    with pytest.raises(ValueError):
        forecast_menu([MAINS[0], MAINS[0]], 200, CHOICE)
