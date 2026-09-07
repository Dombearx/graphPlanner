#!/usr/bin/env node
/**
 * Wejście do kontenera: ustawia właściciela katalogu z bazą i dopiero wtedy
 * uruchamia serwer jako `node`.
 *
 * Katalog `/data` przychodzi z hosta jako bind mount (`./data:/data`
 * w `docker-compose.yml`), a dockerd tworzy go **rootem**, kiedy jeszcze nie
 * istnieje — czyli przy pierwszym `docker compose up` na świeżej maszynie.
 * `chown` z `Dockerfile` nic tu nie pomaga: montowanie przykrywa katalog
 * z obrazu razem z jego właścicielem. Bez tego pliku pierwszy start kończy się
 *
 *   SqliteError: unable to open database file  (SQLITE_CANTOPEN)
 *
 * i to niezależnie od tego, jak zdrowy jest kod aplikacji.
 *
 * Zrzucenie uprawnień robi `spawn` z opcjami `uid`/`gid`, a nie `gosu` czy
 * `setpriv`: jedyne, na co można liczyć w obrazie na pewno, to node, który
 * i tak jest tu uruchamiany.
 */

import { chownSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { constants } from 'node:os';
import { spawn } from 'node:child_process';

// Użytkownik `node` w obrazach `node:*` ma stałe 1000:1000.
const NODE_UID = 1000;
const NODE_GID = 1000;

const dataDir = process.env.DATA_DIR || '/data';
const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;

if (asRoot) {
  mkdirSync(dataDir, { recursive: true });
  // Razem z zawartością: baza mogła zostać po starszym uruchomieniu, w którym
  // serwer chodził jako root — sam katalog wystarczy do założenia nowego pliku,
  // ale nie do zapisu w istniejącym.
  chownSync(dataDir, NODE_UID, NODE_GID);
  for (const entry of readdirSync(dataDir)) {
    chownSync(join(dataDir, entry), NODE_UID, NODE_GID);
  }
}

const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('entrypoint: nie podano polecenia do uruchomienia');
  process.exit(64);
}

const child = spawn(command, args, {
  stdio: 'inherit',
  ...(asRoot ? { uid: NODE_UID, gid: NODE_GID } : {}),
});

// PID 1 nie dostaje domyślnej obsługi sygnałów, więc bez tego `docker compose
// down` czekałby pełne 10 sekund i dobijał kontener SIGKILL-em — czyli SQLite
// zostawałby z nieodtworzonym WAL-em po każdym wdrożeniu.
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => child.kill(signal));
}

child.on('exit', (code, signal) => {
  process.exit(signal ? 128 + (constants.signals[signal] || 0) : code);
});

child.on('error', (err) => {
  console.error(`entrypoint: nie udało się uruchomić "${command}":`, err.message);
  process.exit(126);
});
