# Repository Guidelines

## Project Structure & Module Organization

This repository is split into a Python FastAPI backend and a Next.js frontend.

- `backend/app/`: API entry point (`main.py`), routes, models, processors, search, AI agents, workers, and utilities.
- `myApp/`: Next.js app router frontend. Pages live in `app/`, shared UI in `components/`, client/server helpers in `lib/`, hooks in `hooks/`, and static assets in `public/`.
- `tests/`: Python integration/e2e test scripts for ingestion, pipeline, API, and AI logging.
- `data/`, `db_sample/`, and `backend/app/data/`: sample or runtime data. Avoid generated large artifacts.
- `architect/`: architecture diagrams referenced by the README.
- `scripts/`: repository automation, including AI prompt logging hooks.

## Build, Test, and Development Commands

Backend setup:

```bash
python -m venv venv
pip install -r requirements.txt
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Frontend setup:

```bash
cd myApp
pnpm install
pnpm dev
pnpm build
pnpm lint
```

Use `docker-compose up --build` from the repository root for the full local stack when Docker is preferred.

## Coding Style & Naming Conventions

Use Python 3.10+ with 4-space indentation, type hints where practical, and `snake_case` for modules, functions, and variables. Keep FastAPI routes under `backend/app/api/routes/`, Pydantic schemas near API boundaries, and SQLAlchemy models under `backend/app/models/`.

Use TypeScript for frontend code. Components use `PascalCase`, hooks use `useCamelCase`, route folders follow Next.js app-router conventions, and shared primitives stay in `myApp/components/ui/`. Run `pnpm lint` before frontend PRs.

## Testing Guidelines

Python tests are script-style files named `tests/test_*.py`. Run targeted tests directly, for example:

```bash
python tests/test_phase3_api.py
python tests/test_full_e2e_logging.py
```

Add tests beside the existing phase-based coverage when changing ingestion, AI pipeline behavior, API routes, or logging hooks. Document required external services or environment variables in the test header.

## Commit & Pull Request Guidelines

Git history is not available in this checkout, so use concise, imperative commit messages such as `Fix API upload validation` or `Add billing audit filters`.

Before creating a PR, run `bash scripts/setup_hooks.sh` once to install the pre-push hook. PR descriptions must include:

```markdown
## Summary
<description of changes>

## Changes
- <changed files>
```

Include screenshots for visible UI changes and mention any database, environment, or deployment impacts.

## Security & Configuration Tips

Copy templates from `backend/.env.example` and `myApp/.env.local.example`; do not commit real secrets. `.ai-log/*.jsonl`, `.env`, local virtualenvs, `node_modules/`, and `.next/` are gitignored. AI prompt logging is automatic through configured hooks, so do not manually edit prompt logs.
