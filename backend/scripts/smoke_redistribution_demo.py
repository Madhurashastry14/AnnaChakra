"""Exercise the complete demo workflow through a running local API."""
import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

import httpx

from app.core.config import settings
from app.services.ngo_requirements import local_date
from scripts.seed_redistribution_demo import KITCHEN_EMAIL, NGO_EMAIL, validate_target


def run(base_url, password):
    validate_target()
    url = urlsplit(base_url)
    if url.scheme != "http" or url.hostname not in {"localhost", "127.0.0.1", "::1"}:
        raise ValueError("Use a local demo HTTP server")

    with httpx.Client(base_url=base_url.rstrip("/") + "/api/v1/", timeout=20) as client:
        def request(method, path, expected=200, token=None, **kwargs):
            headers = {"Authorization": f"Bearer {token}"} if token else {}
            response = client.request(method, path, headers=headers, **kwargs)
            if response.status_code != expected:
                detail = response.text if path != "auth/login" else "check demo credentials"
                raise RuntimeError(f"{method} {path}: expected {expected}, got {response.status_code}: {detail}")
            return response.json()

        kitchen, ngo = (
            request("POST", "auth/login", json={"email": email, "password": password})["access_token"]
            for email in (KITCHEN_EMAIL, NGO_EMAIL)
        )
        summary = "analytics/redistribution-summary"
        before = request("GET", summary, token=ngo)
        now = datetime.now(timezone.utc)
        requirement = request("POST", "ngo-requirements", 201, ngo, json={
            "people_to_feed": 10, "capacity_servings": 25, "required_date": local_date(now).isoformat(),
            "available_until": (now + timedelta(minutes=80)).isoformat(),
        })
        available = request("GET", "waste-logs/available-surplus", token=kitchen)
        candidates = (row for row in available if row["is_simulated"] and row["food_name"] == "Biryani"
                      and row["available_quantity"] >= 5)
        surplus = min(candidates, key=lambda row: (row["reserved_quantity"], -row["waste_log_id"]), default=None)
        if surplus is None:
            raise RuntimeError("No simulated Biryani available. Seed a fresh batch.")
        waste_id = surplus["waste_log_id"]
        batch = request("GET", f"waste-logs/{waste_id}", token=kitchen)
        matches = request("POST", "matches", token=kitchen, json={"waste_log_ids": [waste_id]})
        match = next(row for row in matches["items"] if row["requirement_id"] == requirement["id"])
        donation = request("POST", "donations", 201, kitchen, json={
            "requirement_id": requirement["id"],
            "items": [{"waste_log_id": waste_id, "offered_servings": 5}],
        })
        assert donation["is_simulated"] and donation["status"] == "PENDING"
        path = f"donations/{donation['id']}"
        accepted = request("POST", path + "/accept", token=ngo)
        driver = next(row for row in request("GET", "delivery-personnel", token=kitchen)["items"]
                      if row["name"] == "[SIMULATED] Demo Driver")
        assigned = request("POST", path + "/assign-delivery", token=kitchen, json={
            "delivery_person_id": driver["id"],
        })
        delivery = f"deliveries/{assigned['delivery']['id']}"
        dispatched = request("POST", delivery + "/dispatch", token=kitchen)
        delivered = request("POST", delivery + "/mark-delivered", token=kitchen)
        fields = ("unserved_confirmed", "storage_verified", "contamination_suspected", "storage_method",
                  "storage_temperature", "safe_handling_confirmed", "uncontrolled_minutes",
                  "temperature_history_started_at", "temperature_history_min_c",
                  "temperature_history_max_c", "temperature_history_reference")
        evidence = {key: batch[key] for key in fields}
        evidence["temperature_measured_at"] = datetime.now(timezone.utc).isoformat()
        completed = request("POST", path + "/confirm-receipt", token=ngo, json={
            "inspected": True, "items": [{"donation_item_id": donation["items"][0]["id"],
                                        "received_servings": 5, "evidence": evidence}],
        })
        impact = request("GET", summary, token=ngo)
        assert [accepted["status"], assigned["status"], dispatched["status"], delivered["status"],
                completed["status"]] == ["ACCEPTED", "ASSIGNED", "IN_TRANSIT", "DELIVERED", "COMPLETED"]
        assert completed["items"][0]["received_servings"] == 5
        def biryani_quantity(report):
            return sum(row["received_quantity"] for row in report["quantities"]
                       if row["food_item_id"] == surplus["food_item_id"] and row["serving_unit"] == "serving")

        assert impact["completed_donations"] == before["completed_donations"] + 1
        assert biryani_quantity(impact) == biryani_quantity(before) + 5
        return dict(requirement=requirement, available_surplus=surplus, match=match, donation=donation,
                    accepted=accepted, assigned=assigned, dispatched=dispatched, delivered=delivered,
                    completed=completed, impact=impact)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8011")
    args = parser.parse_args()
    password = os.getenv("REDISTRIBUTION_DEMO_PASSWORD")
    if not password:
        parser.error("Set REDISTRIBUTION_DEMO_PASSWORD to the seeded demo account password")
    print(json.dumps(run(args.url, password), indent=2, ensure_ascii=True))

