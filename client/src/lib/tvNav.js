import { NODE_HEIGHT, NODE_WIDTH } from '../../../shared/layout.js';

/**
 * Nawigacja grafem pilotem (tryb TV).
 *
 * Na telewizorze nie ma myszy ani gestów - jest krzyżak, czasem emulowany
 * kursor. Dlatego zamiast swobodnego przesuwania płótna skaczemy między
 * zadaniami: strzałka wybiera sąsiada w danym kierunku, a widok sam
 * centruje się na nim w powiększeniu, w którym tekst da się przeczytać
 * z kanapy.
 */

/** Poniżej tego przybliżenia tekst na węźle jest z odległości nieczytelny. */
export const TV_READABLE_ZOOM = 1.45;

/** Krok przycisków i klawiszy +/-. */
export const TV_ZOOM_STEP = 1.3;

/** Przesunięcie płótna (ułamek ekranu), gdy w danym kierunku nie ma już zadania. */
export const TV_PAN_STEP = 0.55;

/** Tyle jednostek grafu (szerokość węzła) musi zostać na ekranie przy przesuwaniu. */
const KEEP_VISIBLE = NODE_WIDTH;

export function taskCenter(task) {
  return { x: task.x + NODE_WIDTH / 2, y: task.y + NODE_HEIGHT / 2 };
}

// Odległość „w kierunku” patrzenia i „w bok” od niego.
const ALONG = {
  right: (d) => d.x,
  left: (d) => -d.x,
  down: (d) => d.y,
  up: (d) => -d.y,
};
const ASIDE = {
  right: (d) => Math.abs(d.y),
  left: (d) => Math.abs(d.y),
  down: (d) => Math.abs(d.x),
  up: (d) => Math.abs(d.x),
};

/**
 * Najbliższe zadanie w danym kierunku od `fromId`. Kandydaci odchyleni mocno
 * w bok są odrzucani (inaczej strzałka w górę potrafi skoczyć na drugi koniec
 * grafu), a z pozostałych wygrywa ten najbliżej osi patrzenia.
 */
export function taskInDirection(tasks, fromId, dir) {
  const from = tasks.find((t) => t.id === fromId);
  if (!from) return null;
  const a = taskCenter(from);

  let best = null;
  let bestScore = Infinity;
  for (const task of tasks) {
    if (task.id === from.id) continue;
    const b = taskCenter(task);
    const d = { x: b.x - a.x, y: b.y - a.y };
    const along = ALONG[dir](d);
    if (along <= 1) continue; // za nami albo dokładnie w poprzek
    const aside = ASIDE[dir](d);
    if (aside > along * 2 + NODE_WIDTH) continue; // to już nie jest „obok”
    const score = along + aside * 2;
    if (score < bestScore) {
      bestScore = score;
      best = task;
    }
  }
  return best;
}

/** Zadanie najbliżej podanego punktu grafu – punkt startowy nawigacji. */
export function taskNearestTo(tasks, point) {
  let best = null;
  let bestDist = Infinity;
  for (const task of tasks) {
    const c = taskCenter(task);
    const dist = (c.x - point.x) ** 2 + (c.y - point.y) ** 2;
    if (dist < bestDist) {
      bestDist = dist;
      best = task;
    }
  }
  return best;
}

/** Prostokąt obejmujący wszystkie widoczne zadania, w jednostkach grafu. */
export function tasksBounds(tasks) {
  if (tasks.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const t of tasks) {
    minX = Math.min(minX, t.x);
    minY = Math.min(minY, t.y);
    maxX = Math.max(maxX, t.x + NODE_WIDTH);
    maxY = Math.max(maxY, t.y + NODE_HEIGHT);
  }
  return { minX, minY, maxX, maxY };
}

/**
 * Przycina przesunięcie płótna tak, by graf nie zjechał całkiem z ekranu.
 * Bez tego kolejne wciśnięcia strzałki na skraju grafu wywożą oglądającego
 * w pustkę i trzeba szukać drogi powrotnej.
 */
export function clampViewport({ x, y, zoom }, bounds, size) {
  if (!bounds) return { x, y, zoom };
  const limit = (value, min, max, span) => {
    const lo = -(max - KEEP_VISIBLE) * zoom;
    const hi = span - (min + KEEP_VISIBLE) * zoom;
    if (lo > hi) return value; // graf mniejszy niż margines - nie ma czego przycinać
    return Math.min(hi, Math.max(lo, value));
  };
  return {
    zoom,
    x: limit(x, bounds.minX, bounds.maxX, size.w),
    y: limit(y, bounds.minY, bounds.maxY, size.h),
  };
}

/** Czy przy danym ustawieniu płótna widać choć jedno zadanie? */
export function showsAnyTask({ x, y, zoom }, tasks, size) {
  const left = -x / zoom;
  const top = -y / zoom;
  const right = (-x + size.w) / zoom;
  const bottom = (-y + size.h) / zoom;
  return tasks.some(
    (t) =>
      t.x + NODE_WIDTH > left && t.x < right && t.y + NODE_HEIGHT > top && t.y < bottom
  );
}
