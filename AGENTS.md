# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

AiZynthFinder Modern GUI — a FastAPI backend + React/Vite frontend for running retrosynthesis searches. See [README.md](README.md) for full setup docs.

### Services (local dev)

| Service | Port | Start command |
| --- | --- | --- |
| FastAPI backend | 8000 | `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| Vite frontend | 5173 | `cd frontend && npm run dev` |

Use separate tmux sessions for long-running dev servers. Vite proxies `/api` to `http://127.0.0.1:8000`.

### One-time setup (not in update script)

1. **System package**: Ubuntu images may need `sudo apt-get install -y python3.12-venv` before creating the backend venv.
2. **Model data** (~750 MB): run `./scripts/download-public-data.sh` once to create `./aizynth-data/config.yml` and ONNX/stock files. Without this, the UI loads but search returns 503. This download is intentionally excluded from the VM update script.

### Lint / test / build

| Task | Command |
| --- | --- |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build | `cd frontend && npm run build` |
| Backend tests | `cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v` |

`pytest` requires `PYTHONPATH=.` because there is no `pytest.ini` or `pyproject.toml` configuring the import path.

### Environment variables

Optional unless overriding defaults — see `.env.example` and README. The backend auto-detects `./aizynth-data/config.yml` when present.

### Docker alternative

`docker compose up --build` serves everything on host port `43871` (configurable via `AIZYNTH_GUI_PORT`). Model data is downloaded automatically on first container start.
