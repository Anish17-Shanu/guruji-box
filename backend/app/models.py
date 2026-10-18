import enum
from datetime import datetime, timezone
from sqlalchemy import String, ForeignKey, Text, Integer, Boolean, DateTime, JSON, Enum, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from .database import Base
def now(): return datetime.now(timezone.utc)
class Role(str, enum.Enum): LEARNER="LEARNER"; TEACHER="TEACHER"; ADMIN="ADMIN"
class WorksheetStatus(str, enum.Enum): DRAFT="DRAFT"; APPROVED="APPROVED"
class User(Base):
    __tablename__="users"; id: Mapped[int]=mapped_column(primary_key=True); display_name: Mapped[str]=mapped_column(String(80)); email: Mapped[str]=mapped_column(String(255), unique=True, index=True); password_hash: Mapped[str]=mapped_column(String(255)); role: Mapped[Role]=mapped_column(Enum(Role), default=Role.LEARNER); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class Class(Base):
    __tablename__="classes"; id: Mapped[int]=mapped_column(primary_key=True); name: Mapped[str]=mapped_column(String(100)); teacher_id: Mapped[int]=mapped_column(ForeignKey("users.id"))
class ClassMembership(Base):
    __tablename__="class_memberships"; id: Mapped[int]=mapped_column(primary_key=True); class_id: Mapped[int]=mapped_column(ForeignKey("classes.id")); learner_id: Mapped[int]=mapped_column(ForeignKey("users.id")); __table_args__=(UniqueConstraint("class_id","learner_id"),)
class Subject(Base):
    __tablename__="subjects"; id: Mapped[int]=mapped_column(primary_key=True); name: Mapped[str]=mapped_column(String(80), unique=True); class_level: Mapped[int]=mapped_column(Integer)
class Lesson(Base):
    __tablename__="lessons"; id: Mapped[int]=mapped_column(primary_key=True); subject_id: Mapped[int]=mapped_column(ForeignKey("subjects.id")); title: Mapped[str]=mapped_column(String(180)); topic: Mapped[str]=mapped_column(String(100)); class_level: Mapped[int]=mapped_column(Integer); summary: Mapped[str]=mapped_column(Text)
class LessonSection(Base):
    __tablename__="lesson_sections"; id: Mapped[int]=mapped_column(primary_key=True); lesson_id: Mapped[int]=mapped_column(ForeignKey("lessons.id")); heading: Mapped[str]=mapped_column(String(180)); passage: Mapped[str]=mapped_column(Text); position: Mapped[int]=mapped_column(Integer)
class LessonSource(Base):
    __tablename__="lesson_sources"; id: Mapped[int]=mapped_column(primary_key=True); lesson_id: Mapped[int]=mapped_column(ForeignKey("lessons.id")); attribution: Mapped[str]=mapped_column(Text); license: Mapped[str]=mapped_column(String(100))
class Quiz(Base):
    __tablename__="quizzes"; id: Mapped[int]=mapped_column(primary_key=True); lesson_id: Mapped[int]=mapped_column(ForeignKey("lessons.id"), unique=True); title: Mapped[str]=mapped_column(String(180))
class Question(Base):
    __tablename__="questions"; id: Mapped[int]=mapped_column(primary_key=True); quiz_id: Mapped[int]=mapped_column(ForeignKey("quizzes.id")); prompt: Mapped[str]=mapped_column(Text); choices: Mapped[list]=mapped_column(JSON); answer: Mapped[str]=mapped_column(String(300)); explanation: Mapped[str]=mapped_column(Text); topic: Mapped[str]=mapped_column(String(100))
class AssessmentAttempt(Base):
    __tablename__="assessment_attempts"; id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id")); quiz_id: Mapped[int]=mapped_column(ForeignKey("quizzes.id")); score: Mapped[int]=mapped_column(Integer); total: Mapped[int]=mapped_column(Integer); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class AssessmentAnswer(Base):
    __tablename__="assessment_answers"; id: Mapped[int]=mapped_column(primary_key=True); attempt_id: Mapped[int]=mapped_column(ForeignKey("assessment_attempts.id")); question_id: Mapped[int]=mapped_column(ForeignKey("questions.id")); selected: Mapped[str]=mapped_column(String(300)); correct: Mapped[bool]=mapped_column(Boolean)
class LearningProgress(Base):
    __tablename__="learning_progress"; id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id")); lesson_id: Mapped[int]=mapped_column(ForeignKey("lessons.id")); mastery: Mapped[int]=mapped_column(Integer, default=0); __table_args__=(UniqueConstraint("user_id","lesson_id"),)
class TutorSession(Base): __tablename__="tutor_sessions"; id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id")); lesson_id: Mapped[int]=mapped_column(ForeignKey("lessons.id")); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class TutorMessage(Base): __tablename__="tutor_messages"; id: Mapped[int]=mapped_column(primary_key=True); session_id: Mapped[int]=mapped_column(ForeignKey("tutor_sessions.id")); role: Mapped[str]=mapped_column(String(12)); content: Mapped[str]=mapped_column(Text); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
class SkillCourse(Base): __tablename__="skill_courses"; id: Mapped[int]=mapped_column(primary_key=True); title: Mapped[str]=mapped_column(String(180)); description: Mapped[str]=mapped_column(Text)
class SkillLesson(Base): __tablename__="skill_lessons"; id: Mapped[int]=mapped_column(primary_key=True); course_id: Mapped[int]=mapped_column(ForeignKey("skill_courses.id")); title: Mapped[str]=mapped_column(String(180)); body: Mapped[str]=mapped_column(Text); position: Mapped[int]=mapped_column(Integer)
class SkillProgress(Base): __tablename__="skill_progress"; id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int]=mapped_column(ForeignKey("users.id")); skill_lesson_id: Mapped[int]=mapped_column(ForeignKey("skill_lessons.id")); completed: Mapped[bool]=mapped_column(Boolean, default=False); __table_args__=(UniqueConstraint("user_id","skill_lesson_id"),)
class Worksheet(Base): __tablename__="worksheets"; id: Mapped[int]=mapped_column(primary_key=True); teacher_id: Mapped[int]=mapped_column(ForeignKey("users.id")); status: Mapped[WorksheetStatus]=mapped_column(Enum(WorksheetStatus), default=WorksheetStatus.DRAFT); content: Mapped[dict]=mapped_column(JSON); sources: Mapped[list]=mapped_column(JSON, default=list)
class AuditEvent(Base): __tablename__="audit_events"; id: Mapped[int]=mapped_column(primary_key=True); user_id: Mapped[int|None]=mapped_column(ForeignKey("users.id"), nullable=True); action: Mapped[str]=mapped_column(String(120)); created_at: Mapped[datetime]=mapped_column(DateTime(timezone=True), default=now)
