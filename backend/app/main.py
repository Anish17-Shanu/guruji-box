from datetime import datetime, timedelta, timezone
from fastapi import FastAPI, Depends, HTTPException, Response, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from jose import jwt, JWTError
from passlib.context import CryptContext
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select, func
from sqlalchemy.orm import Session
from .database import Base, engine, get_db
from .models import *
from .core.config import get_settings

settings=get_settings(); pwd=CryptContext(schemes=["argon2"], deprecated="auto")
app=FastAPI(title="GURUJI BOX", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=[settings.frontend_origin], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
@app.exception_handler(HTTPException)
async def errors(_, exc): return JSONResponse(status_code=exc.status_code, content={"error":{"code":str(exc.status_code),"message":exc.detail}})
@app.on_event("startup")
def startup(): Base.metadata.create_all(engine)
def token(user): return jwt.encode({"sub":str(user.id),"role":user.role.value,"exp":datetime.now(timezone.utc)+timedelta(days=7)},settings.secret_key,algorithm="HS256")
def current(request:Request, db:Session=Depends(get_db)):
    raw=request.cookies.get("guruji_session")
    if not raw: raise HTTPException(401,"Please log in")
    try: uid=int(jwt.decode(raw,settings.secret_key,algorithms=["HS256"])["sub"])
    except (JWTError, ValueError): raise HTTPException(401,"Invalid session")
    user=db.get(User,uid)
    if not user: raise HTTPException(401,"Invalid session")
    return user
def role(*roles):
    def check(user=Depends(current)):
        if user.role not in roles: raise HTTPException(403,"You do not have access to this area")
        return user
    return check
class Register(BaseModel): display_name:str=Field(min_length=2,max_length=80); email:EmailStr; password:str=Field(min_length=10,max_length=128); role:Role=Role.LEARNER
class Login(BaseModel): email:EmailStr; password:str
class Answer(BaseModel): question_id:int; selected:str
class Submit(BaseModel): quiz_id:int; answers:list[Answer]
class Chat(BaseModel): lesson_id:int; question:str=Field(min_length=2,max_length=800)
class SkillUpdate(BaseModel): lesson_id:int; completed:bool=True
class WorksheetInput(BaseModel): class_level:int=Field(ge=1,le=12); subject:str; topic:str; difficulty:str; count:int=Field(ge=1,le=20); formats:list[str]=[]
class WorksheetPatch(BaseModel): content:dict|None=None; status:WorksheetStatus|None=None
def user_out(u): return {"id":u.id,"display_name":u.display_name,"email":u.email,"role":u.role.value}
@app.get("/health")
def health(): return {"status":"ok"}
@app.get("/ready")
def ready(db:Session=Depends(get_db)): db.execute(select(1)); return {"status":"ready"}
@app.post("/api/v1/auth/register",status_code=201)
def register(body:Register,response:Response,db:Session=Depends(get_db)):
    if body.role==Role.ADMIN: raise HTTPException(403,"Admin registration is not public")
    if db.scalar(select(User).where(User.email==body.email.lower())): raise HTTPException(409,"Email already registered")
    u=User(display_name=body.display_name,email=body.email.lower(),password_hash=pwd.hash(body.password),role=body.role); db.add(u); db.commit(); db.refresh(u)
    response.set_cookie("guruji_session",token(u),httponly=True,secure=settings.secure_cookies,samesite="lax",max_age=604800)
    return user_out(u)
@app.post("/api/v1/auth/login")
def login(body:Login,response:Response,db:Session=Depends(get_db)):
    u=db.scalar(select(User).where(User.email==body.email.lower()))
    if not u or not pwd.verify(body.password,u.password_hash): raise HTTPException(401,"Invalid email or password")
    response.set_cookie("guruji_session",token(u),httponly=True,secure=settings.secure_cookies,samesite="lax",max_age=604800); return user_out(u)
@app.post("/api/v1/auth/logout",status_code=204)
def logout(response:Response): response.delete_cookie("guruji_session"); return Response(status_code=204)
@app.get("/api/v1/auth/me")
def me(u=Depends(current)): return user_out(u)
@app.get("/api/v1/subjects")
def subjects(db:Session=Depends(get_db)): return [{"id":x.id,"name":x.name,"class_level":x.class_level} for x in db.scalars(select(Subject))]
@app.get("/api/v1/lessons")
def lessons(class_level:int|None=None,subject:str|None=None,topic:str|None=None,db:Session=Depends(get_db)):
    q=select(Lesson,Subject.name).join(Subject); 
    if class_level:q=q.where(Lesson.class_level==class_level)
    if subject:q=q.where(Subject.name.ilike(subject))
    if topic:q=q.where(Lesson.topic.ilike(f"%{topic}%"))
    return [{"id":l.id,"title":l.title,"topic":l.topic,"summary":l.summary,"class_level":l.class_level,"subject":n} for l,n in db.execute(q)]
@app.get("/api/v1/lessons/{lesson_id}")
def lesson(lesson_id:int,db:Session=Depends(get_db)):
    l=db.get(Lesson,lesson_id)
    if not l: raise HTTPException(404,"Lesson not found")
    return {"id":l.id,"title":l.title,"topic":l.topic,"summary":l.summary,"sections":[{"id":s.id,"heading":s.heading,"passage":s.passage} for s in db.scalars(select(LessonSection).where(LessonSection.lesson_id==l.id).order_by(LessonSection.position))],"quiz_id":db.scalar(select(Quiz.id).where(Quiz.lesson_id==l.id))}
@app.get("/api/v1/quizzes/{quiz_id}")
def quiz(quiz_id:int,db:Session=Depends(get_db)):
    q=db.get(Quiz,quiz_id)
    if not q:raise HTTPException(404,"Quiz not found")
    return {"id":q.id,"title":q.title,"questions":[{"id":x.id,"prompt":x.prompt,"choices":x.choices,"topic":x.topic} for x in db.scalars(select(Question).where(Question.quiz_id==q.id))]}
@app.post("/api/v1/assessments/submit")
def submit(body:Submit,u=Depends(current),db:Session=Depends(get_db)):
    qs=list(db.scalars(select(Question).where(Question.quiz_id==body.quiz_id))); given={a.question_id:a.selected for a in body.answers}
    if not qs:raise HTTPException(404,"Quiz not found")
    attempt=AssessmentAttempt(user_id=u.id,quiz_id=body.quiz_id,score=0,total=len(qs)); db.add(attempt); db.flush(); review=[]; score=0
    for q in qs:
        selected=given.get(q.id,""); correct=selected==q.answer; score+=correct; db.add(AssessmentAnswer(attempt_id=attempt.id,question_id=q.id,selected=selected,correct=correct)); review.append({"question_id":q.id,"selected":selected,"correct":correct,"answer":q.answer,"explanation":q.explanation,"topic":q.topic})
    attempt.score=score; lesson_id=db.scalar(select(Quiz.lesson_id).where(Quiz.id==body.quiz_id)); p=db.scalar(select(LearningProgress).where(LearningProgress.user_id==u.id,LearningProgress.lesson_id==lesson_id));
    if not p:p=LearningProgress(user_id=u.id,lesson_id=lesson_id);db.add(p)
    p.mastery=round(score*100/len(qs));db.commit();return {"attempt_id":attempt.id,"score":score,"total":len(qs),"review":review,"recommendation":"Revise: "+next((r["topic"] for r in review if not r["correct"]),"Keep practising")}
@app.get("/api/v1/learners/me/progress")
def progress(u=Depends(current),db:Session=Depends(get_db)):
    rows=db.execute(select(LearningProgress,Lesson).join(Lesson).where(LearningProgress.user_id==u.id));return [{"lesson_id":l.id,"title":l.title,"mastery":p.mastery} for p,l in rows]
@app.get("/api/v1/assessments/history")
def assessment_history(u=Depends(current),db:Session=Depends(get_db)):
    return [{"id":x.id,"quiz_id":x.quiz_id,"score":x.score,"total":x.total,"created_at":x.created_at} for x in db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.user_id==u.id).order_by(AssessmentAttempt.created_at.desc()))]
@app.get("/api/v1/tutor/sessions")
def tutor_sessions(u=Depends(current),db:Session=Depends(get_db)):
    return [{"id":s.id,"lesson_id":s.lesson_id,"created_at":s.created_at} for s in db.scalars(select(TutorSession).where(TutorSession.user_id==u.id).order_by(TutorSession.created_at.desc()))]
@app.get("/api/v1/tutor/sessions/{session_id}")
def tutor_session(session_id:int,u=Depends(current),db:Session=Depends(get_db)):
    s=db.get(TutorSession,session_id)
    if not s or s.user_id!=u.id: raise HTTPException(404,"Tutor session not found")
    return {"id":s.id,"lesson_id":s.lesson_id,"messages":[{"role":m.role,"content":m.content,"created_at":m.created_at} for m in db.scalars(select(TutorMessage).where(TutorMessage.session_id==s.id).order_by(TutorMessage.created_at))]}
@app.post("/api/v1/tutor/chat")
def chat(body:Chat,u=Depends(current),db:Session=Depends(get_db)):
    sections=list(db.scalars(select(LessonSection).where(LessonSection.lesson_id==body.lesson_id))); terms=set(body.question.lower().split()); ranked=sorted(sections,key=lambda s:len(terms & set(s.passage.lower().split())),reverse=True)
    if not ranked or len(terms & set(ranked[0].passage.lower().split()))==0:return {"answer":"I cannot find enough evidence in this lesson. Try asking about a section you have read.","sources":[],"insufficient_evidence":True}
    s=ranked[0]; answer=s.passage
    if settings.gemini_api_key:
        from .ai.provider import GeminiProvider, ProviderError
        try:
            reply=GeminiProvider().answer(body.question,[{"id":x.id,"text":x.passage} for x in ranked[:3]])
            used=[x for x in ranked[:3] if x.id in reply.passage_ids]
            if not used: raise ProviderError("Tutor returned no valid source")
            s=used[0]; answer=reply.answer
        except ProviderError as exc: raise HTTPException(503,exc.message)
    session=TutorSession(user_id=u.id,lesson_id=body.lesson_id);db.add(session);db.flush(); db.add_all([TutorMessage(session_id=session.id,role="user",content=body.question),TutorMessage(session_id=session.id,role="assistant",content=answer)]);db.commit();return {"answer":answer,"sources":[{"lesson_id":body.lesson_id,"title":s.heading,"section":s.heading}],"insufficient_evidence":False}
@app.get("/api/v1/skills/courses")
def courses(db:Session=Depends(get_db)): return [{"id":c.id,"title":c.title,"description":c.description} for c in db.scalars(select(SkillCourse))]
@app.get("/api/v1/skills/courses/{course_id}")
def course(course_id:int,db:Session=Depends(get_db)):
    c=db.get(SkillCourse,course_id)
    if not c:raise HTTPException(404,"Course not found")
    return {"id":c.id,"title":c.title,"description":c.description,"lessons":[{"id":x.id,"title":x.title,"body":x.body} for x in db.scalars(select(SkillLesson).where(SkillLesson.course_id==c.id).order_by(SkillLesson.position))]}
@app.get("/api/v1/skills/progress/me")
def my_skill_progress(u=Depends(current),db:Session=Depends(get_db)):
    return [{"skill_lesson_id":x.skill_lesson_id,"completed":x.completed} for x in db.scalars(select(SkillProgress).where(SkillProgress.user_id==u.id))]
@app.post("/api/v1/skills/progress")
def skill_progress(body:SkillUpdate,u=Depends(current),db:Session=Depends(get_db)):
    x=db.scalar(select(SkillProgress).where(SkillProgress.user_id==u.id,SkillProgress.skill_lesson_id==body.lesson_id))
    if not x:x=SkillProgress(user_id=u.id,skill_lesson_id=body.lesson_id);db.add(x)
    x.completed=body.completed;db.commit();return {"completed":x.completed}
@app.get("/api/v1/teacher/dashboard")
def dashboard(u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    classes=list(db.scalars(select(Class).where(Class.teacher_id==u.id))); ids=[c.id for c in classes]; learners=db.scalar(select(func.count(ClassMembership.id)).where(ClassMembership.class_id.in_(ids))) if ids else 0;return {"classes":[{"id":c.id,"name":c.name} for c in classes],"learners":learners or 0,"attempts":0,"mean_latest_score":None}
def owned_class(class_id:int,u,db):
    c=db.get(Class,class_id)
    if not c or (c.teacher_id!=u.id and u.role!=Role.ADMIN): raise HTTPException(404,"Class not found")
    return c
@app.get("/api/v1/teacher/classes/{class_id}/performance")
def class_performance(class_id:int,u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    c=owned_class(class_id,u,db); members=list(db.scalars(select(ClassMembership.learner_id).where(ClassMembership.class_id==c.id)))
    attempts=list(db.scalars(select(AssessmentAttempt).where(AssessmentAttempt.user_id.in_(members)))) if members else []
    return {"class_id":c.id,"learners_with_attempts":len(set(a.user_id for a in attempts)),"attempts":len(attempts),"mean_score":round(sum(a.score/a.total*100 for a in attempts)/len(attempts),1) if attempts else None}
@app.get("/api/v1/teacher/classes/{class_id}/learning-gaps")
def learning_gaps(class_id:int,u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    c=owned_class(class_id,u,db); members=list(db.scalars(select(ClassMembership.learner_id).where(ClassMembership.class_id==c.id)))
    if not members:return {"class_id":c.id,"most_missed_questions":[]}
    rows=db.execute(select(AssessmentAnswer.question_id,func.count(AssessmentAnswer.id)).join(AssessmentAttempt).where(AssessmentAttempt.user_id.in_(members),AssessmentAnswer.correct==False).group_by(AssessmentAnswer.question_id).order_by(func.count(AssessmentAnswer.id).desc())).all()
    return {"class_id":c.id,"most_missed_questions":[{"question_id":qid,"misses":count} for qid,count in rows]}
@app.post("/api/v1/worksheets/generate",status_code=201)
def worksheet(body:WorksheetInput,u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    content={"title":f"{body.topic} practice", "questions":[{"prompt":f"Explain one idea about {body.topic}.","answer_key":"Teacher review required","explanation":"Original draft"} for _ in range(body.count)]};w=Worksheet(teacher_id=u.id,content=content,sources=[]);db.add(w);db.commit();db.refresh(w);return {"id":w.id,"status":w.status.value,"content":w.content}
@app.get("/api/v1/worksheets/{worksheet_id}")
def get_worksheet(worksheet_id:int,u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    w=db.get(Worksheet,worksheet_id)
    if not w or (w.teacher_id!=u.id and u.role!=Role.ADMIN): raise HTTPException(404,"Worksheet not found")
    return {"id":w.id,"status":w.status.value,"content":w.content,"sources":w.sources}
@app.patch("/api/v1/worksheets/{worksheet_id}")
def edit_worksheet(worksheet_id:int,body:WorksheetPatch,u=Depends(role(Role.TEACHER,Role.ADMIN)),db:Session=Depends(get_db)):
    w=db.get(Worksheet,worksheet_id)
    if not w or (w.teacher_id!=u.id and u.role!=Role.ADMIN):raise HTTPException(404,"Worksheet not found")
    if body.content is not None:w.content=body.content
    if body.status is not None:w.status=body.status
    db.commit();return {"id":w.id,"status":w.status.value,"content":w.content}
