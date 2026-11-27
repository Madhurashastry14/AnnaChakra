from datetime import date, timedelta

import pytest

from ml.forecasting.history import Observation
from ml.forecasting.menu import CHOICE, FIXED, MAIN, Dish
from ml.forecasting.menu_history import MealSample, personalized_menu

DISHES = (Dish("chapati", MAIN, 3), Dish("rice", MAIN, 1), Dish("biryani", MAIN, 1))
TARGET = date(2026, 6, 1)


def meal(kitchen, portions, *, mode=CHOICE, days=1, shortage=False, complete=True):
    day = TARGET - timedelta(days=days)
    observations = tuple(Observation(kitchen, dish.key, "LUNCH", day, 100, prepared, 0,
                                     shortage and index == 0)
                         for index, (dish, prepared) in enumerate(zip(DISHES, portions)))
    return MealSample(kitchen, day, "LUNCH", mode, 100, DISHES,
                      observations if complete else observations[:-1])


def predict(history, kitchen="a"):
    return personalized_menu(DISHES, 300, CHOICE, kitchen, "LUNCH", TARGET, history)


def test_preferences_shrink_to_prior_and_isolate_kitchens():
    a = [meal("a", (240, 10, 10), days=day) for day in range(1, 11)]
    b = [meal("b", (30, 80, 10), days=day) for day in range(1, 11)]
    single = predict(a[:1])
    learned = predict(a + b)
    other = predict(a + b, "b")
    assert 100 < single["chapati"].diners < learned["chapati"].diners
    assert learned["chapati"].share == pytest.approx((1/3 + 0.8) / 2)
    assert other["rice"].diners > other["chapati"].diners
    assert learned["chapati"].history_count == 10
    assert sum(item.diners for item in learned.values()) == 300


def test_fixed_unknown_incomplete_shortage_and_same_day_do_not_inform_choices():
    history = [meal("a", (300, 0, 0), **flags) for flags in
               ({"mode": FIXED}, {"mode": None}, {"complete": False},
                {"shortage": True}, {"days": 0}, {"days": -1})]
    assert all(item.diners == 100 and not item.history_count for item in predict(history).values())
