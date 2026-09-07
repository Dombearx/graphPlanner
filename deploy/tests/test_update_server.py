"""Co serwer aktualizacji robi z żądaniem wdrożenia, a czego nie robi.

Ten serwer stoi na minipc poza Composem i poza aplikacją, więc nie łapie go nic,
co dotyka `server/` ani `client/`. A jest to jedyne miejsce we wdrożeniu, które
woła `git` i `docker` jako użytkownik w grupie `docker` — regresja w sprawdzaniu
tokenu albo w kolejności „pull, potem budowa" jest tu warta dokładnie tyle, co
cały dostęp do minipc.

`subprocess.run` jest podmieniany: testy sprawdzają, **jakie polecenia** by
poszły i co się dzieje, gdy któreś padnie — nie uruchamiają dockera.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import update_server  # noqa: E402

TOKEN = "testowy-token-wdrozeniowy"
AUTHORIZED = {"Authorization": f"Bearer {TOKEN}"}

client = TestClient(update_server.app)


@pytest.fixture(autouse=True)
def deployment_enabled(monkeypatch: pytest.MonkeyPatch) -> None:
    """Bez ustawionego sekretu każde wdrożenie tutaj kończyłoby się na 503."""
    monkeypatch.setenv(update_server.PUBLISH_TOKEN_VARIABLE, TOKEN)


class FakeRun:
    """Zapisuje wywołania `subprocess.run` i oddaje z góry ustalone wyniki."""

    def __init__(self, results: dict[str, subprocess.CompletedProcess[str]]):
        self.results = results
        self.calls: list[tuple[list[str], dict[str, str]]] = []

    def __call__(self, args, **kwargs):  # noqa: ANN001, ANN204
        self.calls.append((list(args), dict(kwargs.get("env") or {})))
        key = " ".join(args[:2])
        return self.results.get(
            key, subprocess.CompletedProcess(args, 0, stdout="", stderr="")
        )

    def commands(self) -> list[str]:
        return [" ".join(args) for args, _ in self.calls]


def ok(stdout: str = "") -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], 0, stdout=stdout, stderr="")


def failed(stderr: str) -> subprocess.CompletedProcess[str]:
    return subprocess.CompletedProcess([], 1, stdout="", stderr=stderr)


@pytest.fixture
def run(monkeypatch: pytest.MonkeyPatch) -> FakeRun:
    fake = FakeRun(
        {
            "git pull": ok("Already up to date.\n"),
            "git rev-parse": ok("abc1234\n"),
            "docker compose": ok("Container graphplanner Started\n"),
        }
    )
    monkeypatch.setattr(update_server.subprocess, "run", fake)
    # Restart w nowy kod jest sprawdzany osobno; tutaj podmieniłby proces testowy.
    monkeypatch.setattr(update_server, "_restart_after_response", lambda: None)
    return fake


def test_health_nie_dotyka_gita_ani_dockera(monkeypatch: pytest.MonkeyPatch) -> None:
    """Workflow czeka na `/health` **zanim** cokolwiek wdroży.

    Gdyby ta trasa sprawdzała stos, leżąca aplikacja blokowałaby wdrożenie, które
    ma ją podnieść — czyli awaria uniemożliwiałaby naprawę.
    """

    def explode(*_args, **_kwargs):  # noqa: ANN002, ANN003, ANN202
        raise AssertionError("/health nie ma nic uruchamiać")

    monkeypatch.setattr(update_server.subprocess, "run", explode)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.text == "ok"


def test_get_update_mowi_czym_go_zastapic() -> None:
    """Gołe 405 wyglądałoby na awarię serwera, a nie na złą metodę."""
    response = client.get("/update")

    assert response.status_code == 405
    assert "POST /update" in response.text


@pytest.mark.parametrize(
    "headers",
    [{}, {"Authorization": "Bearer nie-ten"}, {"Authorization": TOKEN}],
    ids=["bez nagłówka", "zły token", "token bez schematu Bearer"],
)
def test_wdrozenie_bez_wlasciwego_tokenu_nic_nie_uruchamia(
    headers: dict[str, str], run: FakeRun
) -> None:
    response = client.post("/update", headers=headers)

    assert response.status_code == 401
    assert run.commands() == []


def test_bez_sekretu_na_serwerze_wdrozenie_jest_wylaczone_a_nie_otwarte(
    monkeypatch: pytest.MonkeyPatch, run: FakeRun
) -> None:
    """Zapomniany drop-in ma zamykać trasę, nie otwierać jej dla wszystkich."""
    monkeypatch.delenv(update_server.PUBLISH_TOKEN_VARIABLE, raising=False)

    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 503
    assert run.commands() == []


def test_wdrozenie_pobiera_kod_i_przebudowuje_stos(run: FakeRun) -> None:
    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 200
    commands = run.commands()
    assert commands[0].startswith("git pull")
    assert commands[-1].startswith("docker compose -f docker-compose.yml up")
    assert "--build" in commands[-1]


def test_obraz_dostaje_tag_wdrozonego_commita(run: FakeRun) -> None:
    """Bez tego cofnięcie się to checkout i pełna przebudowa na żywym stosie."""
    client.post("/update", headers=AUTHORIZED)

    compose_env = next(env for args, env in run.calls if args[0] == "docker")
    assert compose_env["IMAGE_TAG"] == "abc1234"


def test_nieudany_pull_nie_przebudowuje_niczego(run: FakeRun) -> None:
    """Inaczej porażka `git pull` wdrażałaby po cichu poprzedni commit jeszcze raz."""
    run.results["git pull"] = failed("fatal: nie da się scalić\n")

    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 500
    assert not any(command.startswith("docker") for command in run.commands())


def test_nieudana_przebudowa_jest_bledem_wdrozenia(run: FakeRun) -> None:
    """Zielony workflow przy leżącym stosie byłby gorszy niż brak workflow."""
    run.results["docker compose"] = failed("service graphplanner failed to build\n")

    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 500
    assert "failed to build" in response.text


def test_serwer_restartuje_sie_gdy_pull_podmienil_jego_kod(
    run: FakeRun, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Serwer chodzi z pamięci, więc bez tego wdrożenie zmieniające ten plik
    zostawia go w starej wersji — przy zdrowym `/health`."""
    restarted: list[bool] = []
    monkeypatch.setattr(update_server, "_restart_after_response", lambda: restarted.append(True))

    digests = iter(["przed", "po"])
    monkeypatch.setattr(update_server, "_own_source_digest", lambda: next(digests))

    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 200
    assert restarted == [True]


def test_bez_zmiany_kodu_serwera_nie_ma_restartu(
    run: FakeRun, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Restart przy każdym wdrożeniu zrywałby połączenie, które o nie poprosiło."""
    restarted: list[bool] = []
    monkeypatch.setattr(update_server, "_restart_after_response", lambda: restarted.append(True))
    monkeypatch.setattr(update_server, "_own_source_digest", lambda: "bez zmian")

    response = client.post("/update", headers=AUTHORIZED)

    assert response.status_code == 200
    assert restarted == []
