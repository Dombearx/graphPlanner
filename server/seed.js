import { db } from './db.js';
import { createPlan, createNode, createEdge, getPlan, savePositions } from './store.js';
import { autoLayout } from '../shared/layout.js';

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

  const add = (title, description, target) =>
    createNode(plan.id, { title, description, target_count: target }).nodeId;

  const analiza = add('Analiza wymagań', 'Spisać zakres wydania i podzielić na zadania.', 1);
  const projekt = add('Projekt interfejsu', 'Makiety kluczowych ekranów.', 3);
  const api = add('Backend: API', 'Endpointy REST wraz z walidacją.', 5);
  const front = add('Frontend: widoki', 'Implementacja ekranów na bazie makiet.', 8);
  const testy = add('Testy', 'Scenariusze e2e dla ścieżek krytycznych.', 10);
  const wydanie = add('Wydanie', 'Deploy na serwer produkcyjny.', 1);

  createEdge(plan.id, analiza, projekt);
  createEdge(plan.id, analiza, api);
  createEdge(plan.id, projekt, front);
  createEdge(plan.id, api, front);
  createEdge(plan.id, front, testy);
  createEdge(plan.id, testy, wydanie);

  // Ten sam układ, jaki daje przycisk „Auto-układ” - bez ręcznie wpisywanych
  // współrzędnych, które mogłyby rozjechać się z rozmiarem węzła.
  const full = getPlan(plan.id);
  savePositions(plan.id, autoLayout(full.nodes, full.edges));

  console.log('Utworzono przykładowy plan.');
}
