from __future__ import annotations

from conftest import DEMO_LEARNER, unique_email
from app.core.middleware import RateLimiter


def test_security_headers_and_request_id(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.headers["X-Content-Type-Options"] == "nosniff"
    assert response.headers["X-Frame-Options"] == "DENY"
    assert response.headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert response.headers["X-Request-ID"]

    echoed = client.get("/health", headers={"X-Request-ID": "my-request-id"})
    assert echoed.headers["X-Request-ID"] == "my-request-id"


def test_origin_guard_blocks_unknown_origins(client):
    blocked = client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": DEMO_LEARNER[1]},
        headers={"Origin": "https://evil.example"},
    )
    assert blocked.status_code == 403
    assert blocked.json()["error"]["code"] == "origin_not_allowed"
    allowed = client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": DEMO_LEARNER[1]},
        headers={"Origin": "http://localhost:5173"},
    )
    assert allowed.status_code == 200


def test_cors_preflight_allows_frontend(client):
    response = client.options(
        "/api/v1/auth/login",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "content-type",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert response.headers["access-control-allow-credentials"] == "true"


def test_error_envelope_for_unknown_route(client):
    response = client.get("/api/v1/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]


def test_rate_limiter_window():
    limiter = RateLimiter()
    assert limiter.check("key", 2)[0] is True
    assert limiter.check("key", 2)[0] is True
    allowed, retry_after = limiter.check("key", 2)
    assert allowed is False
    assert retry_after >= 1
    assert limiter.check("other", 2)[0] is True


def test_duplicate_registration_validation(client):
    from conftest import register

    _, email, _ = register(client)
    response = client.post(
        "/api/v1/auth/register",
        json={"display_name": "X", "email": email, "password": "TestPass123!"},
    )
    assert response.status_code == 422
    assert response.json()["error"]["details"][0]["field"] == "display_name"

    too_long = client.post(
        "/api/v1/auth/register",
        json={"display_name": "Valid Name", "email": unique_email(), "password": "A" * 129},
    )
    assert too_long.status_code == 422


def test_private_responses_are_not_cached(client):
    client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": DEMO_LEARNER[1]},
    )
    response = client.get("/api/v1/auth/me")
    assert response.headers.get("cache-control") == "no-store"
