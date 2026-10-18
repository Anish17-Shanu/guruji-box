# Decisions

- Local development uses PostgreSQL through Docker Compose; production requires a pooled SSL PostgreSQL URL.
- Development authentication uses signed HTTP-only cookies; HTTPS-only cookies are enabled outside development.
- The initial retriever uses deterministic token-overlap ranking over seeded lesson sections so it works without a vector service.
- Demo accounts exist only through the explicit seed command and are refused in production.
