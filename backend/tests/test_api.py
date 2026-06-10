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


def test_status_endpoint_is_lightweight() -> None:
    response = TestClient(app).get("/api/status")

    assert response.status_code == 200
    payload = response.json()
    assert payload["api_ready"] is True
    assert "message" in payload


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


def test_deployment_status_reports_missing_config() -> None:
    service = RetrosynthesisService(
        Settings(
            config_path=None,
            cors_origins=("http://localhost:5173",),
            max_time_seconds=900,
            max_iterations=5000,
            static_dir=Path("frontend/dist"),
        )
    )

    status = service.deployment_status()

    assert status.public_data_ready is False
    assert "config was not found" in status.message


def test_deployment_status_reports_background_download(tmp_path: Path) -> None:
    config_path = tmp_path / "config.yml"
    config_path.touch()
    (tmp_path / ".download-in-progress").touch()
    service = RetrosynthesisService(
        Settings(
            config_path=config_path,
            cors_origins=("http://localhost:5173",),
            max_time_seconds=900,
            max_iterations=5000,
            static_dir=Path("frontend/dist"),
        )
    )

    status = service.deployment_status()

    assert status.download_in_progress is True
    assert status.public_data_ready is False
    assert "download is running" in status.message


def test_search_request_strips_smiles_and_atom_limits() -> None:
    request = SearchRequest(smiles=" CCO ", atom_limits={"C": 4, " O ": 0})

    assert request.smiles == "CCO"
    assert request.atom_limits == {"C": 4}


def test_smiles_to_molfile_and_back() -> None:
    client = TestClient(app)

    molfile_response = client.post(
        "/api/convert/smiles-to-molfile", json={"smiles": "CCO"}
    )
    assert molfile_response.status_code == 200
    molfile = molfile_response.json()["molfile"]
    assert "V2000" in molfile

    smiles_response = client.post(
        "/api/convert/molfile-to-smiles", json={"molfile": molfile}
    )
    assert smiles_response.status_code == 200
    assert smiles_response.json()["smiles"] == "CCO"


def test_invalid_molfile_conversion_returns_400() -> None:
    response = TestClient(app).post(
        "/api/convert/molfile-to-smiles", json={"molfile": "not a molfile"}
    )

    assert response.status_code == 400


def test_pdf_report_endpoint_returns_pdf() -> None:
    response = TestClient(app).post(
        "/api/report/pdf",
        json={
            "target": "CCO",
            "statistics": {
                "search_time": 0.5,
                "top_score": 0.99,
                "is_solved": True,
                "number_of_routes": 1,
            },
            "routes": [
                {
                    "index": 1,
                    "is_solved": True,
                    "scores": {"state score": 0.99},
                    "metadata": {"is_solved": True},
                    "tree": {
                        "type": "mol",
                        "smiles": "CCO",
                        "in_stock": False,
                        "children": [
                            {
                                "type": "reaction",
                                "smiles": "CCO>>CC.O",
                                "children": [
                                    {
                                        "type": "mol",
                                        "smiles": "CC",
                                        "in_stock": True,
                                    },
                                    {
                                        "type": "mol",
                                        "smiles": "O",
                                        "in_stock": True,
                                    },
                                ],
                            }
                        ],
                    },
                    "image": None,
                }
            ],
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")
