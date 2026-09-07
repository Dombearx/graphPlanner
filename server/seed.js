import { db } from './db.js';
import { createPlan, createNode, createEdge } from './store.js';

/**
 * Przy pierwszym starcie (pusta baza) tworzy przykładowy plan, żeby aplikacja
 * nie witała użytkownika pustym ekranem. Wyłączane przez SEED=0.
 */
export function seedIfEmpty() {
  if (process.env.SEED === '0') return;
  const { count } = db.prepare('SELECT COUNT(*) AS count FROM plans').get();
  if (count > 0) return;

  const plan = createPlan({
    name: 'Przykładowy plan: wydanie wersji 1.0',
    description: 'Usuń ten plan albo przerób go pod siebie – to tylko przykład struktury zależności.',
  });

  const add = (title, description, target, x, y) =>
    createNode(plan.id, { title, description, target_count: target, x, y }).nodeId;

  const analiza = add('Analiza wymagań', 'Spisać zakres wydania i podzielić na zadania.', 1, 0, 0);
  const projekt = add('Projekt interfejsu', 'Makiety kluczowych ekranów.', 3, 320, -140);
  const api = add('Backend: API', 'Endpointy REST wraz z walidacją.', 5, 320, 60);
  const front = add('Frontend: widoki', 'Implementacja ekranów na bazie makiet.', 8, 660, -60);
  const testy = add('Testy', 'Scenariusze e2e dla ścieżek krytycznych.', 10, 1000, -60);
  const wydanie = add('Wydanie', 'Deploy na serwer produkcyjny.', 1, 1340, -60);

  createEdge(plan.id, analiza, projekt);
  createEdge(plan.id, analiza, api);
  createEdge(plan.id, projekt, front);
  createEdge(plan.id, api, front);
  createEdge(plan.id, front, testy);
  createEdge(plan.id, testy, wydanie);

  console.log('Utworzono przykładowy plan.');
}
