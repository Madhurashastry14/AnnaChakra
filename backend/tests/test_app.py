from app.main import app


def test_application_title():
    assert app.title == "AnnaChakra API"


def test_health_route_exists():
    routes = {route.path for route in app.routes}

    assert "/health" in routes