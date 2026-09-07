#!/usr/bin/env bash
#
# Sprawdzenie stosu po wdrożeniu — z zewnątrz, po HTTP, jak przeglądarka.
#
# To nie jest test jednostkowy. To jest sprawdzenie **złożenia**: czy frontend
# w ogóle wyszedł z etapu budowania, czy trasy API nie zostały przykryte przez
# fallback SPA i czy bundle, do którego odsyła `index.html`, faktycznie się
# ładuje. Wszystkie trzy da się zepsuć bez naruszenia jednej linijki logiki
# aplikacji — pustym `dist/` w obrazie, kolejnością `app.use(...)`
# w `server/index.js`, zmianą `base` w `vite.config.js` — więc nic w repozytorium
# ich nie złapie.
#
# Użycie:
#   deploy/smoke.sh                          # domyślnie http://localhost:3001
#   deploy/smoke.sh http://100.64.0.1:3001   # adres w VPN
#
# Kod wyjścia 0 znaczy „stos odpowiada poprawnie".

set -uo pipefail

base="${1:-http://localhost:3001}"
base="${base%/}"

failures=0

# Jedno wywołanie curla na sprawdzenie: interesuje nas status i typ treści, a nie
# sama treść. `--max-time` jest po to, żeby zawieszony serwer dał wynik
# negatywny zamiast wisieć w CI albo w cronie.
probe() {
  local name="$1" path="$2" expected_status="$3" expected_type="$4"
  local response status type

  response="$(curl --silent --show-error --max-time 20 \
    --output /dev/null \
    --write-out '%{http_code} %{content_type}' \
    "${base}${path}" 2>&1)" || {
    printf '  ✗ %-42s %s\n' "$name" "curl: $response"
    failures=$((failures + 1))
    return
  }

  status="${response%% *}"
  type="${response#* }"

  if [ "$status" != "$expected_status" ]; then
    printf '  ✗ %-42s status %s, oczekiwano %s\n' "$name" "$status" "$expected_status"
    failures=$((failures + 1))
    return
  fi

  case "$type" in
    *"$expected_type"*) printf '  ✓ %-42s %s %s\n' "$name" "$status" "$type" ;;
    *)
      printf '  ✗ %-42s typ %s, oczekiwano %s\n' "$name" "$type" "$expected_type"
      failures=$((failures + 1))
      ;;
  esac
}

echo "Sprawdzam ${base}"

# 1. Serwer wstał. `/api/health` jest tańszy niż cokolwiek, co dotyka bazy.
probe 'Health (/api/health)' '/api/health' 200 'application/json'

# 2. Baza powstała i odpowiada danymi. `/api/plans` czyta z SQLite, więc zielony
#    punkt tutaj znaczy, że wolumen `./data` jest zamontowany i zapisywalny —
#    a to najczęstsza awaria wdrożenia, której `/api/health` nie widzi.
probe 'Plany (/api/plans)' '/api/plans' 200 'application/json'

# 3. Frontend wyszedł z etapu budowania i jest serwowany.
probe 'Strona (/)' '/' 200 'text/html'

# 4. Ścieżka routera. SPA obsługuje ją w przeglądarce, więc serwer musi oddać
#    `index.html`, a nie 404 — inaczej odświeżenie strony planu wywala aplikację.
probe 'Trasa routera (/plany)' '/plany' 200 'text/html'

# 5. Nieznana trasa API ma dać **404**, a nie `index.html` ze statusem 200.
#    Fallback SPA jest wykluczony regexem `^(?!\/api\/)` i to jedyne sprawdzenie,
#    które zauważy, że ktoś ten regex uprościł: przy przykryciu `/api` frontend
#    zamiast błędu dostawałby własny HTML w odpowiedzi na każde zapytanie.
probe 'Nieznana trasa API (/api/…)' '/api/nie-ma-takiej' 404 ''

# 6. Bundle, do którego odsyła strona, faktycznie się ładuje. Przy pustym `dist/`
#    albo rozjeździe `base` w Vite wszystkie poprzednie punkty są zielone,
#    `index.html` przychodzi z kodem 200, a przeglądarka pokazuje biały ekran —
#    bo pod adresem skryptu dostaje HTML zamiast JavaScriptu.
origin="$(printf '%s' "$base" | sed -E 's#^(https?://[^/]+).*#\1#')"
bundle="$(curl --silent --show-error --max-time 20 "${base}/" \
  | grep -o 'src="[^"]*\.js"' | head -1 | cut -d'"' -f2)"

if [ -z "$bundle" ]; then
  printf '  ✗ %-42s w index.html nie ma odwołania do bundla\n' 'Bundle aplikacji'
  failures=$((failures + 1))
else
  case "$bundle" in
    /*) bundle_url="${origin}${bundle}" ;;
    *)  bundle_url="${base}/${bundle}" ;;
  esac

  bundle_response="$(curl --silent --show-error --max-time 20 --output /dev/null \
    --write-out '%{http_code} %{content_type}' "$bundle_url" 2>&1)"

  case "$bundle_response" in
    200*javascript*)
      printf '  ✓ %-42s %s\n' "Bundle aplikacji (${bundle})" "$bundle_response"
      ;;
    *)
      printf '  ✗ %-42s %s\n' "Bundle aplikacji (${bundle})" "$bundle_response"
      printf '      %s\n' \
        "Strona odsyła do ${bundle_url}, a stamtąd nie przychodzi JavaScript." \
        "Zwykle znaczy to pusty katalog dist/ w obrazie albo zmienione 'base'" \
        "w vite.config.js."
      failures=$((failures + 1))
      ;;
  esac
fi

echo
if [ "$failures" -eq 0 ]; then
  echo "Stos odpowiada poprawnie."
  exit 0
fi

echo "Nieudanych sprawdzeń: ${failures}" >&2
exit 1
