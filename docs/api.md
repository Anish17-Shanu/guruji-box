# API

All routes are under `/api/v1` unless noted. Session authentication uses an HTTP-only
cookie set by `/auth/login`. JSON errors always use:

```json
{
  "error": {
    "code": "validation_error",
    "message": "Check the submitted values.",
    "details": [{ "field": "email", "message": "Enter a valid email." }],
    "request_id": "..."
  }
}
```

Every response includes `X-Request-ID`. Scores are always calculated on the server from
stored answer keys. Teachers can read only classes they own; learners can read only their
own attempts, progress, classes, and tutor sessions; admins can read platform-wide data.

## System

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/` (outside prefix) | public | App name, version, API prefix, docs link |
| GET | `/health` | public | Liveness |
| GET | `/ready` | public | Database readiness |

## Auth and profile

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/auth/register` | public | `display_name`, `email`, `password`, `role`; teacher role may be closed |
| POST | `/auth/login` | public | Sets session cookie |
| POST | `/auth/logout` | session | Clears cookie |
| GET | `/auth/me` | session | Current user |
| PATCH | `/auth/me` | session | Update display name |
| POST | `/auth/change-password` | session | Current + new password |
| DELETE | `/auth/me` | session | Anonymises the account after typed confirmation |

Passwords require at least 10 characters with a letter and a number. Inactive accounts
receive `account_inactive` on login. Changing a password issues a fresh session cookie for
the current browser and revokes every other session (`session_revoked` on stale tokens).

## Learning

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/subjects` | public | Subjects with class level |
| GET | `/lessons?subject=&class_level=` | public | Lesson summaries |
| GET | `/lessons/{id}` | public | Sections, quiz id, attribution |
| GET | `/quizzes/{id}` | session | Questions without answer keys |
| POST | `/assessments/submit` | session | Server-scored submission; returns review and recommendation |
| GET | `/assessments/history` | session | Own attempts |
| GET | `/assessments/{id}` | session | Own attempt detail |
| GET | `/learners/me/progress` | session | Mastery per lesson |
| GET | `/learners/me/classes` | session | Learner's classes |
| POST | `/learners/me/classes/join` | session | Join with class code |

## Tutor

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| POST | `/tutor/chat` | session | `lesson_id` + `question`; grounded answer with sources |
| GET | `/tutor/sessions` | session | Own recent sessions |
| GET | `/tutor/sessions/{id}` | session | Own session messages |
| DELETE | `/tutor/sessions/{id}` | session | Delete own session |

The response includes `insufficient_evidence` and `ai_used`. If the lesson does not cover
the question, the answer says so instead of inventing content.

## Skills

| Method | Path | Auth | Notes |
| --- | --- | --- | --- |
| GET | `/courses` | public | Course summaries |
| GET | `/courses/{id}` | public | Lessons |
| GET | `/progress/me` | session | Completion per course |
| POST | `/progress` | session | Set completion for a skill lesson |

## Teacher (role: TEACHER or ADMIN)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/teacher/dashboard` | Aggregates for owned classes |
| POST | `/teacher/classes` | Create a class with join code |
| GET | `/teacher/classes/{id}` | Class, members, join code |
| PATCH | `/teacher/classes/{id}` | Rename / change level |
| DELETE | `/teacher/classes/{id}` | Delete class and memberships |
| POST | `/teacher/classes/{id}/rotate-code` | New join code |
| GET | `/teacher/classes/{id}/learners` | Members |
| POST | `/teacher/classes/{id}/members` | Add a learner by email |
| DELETE | `/teacher/classes/{id}/members/{learner_id}` | Remove a learner |
| GET | `/teacher/classes/{id}/performance` | Latest score per learner |
| GET | `/teacher/classes/{id}/learning-gaps` | Most-missed questions |

## Worksheets (role: TEACHER or ADMIN)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/worksheets?status=DRAFT\|APPROVED` | Own (or all for admin) |
| POST | `/worksheets/generate` | Deterministic or Gemini-assisted draft |
| GET | `/worksheets/{id}` | Content, sources, status |
| PATCH | `/worksheets/{id}` | Edit content or approve/reopen |
| DELETE | `/worksheets/{id}` | Delete |

Generated worksheets always start as `DRAFT`. Approval records who approved it and when.

## Admin (role: ADMIN)

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/admin/stats` | User, class, lesson, attempt, worksheet totals |
| GET | `/admin/users?q=&role=&active=&limit=&offset=` | Paginated users |
| PATCH | `/admin/users/{id}` | Change `role`, `is_active`, or set a new `password` |
| GET | `/admin/audit?limit=` | Recent audit events |

Self-demotion and self-disable are rejected, and the last active administrator cannot be
removed. A password reset signs the user out of every device; role and status changes also
revoke existing sessions. All changes are written to the audit trail.

## Rate limits

Auth routes default to 20 requests/minute, tutor to 30/minute, and everything else to
600/minute per client. Limits are configurable with `RATE_LIMIT_AUTH_PER_MINUTE`,
`RATE_LIMIT_TUTOR_PER_MINUTE`, and `RATE_LIMIT_DEFAULT_PER_MINUTE`. Exceeding a limit
returns HTTP 429 with the standard error envelope.
