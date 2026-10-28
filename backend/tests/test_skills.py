from __future__ import annotations

from conftest import learner_client


def test_skill_course_progress():
    learner = learner_client()
    courses = learner.get("/api/v1/skills/courses").json()
    assert len(courses) >= 1
    course = next(c for c in courses if c["slug"] == "digital-literacy")
    assert course["lesson_count"] == 6
    detail = learner.get(f"/api/v1/skills/courses/{course['id']}").json()
    assert len(detail["lessons"]) == 6
    assert detail["completed_count"] == 0

    lesson = detail["lessons"][0]
    completed = learner.post(
        "/api/v1/skills/progress", json={"lesson_id": lesson["id"], "completed": True}
    )
    assert completed.status_code == 200
    assert completed.json()["completed"] is True

    refreshed = learner.get(f"/api/v1/skills/courses/{course['id']}").json()
    assert refreshed["completed_count"] == 1
    assert refreshed["lessons"][0]["completed"] is True
    progress = learner.get("/api/v1/skills/progress/me").json()
    matching_progress = next(p for p in progress if p["id"] == course["id"])
    assert matching_progress["completed"] == 1

    learner.post("/api/v1/skills/progress", json={"lesson_id": lesson["id"], "completed": False})
    assert learner.get(f"/api/v1/skills/courses/{course['id']}").json()["completed_count"] == 0


def test_skill_progress_validation():
    learner = learner_client()
    missing = learner.post("/api/v1/skills/progress", json={"lesson_id": 99999})
    assert missing.status_code == 404
    anonymous = learner
    anonymous.cookies.clear()
    assert anonymous.get("/api/v1/skills/progress/me").status_code == 401
