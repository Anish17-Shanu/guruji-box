PYTHON ?= python
NPM ?= npm
HTTP_PORT ?= 8080
BASE_URL ?= http://localhost:$(HTTP_PORT)

.PHONY: help setup dev dev-backend dev-frontend seed migrate migration-check migration admin \
	test test-backend test-frontend e2e check lint build \
	docker-build docker-up docker-down docker-logs smoke clean

help:
	@echo "GURUJI BOX"
	@echo "  make setup           Install backend and frontend dependencies"
	@echo "  make dev-backend     API on http://localhost:8000 (reload)"
	@echo "  make dev-frontend    Vite on http://localhost:5173"
	@echo "  make seed            Seed curriculum + demo accounts (development)"
	@echo "  make migrate         Apply database migrations"
	@echo "  make migration-check Verify migrations match the models"
	@echo "  make migration m=..  Create an Alembic revision"
	@echo "  make admin EMAIL=.. PASSWORD=..  Create or promote an administrator"
	@echo "  make check           Backend tests + frontend lint/typecheck/unit/build"
	@echo "  make e2e             Playwright journeys against a disposable stack"
	@echo "  make docker-up       Build and start the production stack"
	@echo "  make smoke           Health and content smoke test (BASE_URL)"
	@echo "  make clean           Remove local build and test artifacts"

setup:
	$(PYTHON) -m pip install -r backend/requirements.txt
	$(NPM) --prefix frontend ci

dev-backend: migrate
	cd backend && $(PYTHON) -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

dev-frontend:
	$(NPM) --prefix frontend run dev

seed:
	cd backend && $(PYTHON) -m alembic upgrade head
	cd backend && $(PYTHON) -m app.seed

migrate:
	cd backend && $(PYTHON) -m alembic upgrade head

migration-check:
	cd backend && rm -f .migration-check.db && \
		DATABASE_URL="sqlite:///./.migration-check.db" $(PYTHON) -m alembic upgrade head && \
		DATABASE_URL="sqlite:///./.migration-check.db" $(PYTHON) -m alembic check && \
		rm -f .migration-check.db

migration:
	cd backend && $(PYTHON) -m alembic revision --autogenerate -m "$(m)"

admin:
	@test -n "$(EMAIL)" || (echo "Set EMAIL=..." && exit 1)
	@test -n "$(PASSWORD)" || (echo "Set PASSWORD=..." && exit 1)
	cd backend && $(PYTHON) -m app.create_admin --email "$(EMAIL)" --name "$(or $(NAME),Administrator)" --password "$(PASSWORD)"

test-backend:
	cd backend && $(PYTHON) -m pytest -q

test-frontend:
	$(NPM) --prefix frontend run lint
	$(NPM) --prefix frontend run typecheck
	$(NPM) --prefix frontend test

lint:
	$(NPM) --prefix frontend run lint
	$(NPM) --prefix frontend run typecheck

build:
	$(NPM) --prefix frontend run build

test: test-backend test-frontend

e2e:
	$(NPM) --prefix frontend run e2e

check: test-backend migration-check test-frontend build

docker-build:
	docker compose build

docker-up:
	docker compose up -d --build

docker-down:
	docker compose down

docker-logs:
	docker compose logs -f --tail=200

smoke:
	./scripts/smoke.sh "$(BASE_URL)"

clean:
	rm -rf frontend/dist frontend/playwright-report frontend/test-results backend/.pytest_cache
	find backend -name '__pycache__' -type d -prune -exec rm -rf {} +
