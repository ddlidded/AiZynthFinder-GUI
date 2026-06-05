from pathlib import Path

from fastapi.testclient import TestClient

from app.aizynth_service import RetrosynthesisService
from app.main import app
from app.models import SearchRequest
from app.settings import Settings


def test_health_endpoint() -> None:
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_metadata_reports_not_ready_without_config() -> None:
    service = RetrosynthesisService(
        Settings(
            config_path=None,
            cors_origins=("http://localhost:5173",),
            max_time_seconds=900,
            max_iterations=5000,
            static_dir=Path("frontend/dist"),
        )
    )

    metadata = service.metadata()

    assert metadata.ready is False
    assert "AIZYNTH_CONFIG" in str(metadata.message)


def test_search_request_strips_smiles_and_atom_limits() -> None:
    request = SearchRequest(smiles=" CCO ", atom_limits={"C": 4, " O ": 0})

    assert request.smiles == "CCO"
    assert request.atom_limits == {"C": 4}
