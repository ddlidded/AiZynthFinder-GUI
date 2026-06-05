"""FastAPI entrypoint for the AiZynthFinder modern GUI."""

from __future__ import annotations

from pathlib import Path

import anyio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .aizynth_service import RetrosynthesisService, ServiceNotReadyError
from .models import MetadataResponse, SearchRequest, SearchResponse
from .settings import Settings

settings = Settings.from_env()
service = RetrosynthesisService(settings)

app = FastAPI(
    title="AiZynthFinder Modern GUI",
    description="Modern web API for interactive AiZynthFinder retrosynthesis searches.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    """Basic liveness endpoint."""

    return {"status": "ok"}


@app.get("/api/metadata", response_model=MetadataResponse)
def metadata() -> MetadataResponse:
    """Return available AiZynthFinder options for the GUI."""

    return service.metadata()


@app.post("/api/search", response_model=SearchResponse)
async def search(request: SearchRequest) -> SearchResponse:
    """Run a retrosynthesis search for the supplied target SMILES."""

    try:
        return await anyio.to_thread.run_sync(service.search, request)
    except ServiceNotReadyError as err:
        raise HTTPException(status_code=503, detail=str(err)) from err
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err)) from err


static_dir = Path(settings.static_dir)
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
