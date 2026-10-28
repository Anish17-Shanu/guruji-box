from __future__ import annotations

from conftest import learner_client, register


def _teacher():
    from conftest import TestClient, app

    client = TestClient(app)
    register(client, role="TEACHER")
    return client


def _generate(client, **overrides):
    payload = {
        "class_level": 6,
        "subject": "Mathematics",
        "topic": "Fractions",
        "difficulty": "medium",
        "count": 6,
        "formats": ["short_answer", "fill_blank", "mcq"],
    }
    payload.update(overrides)
    return client.post("/api/v1/worksheets/generate", json=payload)


def test_generate_edit_approve_and_delete():
    teacher = _teacher()
    response = _generate(teacher)
    assert response.status_code == 201, response.text
    worksheet = response.json()
    assert worksheet["generated_by"] == "deterministic"
    assert worksheet["status"] == "DRAFT"
    questions = worksheet["content"]["questions"]
    assert len(questions) == 6
    assert worksheet["sources"]
    assert worksheet["sources"][0]["license"] == "CC BY 4.0"
    for question in questions:
        assert question["prompt"]
        assert question["answer_key"]
        if question["kind"] == "mcq":
            assert len(question["choices"]) == 4
            assert question["answer_key"] in question["choices"]

    listed = teacher.get("/api/v1/worksheets").json()
    assert any(item["id"] == worksheet["id"] for item in listed)
    summary = next(item for item in listed if item["id"] == worksheet["id"])
    assert summary["question_count"] == 6

    approved = teacher.patch(
        f"/api/v1/worksheets/{worksheet['id']}", json={"status": "APPROVED"}
    )
    assert approved.status_code == 200
    assert approved.json()["status"] == "APPROVED"

    content = approved.json()["content"]
    content["title"] = "Edited worksheet"
    edited = teacher.patch(
        f"/api/v1/worksheets/{worksheet['id']}", json={"content": content}
    )
    assert edited.status_code == 200
    assert edited.json()["status"] == "DRAFT"
    assert edited.json()["title"] == "Edited worksheet"

    assert teacher.delete(f"/api/v1/worksheets/{worksheet['id']}").status_code == 204
    assert teacher.get(f"/api/v1/worksheets/{worksheet['id']}").status_code == 404


def test_worksheet_ownership_and_roles():
    owner = _teacher()
    other = _teacher()
    worksheet = _generate(owner).json()
    assert other.get(f"/api/v1/worksheets/{worksheet['id']}").status_code == 404
    assert (
        other.patch(
            f"/api/v1/worksheets/{worksheet['id']}", json={"status": "APPROVED"}
        ).status_code
        == 404
    )
    learner = learner_client()
    assert learner.get("/api/v1/worksheets").status_code == 403
    assert learner.post("/api/v1/worksheets/generate", json={}).status_code == 403


def test_worksheet_generation_validation_and_unknown_topic():
    teacher = _teacher()
    unknown = _generate(teacher, topic="Underwater Basket Weaving")
    assert unknown.status_code == 404
    assert unknown.json()["error"]["code"] == "topic_not_found"
    invalid_count = _generate(teacher, count=99)
    assert invalid_count.status_code == 422
    invalid_format = _generate(teacher, formats=["essay"])
    assert invalid_format.status_code == 422


def test_worksheet_generation_for_lesson_id():
    teacher = _teacher()
    lesson = teacher.get("/api/v1/lessons").json()[0]
    response = _generate(teacher, lesson_id=lesson["id"], topic="ignored")
    assert response.status_code == 201
    assert response.json()["topic"] == "ignored"
    assert response.json()["sources"][0]["lesson_id"] == lesson["id"]
