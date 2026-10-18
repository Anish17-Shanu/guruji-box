import os
os.environ["DATABASE_URL"]="sqlite:///./test.db"
from fastapi.testclient import TestClient
from app.main import app
from app.database import Base, engine
from app.seed import run
def setup_module():
    Base.metadata.drop_all(engine); run()
def test_health_and_learning_flow():
    c=TestClient(app); assert c.get("/health").status_code==200
    assert c.post("/api/v1/auth/login",json={"email":"learner@guruji.demo","password":"DemoPass123!"}).status_code==200
    lessons=c.get("/api/v1/lessons").json(); assert len(lessons)==2
    detail=c.get(f"/api/v1/lessons/{lessons[0]['id']}").json(); q=c.get(f"/api/v1/quizzes/{detail['quiz_id']}").json()
    out=c.post("/api/v1/assessments/submit",json={"quiz_id":q["id"],"answers":[{"question_id":x["id"],"selected":x["choices"][0]} for x in q["questions"]]});assert out.status_code==200;assert c.get("/api/v1/learners/me/progress").status_code==200
def test_teacher_is_scoped():
    c=TestClient(app); c.post("/api/v1/auth/login",json={"email":"learner@guruji.demo","password":"DemoPass123!"});assert c.get("/api/v1/teacher/dashboard").status_code==403
