.PHONY: run stop logs update smoke

# Buduje obraz i uruchamia aplikację na http://localhost:3001
run:
	docker compose up -d --build

stop:
	docker compose down

logs:
	docker compose logs -f

# Ściąga najnowszy kod z main i przebudowuje/restartuje kontener.
# To samo, co robi zdalnie serwer aktualizacji (deploy/update_server.py).
update:
	git pull --ff-only
	docker compose up -d --build

# Sprawdza działający stos z zewnątrz, po HTTP
smoke:
	deploy/smoke.sh
