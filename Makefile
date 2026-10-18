.PHONY: setup dev seed check backend-check frontend-check e2e
setup:
	python -m pip install -r backend/requirements.txt
	npm --prefix frontend install
dev:
	@echo Start backend: cd backend && uvicorn app.main:app --reload --port 8000
	@echo Start frontend: npm --prefix frontend run dev
seed:
	cd backend && python -m app.seed
backend-check:
	cd backend && python -m pytest -q
frontend-check:
	npm --prefix frontend run lint && npm --prefix frontend run typecheck && npm --prefix frontend run test -- --run && npm --prefix frontend run build
check: backend-check frontend-check
e2e:
	@echo E2E requires local database and running stack; install Playwright then run npm --prefix frontend run e2e
