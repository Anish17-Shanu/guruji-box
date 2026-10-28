# Decisions

- Local development defaults to SQLite (`backend/guruji.db`) and needs no external services; Docker Compose runs PostgreSQL for parity, and production requires a pooled SSL PostgreSQL URL.
- Development authentication uses signed HTTP-only cookies; HTTPS-only cookies are enabled outside development.
- The initial retriever uses deterministic token-overlap ranking over seeded lesson sections so it works without a vector service.
- Demo accounts exist only through the explicit seed command and are refused in production.
- Sessions embed a per-user token version. Password changes, administrator resets, role changes and enable/disable actions bump the version, so existing cookies are rejected immediately.
- The Windows desktop build wraps the same FastAPI service and React build in Electron. The backend is frozen with PyInstaller, stores SQLite under `%APPDATA%`, serves the SPA from loopback, and applies migrations plus seeding on first launch. This keeps the classroom device fully offline without maintaining a second application codebase.
- The website stays the hosted entry point: it advertises the installer and links to GitHub Releases, while the desktop app disables the browser service worker because its loopback origin changes on every launch.
