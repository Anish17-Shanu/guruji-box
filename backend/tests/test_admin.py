from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app
from conftest import admin_client, learner_client, register


def test_admin_stats_users_and_audit():
    admin = admin_client()
    stats = admin.get("/api/v1/admin/stats").json()
    assert stats["lessons"] == 4
    assert stats["classes"] >= 1
    assert stats["admins"] >= 1
    users = admin.get("/api/v1/admin/users", params={"limit": 5}).json()
    assert users["total"] >= 3
    assert len(users["users"]) <= 5
    audit = admin.get("/api/v1/admin/audit").json()
    assert audit
    assert "action" in audit[0]


def test_admin_can_update_users_but_not_self_demote():
    admin = admin_client()
    learner, email, _ = register(learner_client(), role="LEARNER")
    promoted = admin.patch(
        f"/api/v1/admin/users/{learner['id']}", json={"role": "TEACHER"}
    )
    assert promoted.status_code == 200
    assert promoted.json()["role"] == "TEACHER"
    deactivated = admin.patch(
        f"/api/v1/admin/users/{learner['id']}", json={"is_active": False}
    )
    assert deactivated.status_code == 200
    assert deactivated.json()["is_active"] is False
    me = admin.get("/api/v1/auth/me").json()
    blocked = admin.patch(f"/api/v1/admin/users/{me['id']}", json={"is_active": False})
    assert blocked.status_code == 400


def test_admin_password_reset_revokes_existing_sessions():
    learner = TestClient(app)
    user, email, old_password = register(learner)
    assert learner.get("/api/v1/auth/me").status_code == 200

    admin = admin_client()
    weak = admin.patch(f"/api/v1/admin/users/{user['id']}", json={"password": "short"})
    assert weak.status_code == 422

    reset = admin.patch(
        f"/api/v1/admin/users/{user['id']}", json={"password": "FreshPass123!"}
    )
    assert reset.status_code == 200

    revoked = learner.get("/api/v1/auth/me")
    assert revoked.status_code == 401
    assert revoked.json()["error"]["code"] == "session_revoked"

    assert (
        learner.post(
            "/api/v1/auth/login", json={"email": email, "password": old_password}
        ).status_code
        == 401
    )
    assert (
        learner.post(
            "/api/v1/auth/login", json={"email": email, "password": "FreshPass123!"}
        ).status_code
        == 200
    )
    assert learner.get("/api/v1/auth/me").status_code == 200

    actions = [event["action"] for event in admin.get("/api/v1/admin/audit").json()]
    assert "admin.password_reset" in actions


def test_non_admin_cannot_access_admin():
    learner = learner_client()
    assert learner.get("/api/v1/admin/stats").status_code == 403
    assert learner.get("/api/v1/admin/users").status_code == 403
    assert learner.get("/api/v1/admin/audit").status_code == 403


def test_admin_can_search_users():
    admin = admin_client()
    result = admin.get("/api/v1/admin/users", params={"q": "learner@guruji.demo"}).json()
    assert result["total"] >= 1
    assert result["users"][0]["email"] == "learner@guruji.demo"
    missing = admin.get("/api/v1/admin/users", params={"q": "nobody-here-xyz"}).json()
    assert missing["total"] == 0
