# AiZynthFinder Modern GUI

A modern web application for running [AiZynthFinder](https://github.com/MolecularAI/aizynthfinder)
retrosynthesis searches from either typed SMILES or a browser-based molecule sketcher.

The app recreates the workflow of the original Jupyter notebook GUI with:

- SMILES input plus an embedded JSME molecule drawing tool
- Dynamic loading of configured stocks, expansion policies, filter policies, and scorers
- Search controls for time limit, iteration limit, route depth, atom limits, and rewards
- Ranked route summaries, nested route trees, scores, search statistics, and optional route images
- A FastAPI backend that calls the official AiZynthFinder Python API

## Prerequisites

- Python 3.10-3.12
- Node.js 20+
- AiZynthFinder model data and stock files

AiZynthFinder requires a configuration file that points to stock and policy model data.
You can download the public example data with:

```bash
python -m pip install "aizynthfinder[all]"
download_public_data ./aizynth-data
```

This creates a `config.yml` file under `./aizynth-data`.

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export AIZYNTH_CONFIG=/absolute/path/to/aizynth-data/config.yml
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Useful environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `AIZYNTH_CONFIG` | Path to AiZynthFinder `config.yml` | unset |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `MAX_SEARCH_TIME_SECONDS` | Backend cap for a single search | `900` |
| `MAX_SEARCH_ITERATIONS` | Backend cap for a single search | `5000` |
| `FRONTEND_DIST` | Static frontend build served by FastAPI | `frontend/dist` |

The API exposes:

- `GET /api/health`
- `GET /api/metadata`
- `POST /api/search`

If `AIZYNTH_CONFIG` is missing, the UI still loads and shows setup instructions,
but search execution is disabled until the backend is configured.

## Frontend

```bash
cd frontend
npm install
npm run dev
```

By default, Vite proxies `/api` requests to `http://127.0.0.1:8000`.

The molecule sketcher loads JSME from:

```text
https://jsme-editor.github.io/dist/jsme/jsme.nocache.js
```

For offline or controlled deployments, host the JSME distribution yourself and set:

```bash
export VITE_JSME_URL=/jsme/jsme.nocache.js
```

## Production build

```bash
cd frontend
npm run build
cd ../backend
export AIZYNTH_CONFIG=/absolute/path/to/aizynth-data/config.yml
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

When `frontend/dist` exists, the FastAPI server serves the built web app from `/`.
