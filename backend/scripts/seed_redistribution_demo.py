"""Insert labeled, idempotent demo fixtures in a dedicated local demo database."""
import argparse
import getpass
import os
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.engine import make_url

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.security import hash_password
from app.models.donation import Delivery, Donation, DonationItem
from app.models.enums import DeliveryStatus, DonationStatus, SafetyStatus, UserRole, VerificationStatus
from app.models.food import FoodItem
from app.models.organization import DeliveryPersonnel, Kitchen, NGO, NGORequirement
from app.models.user import User
from app.models.waste import WasteLog
from app.services.ngo_requirements import local_date, now_utc
from app.services.waste import screen_batch

KITCHEN_EMAIL = "redistribution-kitchen@example.com"
NGO_EMAIL = "redistribution-ngo@example.com"


def validate_target():
    url = make_url(settings.DATABASE_URL)
    if (settings.APP_ENV.strip().casefold() != "demo" or url.get_backend_name() != "postgresql"
            or url.host not in {"localhost", "127.0.0.1", "::1"}
            or not url.database or not url.database.startswith("annachakra_demo")):
        raise ValueError("Use APP_ENV=demo and a dedicated local PostgreSQL database named annachakra_demo*")


def demo_org(db, model, account, role, label, password, longitude):
    user = db.scalar(select(User).where(User.email == account))
    if user:
        org = db.scalar(select(model).where(model.manager_id == user.id))
        if not org or not org.is_simulated or user.role != role:
            raise ValueError(f"Existing account {account} is outside the demo seeder's scope")
        return org
    user = User(email=account, role=role, name=label, password_hash=hash_password(password))
    db.add(user)
    db.flush()
    org = model(manager_id=user.id, name=label, address="Simulated institutional location",
                latitude=12.31, longitude=longitude, phone="0000000000",
                verification_status=VerificationStatus.VERIFIED, is_simulated=True)
    db.add(org)
    db.flush()
    return org


def seed(db, password, batch_key):
    now = now_utc()
    batch_key = batch_key or local_date(now).isoformat()
    if db.get_bind().dialect.name == "postgresql":
        db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended('annachakra-redistribution-demo', 0))"))
    kitchen = demo_org(db, Kitchen, KITCHEN_EMAIL, UserRole.KITCHEN_STAFF,
                       "[SIMULATED] Demo Kitchen", password, 76.650)
    ngo = demo_org(db, NGO, NGO_EMAIL, UserRole.NGO_MANAGER,
                   "[SIMULATED] Demo NGO", password, 76.655)
    label = f"[SIMULATED] Redistribution demo {batch_key}"
    if db.scalar(select(WasteLog.id).where(WasteLog.kitchen_id == kitchen.id, WasteLog.notes == label)):
        return False
    food = db.scalar(select(FoodItem).where(FoodItem.name == "Biryani"))
    if food is None:
        food = FoodItem(name="Biryani", category="rice", serving_unit="serving", is_vegetarian=True,
                        default_servings_per_person=1)
        db.add(food)
        db.flush()
    if food.serving_unit != "serving" or not food.is_vegetarian:
        raise ValueError("The demo requires the existing vegetarian serving-based Biryani catalogue entry")
    driver = db.scalar(select(DeliveryPersonnel).where(
        DeliveryPersonnel.kitchen_id == kitchen.id, DeliveryPersonnel.name == "[SIMULATED] Demo Driver",
    ))
    if driver is None:
        driver = DeliveryPersonnel(kitchen_id=kitchen.id, name="[SIMULATED] Demo Driver", phone="0000000000")
        db.add(driver)
    requirement = NGORequirement(ngo_id=ngo.id, people_to_feed=40, remaining_capacity=0,
                                 capacity_servings=200, capacity_pieces=0, accepted_categories=[food.category.casefold()],
                                 required_date=local_date(now), available_until=now + timedelta(minutes=90),
                                 created_at=now, updated_at=now)
    db.add(requirement)
    db.flush()

    prepared = now - timedelta(minutes=12)
    evidence = {
        "unserved_confirmed": True,
        "contamination_suspected": False,
        "discard_at": (now + timedelta(hours=1)).isoformat(),
    }
    stages = (None, DonationStatus.PENDING, DonationStatus.ACCEPTED, DonationStatus.ASSIGNED,
              DonationStatus.IN_TRANSIT, DonationStatus.DELIVERED, DonationStatus.COMPLETED)
    for index, status in enumerate(stages):
        waste = WasteLog(kitchen_id=kitchen.id, food_item_id=food.id, is_simulated=True,
                         confirmed_servings=20, waste_type="UNSERVED_SURPLUS", notes=label if status is None else
                         f"{label} {status.value}", prepared_at=prepared,
                         safe_handling_confirmed=True, safety_evidence=evidence)
        screened = screen_batch(waste, food, kitchen, now)
        if screened.status != SafetyStatus.ELIGIBLE or screened.safe_until <= now + timedelta(minutes=22):
            raise ValueError("The simulated batch does not have a usable discard window")
        waste.safety_status, waste.safe_until = screened.status, screened.safe_until
        waste.screening_reasons, waste.screened_at = screened.reasons, screened.screened_at
        waste.safety_policy_version = screened.policy_version
        db.add(waste)
        if status is None:
            continue
        db.flush()
        donation = Donation(kitchen_id=kitchen.id, ngo_id=ngo.id, requirement_id=requirement.id,
                            is_simulated=True, status=status, notes=f"{label} {status.value}",
                            created_at=now - timedelta(minutes=8),
                            expires_at=min(now + timedelta(minutes=20), screened.safe_until - timedelta(minutes=20)),
                            accepted_at=now - timedelta(minutes=7) if index >= 2 else None,
                            completed_at=now if status == DonationStatus.COMPLETED else None)
        db.add(donation)
        db.flush()
        db.add(DonationItem(donation_id=donation.id, waste_log_id=waste.id, offered_servings=5,
                            received_servings=5 if status == DonationStatus.COMPLETED else None,
                            receipt_evidence={"inspected": True, "is_simulated": True}
                            if status == DonationStatus.COMPLETED else None))
        if index >= 3:
            db.add(Delivery(donation_id=donation.id, delivery_person_id=driver.id,
                            assigned_at=now - timedelta(minutes=6),
                            status=(DeliveryStatus.DELIVERED if index >= 5 else
                                    DeliveryStatus.IN_TRANSIT if index == 4 else DeliveryStatus.ASSIGNED),
                            dispatched_at=now - timedelta(minutes=4) if index >= 4 else None,
                            delivered_at=now - timedelta(minutes=2) if index >= 5 else None))
    db.commit()
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch-key", help="Reuse a key for an idempotent rerun or choose a new key for a fresh batch")
    args = parser.parse_args()
    try:
        validate_target()
        if args.batch_key is not None and not 1 <= len(args.batch_key.strip()) <= 50:
            raise ValueError("Batch key must be 1 to 50 characters")
        password = os.getenv("REDISTRIBUTION_DEMO_PASSWORD") or getpass.getpass("New demo account password: ")
        if len(password) < 12:
            raise ValueError("Use a demo password with at least 12 characters")
        with SessionLocal() as db:
            created = seed(db, password, args.batch_key.strip() if args.batch_key else None)
    except ValueError as exc:
        parser.error(str(exc))
    print("Created simulated fixtures." if created else "This simulated batch already exists.")
    print(KITCHEN_EMAIL, NGO_EMAIL)


if __name__ == "__main__":
    main()
