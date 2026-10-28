from __future__ import annotations

from conftest import DEMO_LEARNER, first_lesson, learner_client, quiz_for


def test_content_catalogue(client):
    subjects = client.get("/api/v1/subjects").json()
    assert {subject["name"] for subject in subjects} == {"Mathematics", "Science"}
    lessons = client.get("/api/v1/lessons", params={"class_level": 6}).json()
    assert len(lessons) == 4
    assert {lesson["topic"] for lesson in lessons} >= {"Fractions", "Photosynthesis"}
    detail = client.get(f"/api/v1/lessons/{lessons[0]['id']}").json()
    assert len(detail["sections"]) == 3
    assert detail["attribution"] == "Original GURUJI BOX educational content"
    assert detail["license"] == "CC BY 4.0"


def test_quiz_does_not_leak_answers(client):
    lesson = first_lesson(client)
    quiz = quiz_for(client, lesson["id"])
    assert len(quiz["questions"]) == 5
    for question in quiz["questions"]:
        assert "answer" not in question
        assert "explanation" not in question
        assert len(question["choices"]) == 4


def test_assessment_scoring_progress_and_history(client):
    learner = learner_client()
    lesson = first_lesson(learner)
    quiz = quiz_for(learner, lesson["id"])

    zero = learner.post(
        "/api/v1/assessments/submit", json={"quiz_id": quiz["id"], "answers": []}
    )
    assert zero.status_code == 200
    body = zero.json()
    assert body["score"] == 0
    assert body["percent"] == 0
    assert body["recommendation"].startswith("Review")
    assert len(body["review"]) == 5
    assert all(item["answer"] for item in body["review"])

    correct = [
        {"question_id": item["question_id"], "selected": item["answer"]}
        for item in body["review"]
    ]
    perfect = learner.post(
        "/api/v1/assessments/submit", json={"quiz_id": quiz["id"], "answers": correct}
    )
    assert perfect.status_code == 200
    assert perfect.json()["percent"] == 100

    progress = learner.get("/api/v1/learners/me/progress").json()
    row = next(item for item in progress if item["lesson_id"] == lesson["id"])
    assert row["mastery"] == 100
    assert row["attempts"] == 2

    history = learner.get("/api/v1/assessments/history").json()
    assert len(history) >= 2
    detail = learner.get(f"/api/v1/assessments/{perfect.json()['attempt_id']}").json()
    assert detail["percent"] == 100
    assert len(detail["review"]) == 5


def test_attempt_detail_is_private(client):
    learner = learner_client()
    lesson = first_lesson(learner)
    quiz = quiz_for(learner, lesson["id"])
    attempt = learner.post(
        "/api/v1/assessments/submit", json={"quiz_id": quiz["id"], "answers": []}
    ).json()
    client.post(
        "/api/v1/auth/login",
        json={"email": DEMO_LEARNER[0], "password": DEMO_LEARNER[1]},
    )
    assert client.get(f"/api/v1/assessments/{attempt['attempt_id']}").status_code == 200

    from conftest import register

    other, _, _ = register(client)
    assert other["role"] == "LEARNER"
    assert client.get(f"/api/v1/assessments/{attempt['attempt_id']}").status_code == 404


def test_tutor_grounded_and_insufficient(client):
    learner = learner_client()
    fractions = next(
        lesson
        for lesson in learner.get("/api/v1/lessons").json()
        if lesson["topic"] == "Fractions"
    )
    relevant = learner.post(
        "/api/v1/tutor/chat",
        json={"lesson_id": fractions["id"], "question": "What does the denominator tell us?"},
    )
    assert relevant.status_code == 200
    body = relevant.json()
    assert body["insufficient_evidence"] is False
    assert body["sources"][0]["heading"] == "Equal parts"
    assert body["session_id"]

    unrelated = learner.post(
        "/api/v1/tutor/chat",
        json={"lesson_id": fractions["id"], "question": "Tell me about football."},
    )
    assert unrelated.status_code == 200
    assert unrelated.json()["insufficient_evidence"] is True
    assert unrelated.json()["sources"] == []

    sessions = learner.get("/api/v1/tutor/sessions").json()
    assert len(sessions) >= 2
    session_id = body["session_id"]
    detail = learner.get(f"/api/v1/tutor/sessions/{session_id}").json()
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["role"] == "user"
    assert learner.delete(f"/api/v1/tutor/sessions/{session_id}").status_code == 204


def test_tutor_sessions_are_private(client):
    learner = learner_client()
    lesson = first_lesson(learner)
    session = learner.post(
        "/api/v1/tutor/chat",
        json={"lesson_id": lesson["id"], "question": "What is a fraction?"},
    ).json()
    from conftest import register

    register(client)
    assert client.get(f"/api/v1/tutor/sessions/{session['session_id']}").status_code == 404


def test_learner_can_join_a_class_by_code(client):
    learner = learner_client()
    joined = learner.post("/api/v1/learners/me/classes/join", json={"code": "demo01"})
    assert joined.status_code == 200
    assert joined.json()["name"] == "Demo Class 6"
    again = learner.post("/api/v1/learners/me/classes/join", json={"code": "DEMO01"})
    assert again.status_code == 200
    classes = learner.get("/api/v1/learners/me/classes").json()
    assert len(classes) == 1
    invalid = learner.post("/api/v1/learners/me/classes/join", json={"code": "NOPE00"})
    assert invalid.status_code == 404
