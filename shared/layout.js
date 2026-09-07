import dagre from 'dagre';

/**
 * Wymiary węzła w jednostkach grafu. MUSZĄ odpowiadać regule `.task-node`
 * w client/src/styles.css - pozycje zadań są zapisane w bazie w tych
 * jednostkach, więc zmiana rozmiaru w CSS bez zmiany tych stałych zaciska
 * odstępy i strzałki zaczynają się zawijać.
 *
 * Wysokość jest stała dla wszystkich zadań (najwyższy możliwy układ treści:
 * dwuwierszowy tytuł, dwuwierszowy opis, pasek postępu i stopka). Dzięki temu
 * uchwyty krawędzi wypadają na tej samej wysokości i strzałka między zadaniami
 * w jednym rzędzie jest prosta, zamiast robić kilkupikselowy schodek.
 */
export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 148;

/** Automatyczny układ grafu od lewej do prawej – kolejne „fale” zależności. */
export function autoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  // ranksep to odstęp między kolumnami w pikselach grafu. Musi być na tyle
  // duży, żeby strzałka między kolumnami zdążyła się wygiąć w pionie -
  // przy ciasnym odstępie krawędzie zawijają się i wyglądają jak cofnięte.
  g.setGraph({ rankdir: 'LR', nodesep: 56, ranksep: 140, marginx: 40, marginy: 40 });

  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    if (g.hasNode(e.source_id) && g.hasNode(e.target_id)) g.setEdge(e.source_id, e.target_id);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return {
      id: n.id,
      x: Math.round(pos.x - NODE_WIDTH / 2),
      y: Math.round(pos.y - NODE_HEIGHT / 2),
    };
  });
}
