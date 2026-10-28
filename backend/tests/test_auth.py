from __future__ import annotations

from conftest import (
    DEMO_LEARNER,
    admin_client,
    login,
    register,
    unique_email,
)


def test_register_login_logout_and_profile(client):
    user, email, password = register(client)
    assert user["email"] == email
    assert user["role"] == "LEARNER"
    assert client.get("/api/v1/auth/me").status_code == 200

    updated = client.patch("/api/v1/auth/me", json={"display_name": "  New   Name  "})
    assert updated.status_code == 200
    assert updated.json()["display_name"] == "New Name"

    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    assert login(client, email, password)["email"] == email


def test_duplicate_email_and_weak_password_are_rejected(client):
    _, email, _ = register(client)
    duplicate = client.post(
        "/api/v1/auth/register",
        json={"display_name": "Again", "email": email, "password": "TestPass123!"},
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "email_taken"

    weak = client.post(
        "/api/v1/auth/register",
        json={"display_name": "Weak", "email": unique_email(), "password": "short"},
    )
    assert weak.status_code == 422
    assert weak.json()["error"]["code"] == "validation_error"
    assert weak.json()["error"]["details"]

    no_number = client.post(
        "/api/v1/auth/register",
        json={"display_name": "No Number", "email": unique_email(), "password": "onlyletters"},
    )
    assert no_number.status_code == 422


def test_admin_registration_is_blocked(client):
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": "Sneaky Admin",
            "email": unique_email("admin"),
            "password": "TestPass123!",
            "role": "ADMIN",
        },
    )
    assert response.status_code == 422


def test_wrong_password_and_invalid_session(client):
    bad = client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": "WrongPass123!"},
    )
    assert bad.status_code == 401
    assert bad.json()["error"]["code"] == "invalid_credentials"

    client.cookies.set("guruji_session", "not-a-token")
    response = client.get("/api/v1/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "invalid_session"


def test_change_password_and_delete_account(client):
    user, email, password = register(client)
    wrong = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": "WrongPass123!", "new_password": "AnotherPass123!"},
    )
    assert wrong.status_code == 400

    changed = client.post(
        "/api/v1/auth/change-password",
        json={"current_password": password, "new_password": "AnotherPass123!"},
    )
    assert changed.status_code == 204
    client.post("/api/v1/auth/logout")
    assert login(client, email, "AnotherPass123!")["id"] == user["id"]

    deleted = client.request(
        "DELETE", "/api/v1/auth/me", json={"password": "AnotherPass123!"}
    )
    assert deleted.status_code == 204
    assert client.get("/api/v1/auth/me").status_code == 401
    assert (
        client.post(
            "/api/v1/auth/login", json={"email": email, "password": "AnotherPass123!"}
        ).status_code
        == 401
    )


def test_account_deletion_requires_password_and_blocks_teacher_with_classes(client):
    teacher, email, password = register(client, role="TEACHER")
    created = client.post(
        "/api/v1/teacher/classes",
        json={"name": "Deletion Class", "class_level": 6},
    )
    assert created.status_code == 201
    response = client.request("DELETE", "/api/v1/auth/me", json={"password": password})
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "owns_classes"


def test_deactivated_account_cannot_log_in(client):
    user, email, password = register(client)
    admin = admin_client()
    response = admin.patch(f"/api/v1/admin/users/{user['id']}", json={"is_active": False})
    assert response.status_code == 200
    assert response.json()["is_active"] is False
    disabled = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert disabled.status_code == 403
    assert disabled.json()["error"]["code"] == "account_inactive"


def test_session_cookie_flags(client):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": DEMO_LEARNER[1]},
    )
    cookie = response.headers.get("set-cookie", "")
    assert "guruji_session=" in cookie
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
