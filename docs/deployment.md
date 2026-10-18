# Deployment checklist

1. Create a Neon PostgreSQL database and copy its pooled connection string with `sslmode=require`.
2. In the backend Vercel project set `APP_ENV=production`, `DATABASE_URL`, a long `SECRET_KEY`, `FRONTEND_ORIGIN`, `GEMINI_API_KEY`, and `GEMINI_MODEL`.
3. Set frontend `VITE_API_URL=/api`, replace `YOUR-BACKEND` in `frontend/vercel.json`, and deploy frontend after backend.
4. From a trusted workstation run Alembic migrations (migration scaffolding must be generated before first production release); never migrate during serverless startup.
5. Set the deployed frontend domain as the backend CORS origin, then verify `/health`, `/ready`, login, lesson load and quiz submission.
6. Roll back by redeploying the last Vercel deployment; restore Neon only from a verified backup.

The frontend proxies `/api` so the session cookie remains first-party. `Secure` cookies are required outside development.
