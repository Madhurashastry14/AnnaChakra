from collections.abc import Generator, Iterator
from contextlib import contextmanager

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.core.dependencies import require_verified_kitchen, require_verified_ngo
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.enums import UserRole, VerificationStatus
from app.models.organization import DeliveryPersonnel, Kitchen, NGO
from app.models.user import User
from app.schemas.organization import KitchenCreateRequest


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.metadata.create_all(
        engine,
        tables=[
            User.__table__,
            Kitchen.__table__,
            NGO.__table__,
            DeliveryPersonnel.__table__,
        ],
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, autocommit=False)

    def override_get_db() -> Iterator[Session]:
        with testing_session() as db:
            yield db

    app.dependency_overrides[get_db] = override_get_db
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.pop(get_db, None)
        engine.dispose()


@contextmanager
def _test_session() -> Generator[Session, None, None]:
    session_generator = app.dependency_overrides[get_db]()
    try:
        yield next(session_generator)
    finally:
        session_generator.close()


def _create_account(
    client: TestClient,
    role: UserRole,
    *,
    email: str | None = None,
) -> tuple[dict[str, object], dict[str, str]]:
    account_email = email or f"{role.value.lower()}@example.com"
    registration = client.post(
        "/api/v1/auth/register",
        json={
            "name": f"{role.value} User",
            "email": account_email,
            "password": "ExamplePassword123",
            "role": role.value,
        },
    )
    assert registration.status_code == 201, registration.text

    login = client.post(
        "/api/v1/auth/login",
        json={"email": account_email, "password": "ExamplePassword123"},
    )
    assert login.status_code == 200, login.text
    return registration.json(), {
        "Authorization": f"Bearer {login.json()['access_token']}"
    }


def _register_kitchen(
    client: TestClient,
    *,
    name: str = "VCET Institutional Kitchen",
    email: str | None = None,
) -> tuple[dict[str, object], dict[str, str]]:
    _, headers = _create_account(client, UserRole.KITCHEN_STAFF, email=email)
    response = client.post(
        "/api/v1/kitchens",
        headers=headers,
        json={
            "name": name,
            "address": "Puttur, Karnataka",
            "latitude": 12.759,
            "longitude": 75.201,
            "phone": "9876543210",
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), headers


def _register_ngo(
    client: TestClient,
    *,
    name: str = "Community Food Foundation",
    email: str | None = None,
) -> tuple[dict[str, object], dict[str, str]]:
    _, headers = _create_account(client, UserRole.NGO_MANAGER, email=email)
    response = client.post(
        "/api/v1/ngos",
        headers=headers,
        json={
            "name": name,
            "address": "Mangaluru, Karnataka",
            "latitude": 12.9141,
            "longitude": 74.856,
            "phone": "9876543210",
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), headers


def _admin_headers() -> dict[str, str]:
    with _test_session() as db:
        admin = User(
            name="Platform Administrator",
            email="admin@example.com",
            password_hash=hash_password("ExamplePassword123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(admin)
        db.commit()
        db.refresh(admin)
        token = create_access_token(admin.id, UserRole.ADMIN)
    return {"Authorization": f"Bearer {token}"}


def _personnel_body(name: str = "Delivery Staff") -> dict[str, str]:
    return {"name": name, "phone": "9876543210"}


def test_kitchen_registration_duplicate_retrieval_and_role_access(
    client: TestClient,
) -> None:
    kitchen, headers = _register_kitchen(client)

    assert kitchen["manager_id"] > 0
    assert kitchen["manager_id"] == client.get(
        "/api/v1/auth/me",
        headers=headers,
    ).json()["id"]
    assert kitchen["verification_status"] == "PENDING"
    assert kitchen["name"] == "VCET Institutional Kitchen"
    assert "password_hash" not in kitchen
    assert client.get("/api/v1/kitchens/me", headers=headers).json() == kitchen

    duplicate = client.post(
        "/api/v1/kitchens",
        headers=headers,
        json={
            "name": "Second Kitchen",
            "address": "Puttur",
            "latitude": 12.75,
            "longitude": 75.2,
            "phone": "9876543210",
        },
    )
    _, ngo_headers = _create_account(client, UserRole.NGO_MANAGER)
    forbidden = client.get("/api/v1/kitchens/me", headers=ngo_headers)
    protected_create = client.post(
        "/api/v1/kitchens",
        headers=headers,
        json={
            "name": "Another Kitchen",
            "address": "Puttur",
            "latitude": 12.75,
            "longitude": 75.2,
            "phone": "9876543210",
            "manager_id": 999,
        },
    )

    assert duplicate.status_code == 409
    assert forbidden.status_code == 403
    assert protected_create.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("latitude", 91),
        ("longitude", -181),
        ("latitude", True),
        ("name", "   "),
        ("phone", "invalid"),
    ],
)
def test_kitchen_registration_rejects_invalid_fields(
    client: TestClient,
    field: str,
    value: object,
) -> None:
    _, headers = _create_account(client, UserRole.KITCHEN_STAFF)
    payload: dict[str, object] = {
        "name": "VCET Institutional Kitchen",
        "address": "Puttur, Karnataka",
        "latitude": 12.759,
        "longitude": 75.201,
        "phone": "9876543210",
    }
    payload[field] = value
    response = client.post("/api/v1/kitchens", headers=headers, json=payload)

    assert response.status_code == 422


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("latitude", float("inf")),
        ("longitude", float("nan")),
    ],
)
def test_organization_schema_rejects_non_finite_coordinates(
    field: str,
    value: float,
) -> None:
    payload: dict[str, object] = {
        "name": "VCET Institutional Kitchen",
        "address": "Puttur, Karnataka",
        "latitude": 12.759,
        "longitude": 75.201,
        "phone": "9876543210",
    }
    payload[field] = value

    with pytest.raises(ValidationError):
        KitchenCreateRequest.model_validate(payload)


def test_kitchen_patch_protects_fields_and_resets_verification(
    client: TestClient,
) -> None:
    kitchen, headers = _register_kitchen(client)
    admin_headers = _admin_headers()
    verify = client.patch(
        f"/api/v1/admin/kitchens/{kitchen['id']}/verify",
        headers=admin_headers,
        json={"verification_status": "VERIFIED"},
    )
    assert verify.status_code == 200

    phone_only = client.patch(
        "/api/v1/kitchens/me",
        headers=headers,
        json={"phone": "+91 9876543210"},
    )
    material_change = client.patch(
        "/api/v1/kitchens/me",
        headers=headers,
        json={"address": "Updated address"},
    )
    protected_field = client.patch(
        "/api/v1/kitchens/me",
        headers=headers,
        json={"manager_id": 999},
    )
    explicit_null = client.patch(
        "/api/v1/kitchens/me",
        headers=headers,
        json={"name": None},
    )
    empty_patch = client.patch("/api/v1/kitchens/me", headers=headers, json={})

    assert phone_only.status_code == 200
    assert phone_only.json()["verification_status"] == "VERIFIED"
    assert material_change.status_code == 200
    assert material_change.json()["verification_status"] == "PENDING"
    assert protected_field.status_code == 422
    assert explicit_null.status_code == 422
    assert empty_patch.status_code == 422


def test_ngo_registration_duplicate_retrieval_update_and_role_access(
    client: TestClient,
) -> None:
    ngo, headers = _register_ngo(client)
    _, kitchen_headers = _create_account(client, UserRole.KITCHEN_STAFF)

    assert ngo["verification_status"] == "PENDING"
    assert client.get("/api/v1/ngos/me", headers=headers).json() == ngo
    assert (
        client.patch(
            "/api/v1/ngos/me",
            headers=headers,
            json={"name": "Updated Foundation"},
        ).json()["name"]
        == "Updated Foundation"
    )

    duplicate = client.post(
        "/api/v1/ngos",
        headers=headers,
        json={
            "name": "Another Foundation",
            "address": "Mangaluru",
            "latitude": 12.91,
            "longitude": 74.85,
            "phone": "9876543210",
        },
    )
    forbidden = client.get("/api/v1/ngos/me", headers=kitchen_headers)
    protected = client.patch(
        "/api/v1/ngos/me",
        headers=headers,
        json={"verification_status": "VERIFIED"},
    )

    assert duplicate.status_code == 409
    assert forbidden.status_code == 403
    assert protected.status_code == 422


def test_admin_lists_filter_search_pagination_and_verify(
    client: TestClient,
) -> None:
    first, _ = _register_kitchen(
        client,
        name="Alpha Kitchen",
        email="alpha@example.com",
    )
    _register_kitchen(
        client,
        name="Bravo Kitchen",
        email="bravo@example.com",
    )
    _register_ngo(client, name="Community NGO")
    admin_headers = _admin_headers()

    verification = client.patch(
        f"/api/v1/admin/kitchens/{first['id']}/verify",
        headers=admin_headers,
        json={"verification_status": "VERIFIED"},
    )
    filtered = client.get(
        "/api/v1/admin/kitchens",
        headers=admin_headers,
        params={
            "verification_status": "VERIFIED",
            "search": "alpha",
            "limit": 1,
        },
    )
    paged = client.get(
        "/api/v1/admin/kitchens",
        headers=admin_headers,
        params={"limit": 1, "offset": 1},
    )
    ngos = client.get("/api/v1/admin/ngos", headers=admin_headers)
    compatibility_alias = client.patch(
        f"/api/v1/admin/kitchens/{first['id']}/verification",
        headers=admin_headers,
        json={"verification_status": "REJECTED"},
    )
    missing = client.patch(
        "/api/v1/admin/ngos/99999/verify",
        headers=admin_headers,
        json={"verification_status": "VERIFIED"},
    )
    unauthorized = client.get(
        "/api/v1/admin/kitchens",
        headers=_register_kitchen(client, email="unauthorized@example.com")[1],
    )

    assert verification.json()["verification_status"] == "VERIFIED"
    assert filtered.json()["total"] == 1
    assert filtered.json()["items"][0]["name"] == "Alpha Kitchen"
    assert paged.json()["total"] == 2
    assert len(paged.json()["items"]) == 1
    assert ngos.json()["total"] == 1
    assert compatibility_alias.json()["verification_status"] == "REJECTED"
    assert missing.status_code == 404
    assert unauthorized.status_code == 403


def test_delivery_personnel_lifecycle_and_soft_delete(
    client: TestClient,
) -> None:
    kitchen, headers = _register_kitchen(client)
    created = client.post(
        "/api/v1/delivery-personnel",
        headers=headers,
        json=_personnel_body(),
    )

    assert created.status_code == 201
    person = created.json()
    with _test_session() as db:
        stored_person = db.get(DeliveryPersonnel, person["id"])
        assert stored_person is not None
        assert stored_person.kitchen_id == kitchen["id"]
    assert person["is_active"] is True
    assert set(person) == {"id", "name", "phone", "is_active"}
    assert "password_hash" not in person

    updated = client.patch(
        f"/api/v1/delivery-personnel/{person['id']}",
        headers=headers,
        json={"name": "Updated Staff"},
    )
    default_list = client.get("/api/v1/delivery-personnel", headers=headers)
    deactivated_by_patch = client.patch(
        f"/api/v1/delivery-personnel/{person['id']}",
        headers=headers,
        json={"is_active": False},
    )
    inactive_list = client.get(
        "/api/v1/delivery-personnel",
        headers=headers,
        params={"is_active": False},
    )
    reactivated_by_patch = client.patch(
        f"/api/v1/delivery-personnel/{person['id']}",
        headers=headers,
        json={"is_active": True},
    )
    deleted = client.delete(
        f"/api/v1/delivery-personnel/{person['id']}",
        headers=headers,
    )
    repeated_delete = client.delete(
        f"/api/v1/delivery-personnel/{person['id']}",
        headers=headers,
    )

    assert updated.status_code == 200
    assert updated.json()["name"] == "Updated Staff"
    assert updated.json()["is_active"] is True
    assert default_list.json()["total"] == 1
    assert deactivated_by_patch.status_code == 200
    assert inactive_list.json()["total"] == 1
    assert reactivated_by_patch.json()["is_active"] is True
    assert deleted.status_code == 204
    assert deleted.content == b""
    assert repeated_delete.status_code == 204
    with _test_session() as db:
        stored_person = db.get(DeliveryPersonnel, person["id"])
        assert stored_person is not None
        assert stored_person.is_active is False


def test_delivery_personnel_requires_kitchen_and_scopes_ownership(
    client: TestClient,
) -> None:
    _, owner_headers = _register_kitchen(
        client,
        email="owner@example.com",
    )
    person = client.post(
        "/api/v1/delivery-personnel",
        headers=owner_headers,
        json={**_personnel_body(), "kitchen_id": 999},
    )
    valid_person = client.post(
        "/api/v1/delivery-personnel",
        headers=owner_headers,
        json=_personnel_body(),
    )
    _, other_headers = _register_kitchen(
        client,
        name="Other Kitchen",
        email="other@example.com",
    )
    _, ngo_headers = _create_account(client, UserRole.NGO_MANAGER)
    missing_kitchen_headers = _create_account(
        client,
        UserRole.KITCHEN_STAFF,
        email="no-kitchen@example.com",
    )[1]

    detail = client.get(
        f"/api/v1/delivery-personnel/{valid_person.json()['id']}",
        headers=other_headers,
    )
    update = client.patch(
        f"/api/v1/delivery-personnel/{valid_person.json()['id']}",
        headers=other_headers,
        json={"name": "Unauthorized"},
    )
    delete = client.delete(
        f"/api/v1/delivery-personnel/{valid_person.json()['id']}",
        headers=other_headers,
    )
    no_kitchen = client.get(
        "/api/v1/delivery-personnel",
        headers=missing_kitchen_headers,
    )
    wrong_role = client.get(
        "/api/v1/delivery-personnel",
        headers=ngo_headers,
    )

    assert person.status_code == 422
    assert detail.status_code == 404
    assert update.status_code == 404
    assert delete.status_code == 404
    assert no_kitchen.status_code == 404
    assert wrong_role.status_code == 403


def test_missing_and_unverified_organization_dependencies(
    client: TestClient,
) -> None:
    _, kitchen_headers = _create_account(client, UserRole.KITCHEN_STAFF)
    _, ngo_headers = _create_account(client, UserRole.NGO_MANAGER)

    assert client.get("/api/v1/kitchens/me", headers=kitchen_headers).status_code == 404
    assert client.get("/api/v1/ngos/me", headers=ngo_headers).status_code == 404

    pending_kitchen = Kitchen(
        manager_id=1,
        name="Pending",
        address="Address",
        latitude=0,
        longitude=0,
        phone="1234567",
        verification_status=VerificationStatus.PENDING,
    )
    verified_kitchen = Kitchen(
        manager_id=2,
        name="Verified",
        address="Address",
        latitude=0,
        longitude=0,
        phone="1234567",
        verification_status=VerificationStatus.VERIFIED,
    )
    pending_ngo = NGO(
        manager_id=3,
        name="Pending NGO",
        address="Address",
        latitude=0,
        longitude=0,
        phone="1234567",
        verification_status=VerificationStatus.PENDING,
    )
    verified_ngo = NGO(
        manager_id=4,
        name="Verified NGO",
        address="Address",
        latitude=0,
        longitude=0,
        phone="1234567",
        verification_status=VerificationStatus.VERIFIED,
    )

    with pytest.raises(HTTPException) as kitchen_error:
        require_verified_kitchen(kitchen=pending_kitchen)
    with pytest.raises(HTTPException) as ngo_error:
        require_verified_ngo(ngo=pending_ngo)

    assert kitchen_error.value.status_code == 403
    assert ngo_error.value.status_code == 403
    assert require_verified_kitchen(kitchen=verified_kitchen) is verified_kitchen
    assert require_verified_ngo(ngo=verified_ngo) is verified_ngo


def test_organization_routes_are_registered(client: TestClient) -> None:
    paths = app.openapi()["paths"]

    assert {
        "/api/v1/kitchens",
        "/api/v1/kitchens/me",
        "/api/v1/ngos",
        "/api/v1/ngos/me",
        "/api/v1/admin/kitchens",
        "/api/v1/admin/ngos",
        "/api/v1/admin/kitchens/{kitchen_id}/verify",
        "/api/v1/admin/ngos/{ngo_id}/verify",
        "/api/v1/delivery-personnel",
        "/api/v1/delivery-personnel/{person_id}",
    }.issubset(paths)
    assert client.get("/docs").status_code == 200
