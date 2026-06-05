"""FastAPI entrypoint for the AiZynthFinder modern GUI."""

from __future__ import annotations

from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator

import anyio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .aizynth_service import RetrosynthesisService, ServiceNotReadyError
from .models import (
    DeploymentStatusResponse,
    MolfileConversionRequest,
    MolfileResponse,
    MetadataResponse,
    SearchRequest,
    SearchResponse,
    SmilesConversionRequest,
    SmilesResponse,
)
from .settings import Settings

settings = Settings.from_env()
service = RetrosynthesisService(settings)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    """Warm AiZynthFinder metadata in the background after the server starts."""

    service.warmup_metadata()
    yield


app = FastAPI(
    title="AiZynthFinder Modern GUI",
    description="Modern web API for interactive AiZynthFinder retrosynthesis searches.",
    version="0.1.0",
    lifespan=lifespan,
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


@app.get("/api/status", response_model=DeploymentStatusResponse)
def status() -> DeploymentStatusResponse:
    """Return lightweight deployment and public data status."""

    return service.deployment_status()


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


@app.post("/api/convert/molfile-to-smiles", response_model=SmilesResponse)
def molfile_to_smiles(request: MolfileConversionRequest) -> SmilesResponse:
    """Convert a ChemDoodle-exported MDL molfile to canonical SMILES."""

    from rdkit import Chem

    mol = Chem.MolFromMolBlock(request.molfile, sanitize=True, removeHs=False)
    if mol is None:
        raise HTTPException(status_code=400, detail="Unable to parse molfile")
    return SmilesResponse(smiles=Chem.MolToSmiles(mol))


@app.post("/api/convert/smiles-to-molfile", response_model=MolfileResponse)
def smiles_to_molfile(request: SmilesConversionRequest) -> MolfileResponse:
    """Convert typed SMILES into a 2D molfile that ChemDoodle can load."""

    from rdkit import Chem
    from rdkit.Chem import AllChem

    mol = Chem.MolFromSmiles(request.smiles)
    if mol is None:
        raise HTTPException(status_code=400, detail="Unable to parse SMILES")
    AllChem.Compute2DCoords(mol)
    return MolfileResponse(molfile=Chem.MolToMolBlock(mol))


static_dir = Path(settings.static_dir)
if static_dir.exists():
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")
