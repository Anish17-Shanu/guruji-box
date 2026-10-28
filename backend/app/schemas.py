from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from .core.security import validate_password_strength
from .models import Role, WorksheetStatus

QuestionKind = Literal["short_answer", "fill_blank", "mcq", "true_false"]
Difficulty = Literal["easy", "medium", "hard"]


class RegisterIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=10, max_length=128)
    role: Role = Role.LEARNER

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter your name")
        return value

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_password_strength(value)

    @field_validator("role")
    @classmethod
    def public_roles_only(cls, value: Role) -> Role:
        if value == Role.ADMIN:
            raise ValueError("Admin accounts cannot be created through public registration")
        return value


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ProfileUpdateIn(BaseModel):
    display_name: str = Field(min_length=2, max_length=80)

    @field_validator("display_name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter your name")
        return value


class ChangePasswordIn(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=10, max_length=128)

    @field_validator("new_password")
    @classmethod
    def strong_password(cls, value: str) -> str:
        return validate_password_strength(value)


class DeleteAccountIn(BaseModel):
    password: str = Field(min_length=1, max_length=128)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None = None


class SubjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    slug: str
    name: str
    class_level: int


class LessonSectionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    heading: str
    passage: str
    position: int


class LessonSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    topic: str
    summary: str
    class_level: int
    subject: str
    estimated_minutes: int


class LessonDetailOut(LessonSummaryOut):
    sections: list[LessonSectionOut]
    quiz_id: int | None = None
    attribution: str | None = None
    license: str | None = None


class QuestionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    prompt: str
    choices: list[str]
    topic: str
    position: int


class QuizOut(BaseModel):
    id: int
    title: str
    lesson_id: int
    questions: list[QuestionOut]


class AnswerIn(BaseModel):
    question_id: int
    selected: str = Field(default="", max_length=300)


class SubmitIn(BaseModel):
    quiz_id: int
    answers: list[AnswerIn] = Field(default_factory=list, max_length=100)


class ReviewItemOut(BaseModel):
    question_id: int
    prompt: str
    selected: str
    correct: bool
    answer: str
    explanation: str
    topic: str


class SubmitOut(BaseModel):
    attempt_id: int
    score: int
    total: int
    percent: int
    mastery: int
    recommendation: str
    review: list[ReviewItemOut]


class AttemptOut(BaseModel):
    id: int
    quiz_id: int
    quiz_title: str
    lesson_id: int
    lesson_title: str
    score: int
    total: int
    percent: int
    created_at: datetime


class AttemptDetailOut(AttemptOut):
    review: list[ReviewItemOut]


class ProgressOut(BaseModel):
    lesson_id: int
    lesson_slug: str
    title: str
    topic: str
    subject: str
    mastery: int
    attempts: int
    last_attempt_at: datetime | None = None
    recommendation: str


class TutorAskIn(BaseModel):
    lesson_id: int
    question: str = Field(min_length=2, max_length=800)

    @field_validator("question")
    @classmethod
    def clean_question(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter a question")
        return value


class TutorSourceOut(BaseModel):
    lesson_id: int
    section_id: int
    heading: str


class TutorAnswerOut(BaseModel):
    session_id: int
    answer: str
    sources: list[TutorSourceOut]
    insufficient_evidence: bool
    ai_used: bool


class TutorMessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    role: str
    content: str
    created_at: datetime


class TutorSessionSummaryOut(BaseModel):
    id: int
    lesson_id: int
    lesson_title: str
    created_at: datetime
    message_count: int


class TutorSessionDetailOut(BaseModel):
    id: int
    lesson_id: int
    lesson_title: str
    created_at: datetime
    messages: list[TutorMessageOut]


class SkillLessonOut(BaseModel):
    id: int
    slug: str
    title: str
    body: str
    position: int
    completed: bool = False


class SkillCourseSummaryOut(BaseModel):
    id: int
    slug: str
    title: str
    description: str
    lesson_count: int
    completed_count: int = 0


class SkillCourseDetailOut(SkillCourseSummaryOut):
    lessons: list[SkillLessonOut]


class SkillProgressIn(BaseModel):
    lesson_id: int
    completed: bool = True


class SkillProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    skill_lesson_id: int
    completed: bool
    updated_at: datetime | None = None


class SkillCourseProgressOut(BaseModel):
    id: int
    title: str
    completed: int
    total: int
    lessons: list[SkillLessonOut]


class ClassCreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    class_level: int = Field(default=6, ge=1, le=12)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 2:
            raise ValueError("Please enter a class name")
        return value


class ClassUpdateIn(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    class_level: int = Field(default=6, ge=1, le=12)


class JoinClassIn(BaseModel):
    code: str = Field(min_length=4, max_length=12)

    @field_validator("code")
    @classmethod
    def clean_code(cls, value: str) -> str:
        return value.strip().upper()


class AddMemberIn(BaseModel):
    email: EmailStr


class ClassSummaryOut(BaseModel):
    id: int
    name: str
    class_level: int
    join_code: str | None = None
    learner_count: int = 0
    created_at: datetime


class ClassMemberOut(BaseModel):
    learner_id: int
    display_name: str
    email: str
    joined_at: datetime
    attempts: int = 0
    mean_score: float | None = None


class ClassDetailOut(ClassSummaryOut):
    members: list[ClassMemberOut]


class LearnerClassOut(BaseModel):
    id: int
    name: str
    class_level: int
    teacher_name: str
    joined_at: datetime


class LearnerPerformanceOut(BaseModel):
    learner_id: int
    display_name: str
    attempts: int
    mean_score: float | None
    latest_score: float | None
    last_attempt_at: datetime | None


class ClassPerformanceOut(BaseModel):
    class_id: int
    class_name: str
    learner_count: int
    learners_with_attempts: int
    attempts: int
    mean_score: float | None
    mean_latest_score: float | None
    learners: list[LearnerPerformanceOut]


class GapRowOut(BaseModel):
    question_id: int
    prompt: str
    topic: str
    lesson_title: str
    misses: int
    affected_learners: int


class LearningGapsOut(BaseModel):
    class_id: int
    class_name: str
    most_missed_questions: list[GapRowOut]


class TeacherDashboardOut(BaseModel):
    classes: list[ClassSummaryOut]
    learners: int
    attempts: int
    mean_latest_score: float | None
    draft_worksheets: int


class WorksheetQuestionOut(BaseModel):
    kind: QuestionKind
    prompt: str
    choices: list[str] | None = None
    answer_key: str
    explanation: str = ""
    source_section: str = ""


class WorksheetContentOut(BaseModel):
    title: str
    instructions: str = ""
    questions: list[WorksheetQuestionOut] = Field(default_factory=list)


class WorksheetGenerateIn(BaseModel):
    lesson_id: int | None = None
    class_level: int = Field(default=6, ge=1, le=12)
    subject: str = Field(default="", max_length=80)
    topic: str = Field(min_length=1, max_length=100)
    difficulty: Difficulty = "medium"
    count: int = Field(default=8, ge=1, le=20)
    formats: list[QuestionKind] = Field(
        default_factory=lambda: ["short_answer", "fill_blank", "mcq"]
    )

    @field_validator("formats")
    @classmethod
    def valid_formats(cls, value: list[QuestionKind]) -> list[QuestionKind]:
        unique = list(dict.fromkeys(value))
        return unique or ["short_answer"]


class WorksheetPatchIn(BaseModel):
    content: WorksheetContentOut | None = None
    status: WorksheetStatus | None = None


class WorksheetSummaryOut(BaseModel):
    id: int
    title: str
    subject: str
    topic: str
    class_level: int
    difficulty: str
    status: WorksheetStatus
    question_count: int
    generated_by: str
    created_at: datetime
    updated_at: datetime


class WorksheetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    teacher_id: int
    title: str
    subject: str
    topic: str
    class_level: int
    difficulty: str
    status: WorksheetStatus
    content: WorksheetContentOut
    sources: list[dict]
    generated_by: str
    model_name: str | None
    created_at: datetime
    updated_at: datetime


class AdminStatsOut(BaseModel):
    users: int
    learners: int
    teachers: int
    admins: int
    active_users_7d: int
    classes: int
    lessons: int
    attempts: int
    worksheets: int


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    display_name: str
    email: str
    role: Role
    is_active: bool
    created_at: datetime
    last_login_at: datetime | None


class AdminUserPatchIn(BaseModel):
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=128)

    @field_validator("password")
    @classmethod
    def strong_password(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return validate_password_strength(value)


class AuditOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int | None
    action: str
    entity_type: str | None
    entity_id: int | None
    detail: dict
    ip: str | None
    created_at: datetime


class PaginatedUsersOut(BaseModel):
    total: int
    users: list[AdminUserOut]
