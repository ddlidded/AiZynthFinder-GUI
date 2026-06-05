"""Runtime settings for the AiZynthFinder web API."""

from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _split_csv(value: str | None, default: tuple[str, ...]) -> tuple[str, ...]:
    if not value:
        return default
    return tuple(item.strip() for item in value.split(",") if item.strip())


@dataclass(frozen=True)
class Settings:
    """Configuration sourced from environment variables."""

    config_path: Path | None
    cors_origins: tuple[str, ...]
    max_time_seconds: int
    max_iterations: int
    static_dir: Path

    @classmethod
    def from_env(cls) -> "Settings":
        config = os.getenv("AIZYNTH_CONFIG") or os.getenv("AIZYNTHFINDER_CONFIG")
        repo_root = Path(__file__).resolve().parents[2]
        static_dir = Path(
            os.getenv("FRONTEND_DIST", repo_root.parent / "frontend" / "dist")
        )
        return cls(
            config_path=Path(config).expanduser() if config else None,
            cors_origins=_split_csv(
                os.getenv("CORS_ORIGINS"),
                ("http://localhost:5173", "http://127.0.0.1:5173"),
            ),
            max_time_seconds=int(os.getenv("MAX_SEARCH_TIME_SECONDS", "900")),
            max_iterations=int(os.getenv("MAX_SEARCH_ITERATIONS", "5000")),
            static_dir=static_dir,
        )
