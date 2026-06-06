# AGENTS.md

## Cursor Cloud specific instructions

### Product overview

AiZynthFinder Modern GUI — FastAPI backend + React/Vite/Flowbite/Tailwind frontend for retrosynthesis searches. See [README.md](README.md).

### Services (local dev)

| Service | Port | Start command |
| --- | --- | --- |
| FastAPI backend | 8000 | `cd backend && source .venv/bin/activate && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000` |
| Vite frontend | 5173 | `cd frontend && npm run dev` |

Use separate tmux sessions for long-running servers. **Use port 5173 for the latest UI during development** — it hot-reloads. Port 8000 serves `frontend/dist` only after `npm run build`.

Vite proxies `/api` to `http://127.0.0.1:8000`.

### One-time setup (not in update script)

1. **System package**: `sudo apt-get install -y python3.12-venv` if venv creation fails on Ubuntu.
2. **Model data** (~750 MB): `./scripts/download-public-data.sh` → `./aizynth-data/`. Without this, search is disabled (503). Excluded from the VM update script due to size.
3. **ChemDoodle sketcher assets** (manual): download ChemDoodle Web Components from https://web.chemdoodle.com/installation/download and place under `frontend/public/chemdoodle/`:
   - `ChemDoodleWeb.css`
   - `ChemDoodleWeb.js`
   - `uis/ChemDoodleWeb-uis.js`
   
   The SMILES input and search still work without these files; only the molecule sketcher panel is affected.

### Lint / test / build

| Task | Command |
| --- | --- |
| Frontend lint | `cd frontend && npm run lint` |
| Frontend build | `cd frontend && npm run build` |
| Backend tests | `cd backend && source .venv/bin/activate && PYTHONPATH=. pytest -v` |

`pytest` requires `PYTHONPATH=.` (no `pytest.ini`).

### API endpoints (current)

- `GET /api/health` — liveness
- `GET /api/status` — lightweight deployment/data status
- `GET /api/metadata` — engine options (background warmup on startup)
- `POST /api/search` — retrosynthesis search
- `POST /api/convert/smiles-to-molfile` / `molfile-to-smiles` — ChemDoodle bridge (RDKit)
- `POST /api/report/pdf` — PDF export for selected routes

### Stale preview troubleshooting

If the browser shows an old UI: hard-reload (`Ctrl+Shift+R`), confirm you are on the latest branch, run `npm ci` + `npm run dev` on 5173, and rebuild `frontend/dist` if testing via port 8000.

### Docker alternative

`docker compose up --build` — two-service setup (nginx frontend on host port `43871`, internal backend on `8000`). Model data auto-downloads on first backend start.
