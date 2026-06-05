from fastapi.testclient import TestClient

from app.main import app
from app.models import SearchRequest


def test_health_endpoint() -> None:
    response = TestClient(app).get("/api/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_metadata_reports_not_ready_without_config() -> None:
    response = TestClient(app).get("/api/metadata")

    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is False
    assert "AIZYNTH_CONFIG" in payload["message"]


def test_search_request_strips_smiles_and_atom_limits() -> None:
    request = SearchRequest(smiles=" CCO ", atom_limits={"C": 4, " O ": 0})

    assert request.smiles == "CCO"
    assert request.atom_limits == {"C": 4}
