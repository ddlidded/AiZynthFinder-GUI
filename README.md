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
This repo includes a helper that downloads the official public data used by
AiZynthFinder:

- USPTO expansion policy ONNX model
- USPTO reaction templates
- USPTO ringbreaker model/templates
- USPTO filter policy ONNX model
- ZINC stock collection (`zinc_stock.hdf5`)

Download it with:

```bash
./scripts/download-public-data.sh
```

This creates `./aizynth-data/config.yml`. The backend auto-detects that path
when `AIZYNTH_CONFIG` is not set.

## Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
export AIZYNTH_CONFIG=/absolute/path/to/aizynth-data/config.yml
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

If you used `./scripts/download-public-data.sh` and kept the default
`./aizynth-data` directory, the `AIZYNTH_CONFIG` export is optional.

Useful environment variables:

| Variable | Description | Default |
| --- | --- | --- |
| `AIZYNTH_CONFIG` | Path to AiZynthFinder `config.yml` | auto-detects `./aizynth-data/config.yml` when present |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins | `http://localhost:5173,http://127.0.0.1:5173` |
| `MAX_SEARCH_TIME_SECONDS` | Backend cap for a single search | `900` |
| `MAX_SEARCH_ITERATIONS` | Backend cap for a single search | `5000` |
| `FRONTEND_DIST` | Static frontend build served by FastAPI | `frontend/dist` |

The API exposes:

- `GET /api/health`
- `GET /api/metadata`
- `POST /api/search`

If `AIZYNTH_CONFIG` is missing and `./aizynth-data/config.yml` is not present,
the UI still loads and shows setup instructions, but search execution is
disabled until the backend is configured.

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

## Easypanel / Docker Compose deployment

This repository includes a single-container Docker deployment for Easypanel.
It builds the React frontend, installs the Python backend, and automatically
downloads the public AiZynthFinder data on first startup:

- USPTO expansion policy ONNX model
- USPTO reaction templates
- USPTO ringbreaker model/templates
- USPTO filter policy ONNX model
- ZINC stock collection

No manual model download is required for Docker deployment.

The compose file maps the application to a randomly chosen high host port:

```text
43871 -> container port 8000
```

Run locally with:

```bash
docker compose up --build
```

Then open:

```text
http://localhost:43871
```

For Easypanel:

1. Create a new Compose app.
2. Use the repository's `docker-compose.yml`.
3. Deploy.
4. Wait for the first boot to download the public USPTO/ZINC data into the
   `aizynthfinder-public-data` Docker volume.

If port `43871` is already used on your host, set `AIZYNTH_GUI_PORT` to another
free high port before deployment. The internal container port remains `8000`.

### Easypanel startup status

The container logs every required public data file before starting the web
server. On first boot, Easypanel may show the service as starting while the
USPTO/ZINC files are downloaded into the Docker volume.

Useful checks:

- `GET /api/health` - API liveness only
- `GET /api/status` - fast deployment check for config/model/stock files
- `GET /api/metadata` - initializes AiZynthFinder and can take longer on first
  startup because it loads the USPTO models and ZINC stock

If the UI shows **Loading engine**, the public data files are present and the
backend is initializing AiZynthFinder. If it shows **Waiting for data**, inspect
the Easypanel container logs for the automatic download/verification output.
