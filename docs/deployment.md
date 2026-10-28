# Deployment and operations

The supported production path is the Compose stack: PostgreSQL 16, the FastAPI backend
(run by uvicorn behind nginx), and the React PWA served by nginx. The frontend proxies
`/api` and the health endpoints so the session cookie stays first-party.

## 1. Prepare the host

- Docker Engine with Compose v2
- A domain name and TLS certificate (Caddy, Traefik, or a cloud load balancer)
- 1 vCPU / 1 GB RAM is enough for small cohorts; 2 vCPU / 2 GB for comfortable headroom
- Outbound HTTPS only if you enable Gemini

## 2. Configure

```bash
git clone <your-repository> guruji-box
cd guruji-box
cp .env.example .env
```

Edit `.env`:

| Setting | Production value |
| --- | --- |
| `APP_ENV` | `production` |
| `SECRET_KEY` | `openssl rand -hex 32` |
| `POSTGRES_PASSWORD` | long random value |
| `PUBLIC_ORIGIN` | `https://learn.example.org` |
| `ALLOWED_HOSTS` | `learn.example.org` |
| `SECURE_COOKIES` | `true` |
| `GEMINI_API_KEY` | optional |
| `SEED_DEMO` | `false` |

`APP_ENV=production` additionally requires a unique 32+ character secret, disables API
docs, and refuses demo accounts. Schema is always applied through Alembic by the container
entrypoint; the app never creates tables from models at runtime.

## 3. Start and create the first administrator

```bash
docker compose up -d --build
docker compose ps
docker compose exec backend python -m app.create_admin \
  --email admin@example.org --name "School Admin" --password 'a-strong-password'
```

The backend entrypoint waits for PostgreSQL, runs `alembic upgrade head`, seeds curriculum
content (`SEED_ON_START=true`), and then starts uvicorn. Seeds are idempotent and never
overwrite learner data.

Open `https://learn.example.org` through your TLS proxy and run:

```bash
make smoke BASE_URL=https://learn.example.org
```

## 4. TLS reverse proxy example

Caddy on the host:

```caddyfile
learn.example.org {
    encode zstd gzip
    reverse_proxy 127.0.0.1:8080
}
```

nginx must not be exposed directly to the internet if you use host TLS; publish port 8080
only on loopback (`127.0.0.1:8080:80`) for the strongest setup.

## 5. Updating

```bash
git pull
docker compose build
docker compose up -d
```

Migrations run automatically on backend start. If a release includes a rollback-sensitive
migration, take a database backup first. Images are built from `package-lock.json` and
`requirements.txt`; rebuild rather than copying files into running containers.

## 6. Backups and restore

Back up nightly (cron or your platform's scheduler):

```bash
docker compose exec -T db pg_dump -U guruji -Fc guruji > guruji-$(date +%F).dump
```

Restore into an empty database:

```bash
docker compose stop backend frontend
docker compose exec -T db pg_restore -U guruji -d guruji --clean --if-exists < backup.dump
docker compose start backend frontend
```

Test a restore quarterly. The database volume `db-data` is not a backup; it lives on the
same host.

## 7. Monitoring and health

- `GET /health` — process is up
- `GET /ready` — database reachable (used by Docker health checks)
- Every response carries `X-Request-ID`; error envelopes include the same ID.
- Logs: `docker compose logs -f backend`
- Audit events for sign-in, role changes, account changes, class and worksheet actions are
  available to administrators in **Admin → Audit trail**.

## 8. Security checklist

- [ ] Unique `SECRET_KEY` and database password
- [ ] HTTPS everywhere; `SECURE_COOKIES=true`
- [ ] `ALLOWED_HOSTS` limited to the real domain
- [ ] `PUBLIC_ORIGIN` exactly matches the browser origin
- [ ] Demo accounts absent (`APP_ENV=production`, `SEED_DEMO=false`)
- [ ] Gemini key restricted to the Gemini API, stored only server-side
- [ ] Database port not published publicly
- [ ] Automated backups and a tested restore
- [ ] Host and container patched regularly

## 9. Password and account operations

- Learners can change their password from **Profile**.
- Administrators can reset a user's password from **Admin → Users → Reset password**.
- Account deletion is a typed confirmation in **Profile**; it anonymises personal data and
  requires teachers to remove owned classes first.
- There is no email service dependency. Invite learners by sharing the class join code or
  by creating accounts; communicate temporary passwords out of band.

## 10. Alternative: split hosting

The frontend can be hosted separately (for example Vercel) by building with
`VITE_API_URL=https://api.example.org` and adding the frontend origin to `EXTRA_ORIGINS`
and `FRONTEND_ORIGIN`. Cookies remain first-party only when the API is on the same site;
cross-site cookies require `SameSite=None; Secure` support, which this deployment does not
assume. Same-origin hosting through nginx is strongly recommended.

If you change `VITE_API_URL`, update the nginx CSP `connect-src` to include that API origin,
or the browser will block requests.

## 11. Scaling notes

- Increase `WEB_CONCURRENCY` to roughly the number of available cores.
- The database pool is 10 connections per worker (max overflow 20); size PostgreSQL
  `max_connections` accordingly.
- The app is stateless; run multiple backend replicas behind the proxy if needed.
- Sheets and limits: auth 20/min, tutor 30/min, general 600/min per client by default.

## 12. Desktop distribution

The Windows installer is built separately from the server images. It bundles the React
build, the FastAPI service, SQLite, and the curriculum, and needs no network at runtime.
Build and release steps, data locations, signing guidance, and smoke tests are in
[`desktop.md`](desktop.md). Tagging a release (`v2.0.0`) runs the `Desktop installer`
workflow, which uploads the installer and attaches it to GitHub Releases. The website's
download card points at that page.
  Tune with `RATE_LIMIT_*_PER_MINUTE`.
