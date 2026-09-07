import dagre from 'dagre';

export const NODE_WIDTH = 260;
export const NODE_HEIGHT = 132;

/** Automatyczny układ grafu od lewej do prawej – kolejne „fale” zależności. */
export function autoLayout(nodes, edges) {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'LR', nodesep: 48, ranksep: 120, marginx: 40, marginy: 40 });

  for (const n of nodes) g.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const e of edges) {
    if (g.hasNode(e.source_id) && g.hasNode(e.target_id)) g.setEdge(e.source_id, e.target_id);
  }
  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { id: n.id, x: Math.round(pos.x - NODE_WIDTH / 2), y: Math.round(pos.y - NODE_HEIGHT / 2) };
  });
}
