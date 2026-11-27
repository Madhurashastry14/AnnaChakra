from datetime import date, timedelta

from test_forecasts import MENU, api


def test_feedback_updates_history_and_preserves_ownership(api):
    client, actor, _ = api
    forecast = client.post("/api/v1/forecasts", json=MENU).json()
    payload = {
        "forecast_id": forecast["id"], "meal_date": MENU["meal_date"], "meal_type": "LUNCH",
        "actual_people": 20, "items": [{
            "food_item_id": 1, "prepared_servings": 30, "leftover_servings": 5,
            "plate_waste_servings": 2, "shortage_occurred": False,
        }],
    }
    route = "/api/v1/meal-records"
    assert client.post(route, json=payload | {"meal_type": "DINNER"}).status_code == 422
    actor.id = 2
    assert client.post(route, json=payload).status_code == 404
    actor.id = 1
    result = client.post(route, json=payload)
    assert result.status_code == 201, result.text
    saved = result.json()
    item = saved["items"][0]
    assert item["served_servings"] == 25
    assert item["consumed_servings"] == 23
    assert client.post(route, json=payload).status_code == 409
    detail = f"{route}/{saved['id']}"
    assert client.get(detail).json() == saved
    assert client.patch(detail, json={"actual_people": 22}).status_code == 200
    assert client.patch(detail, json={"items": [payload["items"][0] | {
        "plate_waste_servings": 29,
    }]}).status_code == 422
    future = client.post("/api/v1/forecasts", json=MENU | {"meal_date": (date.today() + timedelta(days=1)).isoformat()}).json()
    assert future["items"][0]["historical_observation_count"] == 2
    actor.id = 2
    assert client.get(detail).status_code == 404
    assert client.patch(detail, json={"actual_people": 22}).status_code == 404
    assert client.get(route).json()[0]["forecast_id"] is None
