from contextlib import contextmanager

from fastapi.testclient import TestClient

from app.main import app


class _HealthConnection:
    def execute(self, statement):
        assert str(statement) == "SELECT 1"


class _HealthEngine:
    @contextmanager
    def connect(self):
        yield _HealthConnection()


def test_application_title():
    assert app.title == "AnnaChakra API"


def test_health_route_exists():
    routes = app.openapi()["paths"]

    assert "/health" in routes


def test_health_endpoint_still_works(monkeypatch):
    monkeypatch.setattr("app.main.engine", _HealthEngine())

    response = TestClient(app).get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"