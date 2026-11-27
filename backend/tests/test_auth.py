from collections.abc import Iterator
from datetime import timedelta

import jwt
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import get_db
from app.core.dependencies import require_roles
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.main import app
from app.models.enums import UserRole
from app.models.organization import Kitchen, NGO
from app.models.user import User


@pytest.fixture
def client() -> Iterator[TestClient]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    User.metadata.create_all(
        engine,
        tables=[User.__table__, Kitchen.__table__, NGO.__table__],
    )
    testing_session = sessionmaker(
        bind=engine,
        autoflush=False,
        autocommit=False,
    )

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


def _register(
    client: TestClient,
    *,
    email: str = "manager@example.com",
    password: str = "ExamplePassword123",
    role: str = "KITCHEN_STAFF",
    name: str = " Kitchen Manager ",
) -> dict[str, object]:
    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": name,
            "email": email,
            "password": password,
            "role": role,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_password_hashing_and_verification() -> None:
    hashed_password = hash_password("ExamplePassword123")

    assert hashed_password != "ExamplePassword123"
    assert hashed_password.startswith("$argon2")
    assert verify_password("ExamplePassword123", hashed_password)
    assert not verify_password("incorrect", hashed_password)


def test_jwt_creation_and_decoding() -> None:
    token = create_access_token(42, UserRole.NGO_MANAGER)

    claims = decode_access_token(token)

    assert claims["sub"] == "42"
    assert claims["role"] == "NGO_MANAGER"
    assert "iat" in claims
    assert "exp" in claims


def test_expired_and_invalid_tokens_are_rejected() -> None:
    expired_token = create_access_token(
        42,
        UserRole.KITCHEN_STAFF,
        expires_delta=timedelta(seconds=-1),
    )

    with pytest.raises(jwt.ExpiredSignatureError):
        decode_access_token(expired_token)
    with pytest.raises(jwt.InvalidTokenError):
        decode_access_token("not-a-jwt")


def test_registration_normalizes_and_returns_only_public_fields(
    client: TestClient,
) -> None:
    user = _register(client, email="  MANAGER@Example.com ")

    assert user["name"] == "Kitchen Manager"
    assert user["email"] == "manager@example.com"
    assert user["organization_id"] is None
    assert "password_hash" not in user
    assert "password" not in user


def test_duplicate_registration_returns_conflict(client: TestClient) -> None:
    _register(client)

    response = client.post(
        "/api/v1/auth/register",
        json={
            "name": "Another Manager",
            "email": "MANAGER@example.com",
            "password": "ExamplePassword123",
            "role": "NGO_MANAGER",
        },
    )

    assert response.status_code == 409


@pytest.mark.parametrize(
    "overrides",
    [
        {"name": "   "},
        {"email": "not-an-email"},
        {"password": "short"},
        {"role": "ADMIN"},
        {"name": "N" * 151},
    ],
)
def test_invalid_registration_data_returns_unprocessable_entity(
    client: TestClient,
    overrides: dict[str, str],
) -> None:
    payload = {
        "name": "Kitchen Manager",
        "email": "manager@example.com",
        "password": "ExamplePassword123",
        "role": "KITCHEN_STAFF",
    }
    payload.update(overrides)

    response = client.post("/api/v1/auth/register", json=payload)

    assert response.status_code == 422


def test_successful_login_returns_token_and_contract_user(
    client: TestClient,
) -> None:
    _register(client)

    response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "MANAGER@example.com",
            "password": "ExamplePassword123",
        },
    )

    assert response.status_code == 200
    assert response.json()["token_type"] == "bearer"
    assert response.json()["access_token"]
    assert response.json()["user"]["email"] == "manager@example.com"
    assert "password_hash" not in response.json()["user"]


def test_incorrect_password_returns_generic_unauthorized(
    client: TestClient,
) -> None:
    _register(client)

    response = client.post(
        "/api/v1/auth/login",
        json={"email": "manager@example.com", "password": "WrongPassword"},
    )

    assert response.status_code == 401
    assert response.headers["www-authenticate"] == "Bearer"
    assert response.json()["detail"] == "Invalid email or password"


def test_inactive_user_cannot_login_or_access_me(client: TestClient) -> None:
    user = _register(client)
    token_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "manager@example.com",
            "password": "ExamplePassword123",
        },
    )
    assert token_response.status_code == 200

    db_generator = app.dependency_overrides[get_db]()
    db = next(db_generator)
    try:
        db_user = db.get(User, user["id"])
        assert db_user is not None
        db_user.is_active = False
        db.commit()
    finally:
        db_generator.close()

    login_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "manager@example.com",
            "password": "ExamplePassword123",
        },
    )
    me_response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token_response.json()['access_token']}"},
    )

    assert login_response.status_code == 401
    assert me_response.status_code == 403


def test_me_requires_and_returns_authenticated_user(client: TestClient) -> None:
    user = _register(client)
    token_response = client.post(
        "/api/v1/auth/login",
        json={
            "email": "manager@example.com",
            "password": "ExamplePassword123",
        },
    )
    token = token_response.json()["access_token"]

    response = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    missing_token = client.get("/api/v1/auth/me")
    invalid_token = client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer invalid"},
    )

    assert response.status_code == 200
    assert response.json()["id"] == user["id"]
    assert "password_hash" not in response.json()
    assert missing_token.status_code == 401
    assert missing_token.headers["www-authenticate"] == "Bearer"
    assert invalid_token.status_code == 401


def test_role_dependency_allows_and_rejects_roles() -> None:
    user = User(
        id=1,
        name="Kitchen Manager",
        email="manager@example.com",
        password_hash="not-used",
        role=UserRole.KITCHEN_STAFF,
        is_active=True,
    )

    assert require_roles(UserRole.KITCHEN_STAFF)(current_user=user) is user
    with pytest.raises(HTTPException) as error:
        require_roles(UserRole.ADMIN)(current_user=user)
    assert error.value.status_code == 403


def test_authentication_routes_are_registered(client: TestClient) -> None:
    schema = app.openapi()
    paths = schema["paths"]

    assert {
        "/api/v1/auth/register",
        "/api/v1/auth/login",
        "/api/v1/auth/me",
        "/health",
    }.issubset(paths)
    assert schema["components"]["securitySchemes"]["HTTPBearer"]["scheme"] == (
        "bearer"
    )
    assert schema["paths"]["/api/v1/auth/me"]["get"]["security"]
    assert client.get("/docs").status_code == 200
