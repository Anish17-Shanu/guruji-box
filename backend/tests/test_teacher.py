from __future__ import annotations

from conftest import (
    DEMO_LEARNER,
    admin_client,
    first_lesson,
    learner_client,
    quiz_for,
    register,
)


def _new_class(teacher, name="Class A"):
    response = teacher.post(
        "/api/v1/teacher/classes", json={"name": name, "class_level": 6}
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_class_lifecycle_and_metrics(client):
    register(client, role="TEACHER")
    classroom = _new_class(client)
    assert len(classroom["join_code"]) == 6
    class_id = classroom["id"]

    learner = learner_client()
    assert (
        learner.post(
            "/api/v1/learners/me/classes/join", json={"code": classroom["join_code"]}
        ).status_code
        == 200
    )

    dashboard = client.get("/api/v1/teacher/dashboard").json()
    assert dashboard["learners"] == 1
    assert dashboard["classes"][0]["learner_count"] == 1

    detail = client.get(f"/api/v1/teacher/classes/{class_id}").json()
    assert detail["learner_count"] == 1
    assert detail["members"][0]["email"] == DEMO_LEARNER[0]

    lesson = first_lesson(learner)
    quiz = quiz_for(learner, lesson["id"])
    learner.post("/api/v1/assessments/submit", json={"quiz_id": quiz["id"], "answers": []})

    performance = client.get(f"/api/v1/teacher/classes/{class_id}/performance").json()
    assert performance["learners_with_attempts"] == 1
    assert performance["attempts"] >= 1
    assert performance["learners"][0]["latest_score"] == 0.0

    gaps = client.get(f"/api/v1/teacher/classes/{class_id}/learning-gaps").json()
    assert len(gaps["most_missed_questions"]) == 5
    assert gaps["most_missed_questions"][0]["misses"] >= 1
    assert gaps["most_missed_questions"][0]["prompt"]

    rotated = client.post(f"/api/v1/teacher/classes/{class_id}/rotate-code")
    assert rotated.status_code == 200
    assert rotated.json()["join_code"] != classroom["join_code"]


def test_teacher_can_add_and_remove_members_by_email(client):
    register(client, role="TEACHER")
    classroom = _new_class(client, "Membership Class")
    class_id = classroom["id"]
    learner, email, _ = register(learner_client(), role="LEARNER")

    added = client.post(
        f"/api/v1/teacher/classes/{class_id}/members", json={"email": email}
    )
    assert added.status_code == 201
    assert added.json()["email"] == email
    duplicate = client.post(
        f"/api/v1/teacher/classes/{class_id}/members", json={"email": email}
    )
    assert duplicate.status_code == 409
    assert (
        client.delete(f"/api/v1/teacher/classes/{class_id}/members/{learner['id']}").status_code
        == 204
    )
    missing = client.delete(f"/api/v1/teacher/classes/{class_id}/members/{learner['id']}")
    assert missing.status_code == 404


def test_teacher_scoping_and_validation(client):
    register(client, role="TEACHER")
    classroom = _new_class(client, "Private Class")
    other = learner_client()
    register(other, role="TEACHER")
    assert other.get(f"/api/v1/teacher/classes/{classroom['id']}").status_code == 404
    assert (
        other.get(f"/api/v1/teacher/classes/{classroom['id']}/performance").status_code == 404
    )
    invalid = client.post(
        "/api/v1/teacher/classes", json={"name": "Bad", "class_level": 20}
    )
    assert invalid.status_code == 422
    learner_access = learner_client().get("/api/v1/teacher/dashboard")
    assert learner_access.status_code == 403


def test_teacher_can_update_and_delete_class(client):
    register(client, role="TEACHER")
    classroom = _new_class(client, "Delete Me")
    updated = client.patch(
        f"/api/v1/teacher/classes/{classroom['id']}",
        json={"name": "Renamed Class", "class_level": 7},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Class"
    assert updated.json()["class_level"] == 7
    assert client.delete(f"/api/v1/teacher/classes/{classroom['id']}").status_code == 204
    assert client.get(f"/api/v1/teacher/classes/{classroom['id']}").status_code == 404


def test_admin_dashboard_includes_all_classes(client):
    register(client, role="TEACHER")
    _new_class(client, "Admin Visible Class")
    admin = admin_client()
    dashboard = admin.get("/api/v1/teacher/dashboard")
    assert dashboard.status_code == 200
    names = [item["name"] for item in dashboard.json()["classes"]]
    assert "Admin Visible Class" in names
