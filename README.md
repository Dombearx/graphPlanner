# GraphPlanner

Planer zadań w formie grafu zależności. Zadania (węzły) łączą się strzałkami: dopóki
poprzednicy nie są ukończeni, zadanie jest wyszarzone i zablokowane. Kiedy wszystko,
czego wymaga, jest gotowe – można się do niego przypisać i zbijać licznik.

Aplikacja jest przeznaczona do sieci wewnętrznej: **bez logowania i haseł**. Każdy podaje
tylko imię, żeby było wiadomo, kto się czym zajmuje.

## Co potrafi

- **Graf na cały ekran** – dowolne przybliżanie, przesuwanie, minimapa.
- **Statusy liczone na serwerze** – „do wzięcia”, „w trakcie”, „ukończone”, „zablokowane”.
  Blokady są egzekwowane po stronie API, nie tylko w interfejsie.
- **Liczniki sztuk** – zadanie może wymagać np. 10 sztuk; każdy dokłada `+1`, a aplikacja
  pamięta, kto ile zrobił.
- **Wiele osób na jednym zadaniu** – przypisania są wspólne i widoczne dla wszystkich.
- **Wiele planów** – osobny panel do tworzenia, edycji, kopiowania i archiwizowania grafów.
- **Edytor grafu** – dodawanie zadań, przeciąganie, automatyczny układ (dagre), zależności
  przeciągane myszą, ochrona przed cyklami.
- **Archiwum** – ukończone plany chowają się do osobnej sekcji; ukończone zadania można
  ukryć jednym przełącznikiem, zachowując strukturę grafu.
- **Synchronizacja na żywo (SSE)** – zmiana zrobiona na telefonie od razu widoczna na
  telewizorze, bez odświeżania strony.
- **Widok listy na telefonie** – „co mogę teraz zrobić”, z przyciskami „Biorę” i `+1`.
- **Tryb TV** – duży nagłówek z procentem ukończenia i licznikami, bez paneli bocznych.
- **Motyw jasny i ciemny.**

## Uruchomienie

### Docker (zalecane w sieci wewnętrznej)

```bash
docker compose up -d --build
```

Aplikacja: `http://<adres-serwera>:3001`. Baza SQLite ląduje w `./data` na hoście.

### Bez dockera

```bash
npm ci
npm run build     # buduje frontend do dist/
npm start         # serwer + gotowy frontend na porcie 3001
```

### Tryb deweloperski

```bash
npm run dev       # Vite (5173) + serwer API (3001) z auto-restartem
```

Frontend chodzi wtedy pod `http://localhost:5173` i proxuje `/api` na port 3001.

## Konfiguracja

| Zmienna    | Domyślnie        | Znaczenie                                        |
| ---------- | ---------------- | ------------------------------------------------ |
| `PORT`     | `3001`           | Port serwera HTTP.                               |
| `DATA_DIR` | `./data`         | Katalog z plikiem `graphplanner.sqlite`.         |
| `SEED`     | (włączony)       | `SEED=0` wyłącza tworzenie przykładowego planu.  |

## Jak to działa

**Status zadania** wyliczany jest z grafu przy każdym odczycie:

- `done` – licznik osiągnął wartość docelową,
- `locked` – co najmniej jeden poprzednik nie jest jeszcze `done`,
- `in_progress` – licznik ruszył, ale nie jest pełny,
- `available` – gotowe do wzięcia.

Serwer odrzuca próbę przypisania się do zablokowanego zadania i zwiększenia jego licznika
(HTTP 409), więc stan pozostaje spójny nawet przy równoczesnej pracy wielu osób.
Zmniejszanie licznika jest zawsze dozwolone – pomyłki da się cofnąć.

**Zależności** tworzy się przeciągnięciem z prawej krawędzi jednego zadania na lewą krawędź
kolejnego. Cykle są blokowane (HTTP 409), więc graf zawsze da się ułożyć od lewej do prawej.

**Postęp planu** liczony jest w sztukach, nie w zadaniach: zadanie „10 sztuk” waży dziesięć
razy więcej niż zadanie pojedyncze.

## Skróty w interfejsie

- Kliknięcie węzła otwiera panel szczegółów (na telefonie – od dołu ekranu).
- `+1` bezpośrednio na węźle zbija licznik bez otwierania panelu.
- Przycisk z ikoną telewizora włącza tryb prezentacji; `?tv=1` w adresie startuje w nim od razu.
- W trybie edycji kliknięcie strzałki usuwa zależność.

## API

Wszystkie mutacje zwracają pełny, przeliczony plan i rozgłaszają go przez SSE.

| Metoda   | Ścieżka                     | Opis                                    |
| -------- | --------------------------- | --------------------------------------- |
| `GET`    | `/api/plans`                | Lista planów ze statystykami.           |
| `POST`   | `/api/plans`                | Nowy plan.                              |
| `GET`    | `/api/plans/:id`            | Plan z zadaniami i zależnościami.       |
| `PATCH`  | `/api/plans/:id`            | Nazwa, opis, archiwizacja.              |
| `DELETE` | `/api/plans/:id`            | Usunięcie planu wraz z zawartością.     |
| `POST`   | `/api/plans/:id/duplicate`  | Kopia planu z wyzerowanymi licznikami.  |
| `POST`   | `/api/plans/:id/nodes`      | Nowe zadanie.                           |
| `PATCH`  | `/api/nodes/:id`            | Tytuł, opis, licznik docelowy, pozycja. |
| `DELETE` | `/api/nodes/:id`            | Usunięcie zadania.                      |
| `POST`   | `/api/nodes/:id/count`      | `{ amount, person }` – zmiana licznika. |
| `POST`   | `/api/nodes/:id/assign`     | `{ person, assigned }` – przypisanie.   |
| `POST`   | `/api/plans/:id/positions`  | Zapis pozycji po przesunięciu/układzie. |
| `POST`   | `/api/plans/:id/edges`      | `{ source, target }` – nowa zależność.  |
| `DELETE` | `/api/edges/:id`            | Usunięcie zależności.                   |
| `GET`    | `/api/events`               | Strumień SSE ze zmianami.               |
| `GET`    | `/api/health`               | Health check.                            |

## Kopia zapasowa

Cały stan to jeden plik SQLite. Przy zatrzymanym kontenerze wystarczy:

```bash
cp data/graphplanner.sqlite kopie/graphplanner-$(date +%F).sqlite
```

Na działającej instancji bezpieczniej użyć `sqlite3 data/graphplanner.sqlite ".backup kopia.sqlite"`
(baza pracuje w trybie WAL).

## Struktura projektu

```
server/          API (Express + better-sqlite3)
  db.js          połączenie i schemat bazy
  store.js       logika domenowa: statusy, blokady, cykle
  index.js       trasy HTTP i rozgłaszanie SSE
  seed.js        przykładowy plan przy pierwszym starcie
client/src/      frontend (React + React Flow)
  components/    widoki: graf, lista, panel szczegółów, panel planów
  lib/           API, SSE, hooki, tożsamość użytkownika
shared/          kod wspólny dla serwera i przeglądarki
  layout.js      automatyczny układ grafu (dagre) + wymiary węzła
```

> Wymiary węzła są zdefiniowane raz, w `shared/layout.js`, i muszą odpowiadać
> regule `.task-node` w `client/src/styles.css`. Pozycje zadań zapisywane są
> w bazie w jednostkach grafu, więc zmiana szerokości węzła tylko w CSS zaciska
> odstępy między kolumnami i strzałki zaczynają się zawijać.
