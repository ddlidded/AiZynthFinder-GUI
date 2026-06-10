"""Pydantic models shared by the API endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field, field_validator


class SearchDefaults(BaseModel):
    time_limit: int = 60
    iteration_limit: int = 100
    max_transforms: int = 6
    return_first: bool = False
    rewards: list[str] = Field(default_factory=list)


class MetadataResponse(BaseModel):
    ready: bool
    message: str | None = None
    config_path: str | None = None
    stocks: list[str] = Field(default_factory=list)
    expansion_policies: list[str] = Field(default_factory=list)
    filter_policies: list[str] = Field(default_factory=list)
    scorers: list[str] = Field(default_factory=list)
    defaults: SearchDefaults = Field(default_factory=SearchDefaults)


class DataFileStatus(BaseModel):
    name: str
    path: str
    exists: bool
    size_bytes: int = 0


class DeploymentStatusResponse(BaseModel):
    api_ready: bool = True
    config_path: str | None = None
    data_dir: str | None = None
    public_data_ready: bool = False
    download_in_progress: bool = False
    download_error: str | None = None
    engine_initialized: bool = False
    engine_initializing: bool = False
    engine_error: str | None = None
    missing_files: list[str] = Field(default_factory=list)
    files: list[DataFileStatus] = Field(default_factory=list)
    message: str


class SearchRequest(BaseModel):
    smiles: str = Field(..., min_length=1)
    stocks: list[str] = Field(default_factory=list)
    expansion_policies: list[str] = Field(default_factory=list)
    filter_policies: list[str] = Field(default_factory=list)
    atom_limits: dict[str, int] = Field(default_factory=dict)
    time_limit: int = Field(60, ge=5)
    iteration_limit: int = Field(100, ge=1)
    max_transforms: int = Field(6, ge=1, le=30)
    return_first: bool = False
    rewards: list[str] = Field(default_factory=list)
    route_scorer: str | None = None

    @field_validator("smiles")
    @classmethod
    def normalize_smiles(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("SMILES cannot be empty")
        return normalized

    @field_validator("atom_limits")
    @classmethod
    def keep_positive_atom_limits(cls, value: dict[str, int]) -> dict[str, int]:
        return {
            atom.strip(): int(limit)
            for atom, limit in value.items()
            if atom.strip() and int(limit) > 0
        }


class MolfileConversionRequest(BaseModel):
    molfile: str = Field(..., min_length=1)


class SmilesConversionRequest(BaseModel):
    smiles: str = Field(..., min_length=1)

    @field_validator("smiles")
    @classmethod
    def normalize_smiles(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("SMILES cannot be empty")
        return normalized


class SmilesResponse(BaseModel):
    smiles: str


class MolfileResponse(BaseModel):
    molfile: str


class RouteResult(BaseModel):
    index: int
    is_solved: bool
    scores: dict[str, Any] = Field(default_factory=dict)
    metadata: dict[str, Any] = Field(default_factory=dict)
    tree: dict[str, Any]
    image: str | None = None


class SearchResponse(BaseModel):
    target: str
    elapsed_seconds: float
    statistics: dict[str, Any]
    stock_info: dict[str, Any]
    routes: list[RouteResult]
    warnings: list[str] = Field(default_factory=list)


class ReportRequest(BaseModel):
    target: str = Field(..., min_length=1)
    statistics: dict[str, Any] = Field(default_factory=dict)
    routes: list[RouteResult] = Field(..., min_length=1)
    title: str = "AiZynthFinder Retrosynthesis Report"
