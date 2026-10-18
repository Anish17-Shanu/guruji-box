# API

All API endpoints are under `/api/v1`; errors use `{error:{code,message}}`. Learners can access only their own attempts and progress. Teachers can access classes they own. Dashboard metrics are class memberships, attempts and latest-attempt mean score; empty cohorts return zero or null.

Available groups: auth, subjects/lessons, quizzes/assessments, tutor, learners progress, teacher dashboard, worksheets, and skill courses/progress. Scores are calculated only by the server from stored answer keys.

Teacher metrics: `learners_with_attempts` counts distinct members with attempts; `attempts` counts all attempt records; `mean_score` is the arithmetic percentage over attempts in the selected owned class. Learning gaps return incorrect answers grouped by question. Worksheets are always created as `DRAFT`; only their owner (or an admin) may edit or approve them.
