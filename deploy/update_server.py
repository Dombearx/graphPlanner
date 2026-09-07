# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "fastapi",
#     "uvicorn",
# ]
# ///
"""Przestawia GraphPlannera na najnowszy kod: `git pull`, potem przebudowa Composem.

Chodzi bezpośrednio na minipc, poza Dockerem — inaczej musiałby dostać do środka
gniazdo dockera gospodarza, żeby móc przebudować stos, w którym sam siedzi.
Zależności deklaruje w sobie (PEP 723), więc `uv run deploy/update_server.py`
ściąga fastapi i uvicorna do osobnego środowiska; aplikacja jest w node, więc
nie ma tu czego współdzielić z `package.json`.

Wywołuje go GitHub Actions po zielonym CI (`.github/workflows/deploy.yml`):
runner wchodzi do sieci NetBird i puka tutaj, więc minipc nie musi niczego
odpytywać ani być widoczny z internetu.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import os
import secrets
import subprocess
import sys
import threading
import time
from pathlib import Path
from typing import Annotated

import uvicorn
from fastapi import FastAPI, HTTPException, Header
from fastapi.responses import PlainTextResponse

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

UPDATE_SERVER_HOST = "0.0.0.0"
# Inny port niż serwery aktualizacji, które już stoją na tym samym minipc
# (AlphaPump — 40002, karta postaci — 40003). Kolizja jest cicha aż do
# pierwszego wdrożenia, które trafi nie w tę usługę.
DEFAULT_UPDATE_SERVER_PORT = 40004
COMPOSE_FILE = "docker-compose.yml"

# Sekret ustawiany w drop-inie systemd, nigdy w repozytorium — patrz
# `deploy/graphplanner-update-server.service`.
PUBLISH_TOKEN_VARIABLE = "UPDATE_SERVER_PUBLISH_TOKEN"

app = FastAPI(title="GraphPlanner — serwer aktualizacji")

# Jedno wdrożenie naraz. Dwa równoległe `docker compose up --build` biją się
# o te same kontenery i ten sam cache budowania, a porażka przegranego wygląda
# dokładnie tak samo jak zepsuty commit.
redeploy_lock = asyncio.Lock()


def require_publish_token(authorization: str | None) -> None:
    """Odrzuca żądanie bez sekretu wdrożeniowego.

    Porównanie przez `compare_digest`, nie `==`: przy ruchu wyłącznie w VPN-ie
    różnica jest teoretyczna, ale sprawdzenie tokenu napisane „normalnie" bywa
    kopiowane tam, gdzie teoretyczna już nie jest.
    """
    expected = os.environ.get(PUBLISH_TOKEN_VARIABLE, "")
    if expected == "":
        raise HTTPException(
            status_code=503,
            detail=(
                f"Wdrażanie jest wyłączone: {PUBLISH_TOKEN_VARIABLE} nie jest ustawiony "
                "na serwerze aktualizacji. Ustaw go w drop-inie systemd "
                "(sudo systemctl edit graphplanner-update-server) i zrestartuj usługę."
            ),
        )

    presented = authorization[7:] if (authorization or "").startswith("Bearer ") else ""
    if not secrets.compare_digest(presented, expected):
        raise HTTPException(status_code=401, detail="Brak albo zły token wdrożeniowy")


@app.get("/health", response_class=PlainTextResponse)
def health() -> PlainTextResponse:
    """Odpowiada, że proces żyje — na to czeka workflow, zanim zawoła `/update`.

    Celowo nie dotyka ani gita, ani dockera: ma odpowiedzieć także wtedy, gdy
    stos leży, bo to jest dokładnie ten moment, w którym trzeba go przestawić.
    """
    return PlainTextResponse("ok")


@app.get("/update", response_class=PlainTextResponse)
def update_wrong_method() -> PlainTextResponse:
    """Mówi wprost, czym zastąpić `GET`, zamiast oddawać nagie 405."""
    return PlainTextResponse(
        "Wdrożenie to POST /update z tokenem:\n"
        '  curl -X POST -H "Authorization: Bearer $UPDATE_SERVER_PUBLISH_TOKEN" .../update\n',
        status_code=405,
    )


@app.post("/update", response_class=PlainTextResponse)
async def update(
    authorization: Annotated[str | None, Header()] = None,
) -> PlainTextResponse:
    """Ściąga najnowszy kod i przebudowuje stos.

    `POST` z tokenem, nie gołe `GET`, i obie połowy są tu z powodu. Token, bo ta
    trasa woła `git pull` i `docker compose` jako użytkownik w grupie `docker` —
    czyli jest najmocniejszą rzeczą w całym wdrożeniu. Metoda, bo zmieniający
    stan `GET` odpala się z dowolnej strony otwartej przez kogoś w VPN-ie
    (`<img src="http://minipc:40004/update">`), z prefetcha przeglądarki i
    z czegokolwiek, co odwiedza podany mu adres.
    """
    require_publish_token(authorization)

    if redeploy_lock.locked():
        raise HTTPException(status_code=409, detail="Wdrożenie już trwa")

    async with redeploy_lock:
        return await asyncio.to_thread(_redeploy)


def _redeploy() -> PlainTextResponse:
    logger.info("Przyszło żądanie wdrożenia")

    before = _own_source_digest()

    pull = subprocess.run(["git", "pull", "--ff-only"], capture_output=True, text=True)
    if pull.returncode != 0:
        return PlainTextResponse(
            f"Nie udało się pobrać kodu\n{pull.stderr}", status_code=500
        )

    # Obraz dostaje tag commita, z którego powstał, więc `docker images` odpowiada
    # na pytanie „co właściwie chodzi", a cofnięcie się to `IMAGE_TAG=<starszy sha>
    # docker compose up -d` na obrazie, który wciąż leży na dysku — zamiast
    # checkoutu i pełnej przebudowy na żywym stosie.
    revision = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True
    )
    tag = revision.stdout.strip() if revision.returncode == 0 else "local"

    up = subprocess.run(
        ["docker", "compose", "-f", COMPOSE_FILE, "up", "-d", "--build", "--force-recreate"],
        capture_output=True,
        text=True,
        env={**os.environ, "IMAGE_TAG": tag},
    )
    if up.returncode != 0:
        return PlainTextResponse(
            "Nie udało się przestawić usługi\n"
            f"Status: {up.returncode}\n{up.stdout}\n{up.stderr}",
            status_code=500,
        )

    restarting = _own_source_digest() != before
    if restarting:
        _restart_after_response()

    return PlainTextResponse(
        f"Usługa przestawiona ({tag})\n{pull.stdout}\n{up.stdout}"
        + ("\nKod tego serwera zmienił się w tym pullu; restartuję się w nowy.\n" if restarting else "")
    )


def _own_source_digest() -> str:
    """Skrót tego pliku — po to, żeby zauważyć, że pull podmienił działający kod."""
    try:
        return hashlib.sha256(Path(__file__).read_bytes()).hexdigest()
    except OSError:
        return ""


def _restart_after_response() -> None:
    """Podmienia się na świeżo pobrany kod, gdy odpowiedź jest już w drucie.

    `/update` ściąga repozytorium, ale sam chodzi z pamięci: bez tego wdrożenie,
    które zmienia ten plik, zostawiało serwer w starej wersji, a objawem była
    trasa odpowiadająca 404 przy zdrowym `/health` — czyli coś nie do odróżnienia
    od zepsutego wydania.

    `os.execv`, nie `systemctl restart`: nie wymaga uprawnień, których usługa i
    tak nie ma, a systemd pilnuje dalej tego samego PID-u. Jeśli nowy kod nie
    wstanie, proces padnie i `Restart=always` podniesie go przez `ExecStart`.
    """

    def relaunch() -> None:
        time.sleep(1)
        logger.info("Restartuję się w kod, który przed chwilą przyszedł")
        try:
            os.execv(sys.executable, [sys.executable, str(Path(__file__).resolve())])
        except OSError:
            logger.exception("Nie udało się zrestartować; jeśli proces padnie, podniesie go systemd")

    threading.Thread(target=relaunch, daemon=True).start()


if __name__ == "__main__":
    port = int(os.environ.get("UPDATE_SERVER_PORT", DEFAULT_UPDATE_SERVER_PORT))
    uvicorn.run(app, host=UPDATE_SERVER_HOST, port=port)
