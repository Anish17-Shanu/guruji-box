# Database

```mermaid
erDiagram
 USERS ||--o{ CLASS_MEMBERSHIPS : joins
 USERS ||--o{ ASSESSMENT_ATTEMPTS : makes
 CLASSES ||--o{ CLASS_MEMBERSHIPS : contains
 SUBJECTS ||--o{ LESSONS : groups
 LESSONS ||--o{ LESSON_SECTIONS : contains
 LESSONS ||--|| QUIZZES : has
 QUIZZES ||--o{ QUESTIONS : contains
```

Passwords are Argon2 hashes. Tutor messages should be deleted on a configured retention schedule. Account deletion must remove or anonymise owned personal records and audit only the deletion event.
