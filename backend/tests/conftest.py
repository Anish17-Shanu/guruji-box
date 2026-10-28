from __future__ import annotations

import os
import uuid
from pathlib import Path

import pytest

BACKEND_DIR = Path(__file__).resolve().parents[1]
TEST_DB = BACKEND_DIR / "test.db"
TEST_DB.unlink(missing_ok=True)

os.environ["APP_ENV"] = "test"
os.environ["DATABASE_URL"] = f"sqlite:///{TEST_DB.as_posix()}"
os.environ["SECRET_KEY"] = "test-secret-key-0123456789-abcdefghijklmnop"
os.environ["FRONTEND_ORIGIN"] = "http://localhost:5173"
os.environ["GEMINI_API_KEY"] = ""
os.environ["RATE_LIMIT_AUTH_PER_MINUTE"] = "10000"
os.environ["RATE_LIMIT_TUTOR_PER_MINUTE"] = "10000"
os.environ["RATE_LIMIT_DEFAULT_PER_MINUTE"] = "10000"
os.environ["SEED_DEMO"] = "true"

from fastapi.testclient import TestClient  # noqa: E402

from app.database import Base, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.seed import run as seed_run  # noqa: E402

DEMO_LEARNER = ("learner@guruji.demo", "DemoPass123!")
DEMO_TEACHER = ("teacher@guruji.demo", "DemoPass123!")
DEMO_ADMIN = ("admin@guruji.demo", "DemoPass123!")


@pytest.fixture(scope="session", autouse=True)
def seeded_database():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    seed_run(with_demo=True)
    yield
    Base.metadata.drop_all(bind=engine)
    engine.dispose()
    TEST_DB.unlink(missing_ok=True)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


def unique_email(prefix: str = "user") -> str:
    return f"{prefix}-{uuid.uuid4().hex[:10]}@example.com"


def register(client: TestClient, role: str = "LEARNER", password: str = "TestPass123!"):
    email = unique_email(role.lower())
    response = client.post(
        "/api/v1/auth/register",
        json={
            "display_name": f"Test {role.title()}",
            "email": email,
            "password": password,
            "role": role,
        },
    )
    assert response.status_code == 201, response.text
    return response.json(), email, password


def login(client: TestClient, email: str, password: str = "DemoPass123!"):
    response = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert response.status_code == 200, response.text
    return response.json()


def learner_client():
    test_client = TestClient(app)
    login(test_client, *DEMO_LEARNER)
    return test_client


def teacher_client():
    test_client = TestClient(app)
    login(test_client, *DEMO_TEACHER)
    return test_client


def admin_client():
    test_client = TestClient(app)
    login(test_client, *DEMO_ADMIN)
    return test_client


def first_lesson(client: TestClient) -> dict:
    lessons = client.get("/api/v1/lessons", params={"class_level": 6}).json()
    assert lessons
    return lessons[0]


def quiz_for(client: TestClient, lesson_id: int) -> dict:
    detail = client.get(f"/api/v1/lessons/{lesson_id}").json()
    return client.get(f"/api/v1/quizzes/{detail['quiz_id']}").json()
