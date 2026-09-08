import { db, now, uid } from './db.js';

/* ---------- helpers ---------- */

export class ApiError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const isDone = (node) => node.done_count >= node.target_count;

/**
 * Zadanie jest odblokowane, gdy wszyscy jego poprzednicy są ukończeni.
 * Ta sama reguła liczona jest po stronie serwera, żeby klient nie mógł
 * obejść blokady przypisania ani licznika.
 */
export function computeStatuses(nodes, edges, assignments = new Map()) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const incoming = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) {
    if (incoming.has(e.target_id)) incoming.get(e.target_id).push(e.source_id);
  }
  const statuses = new Map();
  for (const node of nodes) {
    const deps = incoming.get(node.id) || [];
    const blockedBy = deps.filter((id) => {
      const dep = byId.get(id);
      return dep && !isDone(dep);
    });
    const hasWorker = (assignments.get(node.id) || []).length > 0;
    let status;
    if (isDone(node)) status = 'done';
    else if (blockedBy.length > 0) status = 'locked';
    else if (node.done_count > 0 || hasWorker) status = 'in_progress';
    else status = 'available';
    statuses.set(node.id, { status, blockedBy });
  }
  return statuses;
}

/* ---------- odczyt ---------- */

const selectNodes = db.prepare('SELECT * FROM nodes WHERE plan_id = ? ORDER BY created_at');
const selectEdges = db.prepare('SELECT * FROM edges WHERE plan_id = ?');
const selectPlan = db.prepare('SELECT * FROM plans WHERE id = ?');

function assignmentsFor(planId) {
  const rows = db
    .prepare(
      `SELECT a.node_id, a.person FROM assignments a
       JOIN nodes n ON n.id = a.node_id
       WHERE n.plan_id = ? ORDER BY a.created_at`
    )
    .all(planId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.node_id)) map.set(r.node_id, []);
    map.get(r.node_id).push(r.person);
  }
  return map;
}

function contributionsFor(planId) {
  const rows = db
    .prepare(
      `SELECT c.node_id, c.person, SUM(c.amount) AS amount FROM contributions c
       JOIN nodes n ON n.id = c.node_id
       WHERE n.plan_id = ?
       GROUP BY c.node_id, c.person
       HAVING SUM(c.amount) > 0
       ORDER BY amount DESC`
    )
    .all(planId);
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.node_id)) map.set(r.node_id, []);
    map.get(r.node_id).push({ person: r.person, amount: r.amount });
  }
  return map;
}

function summarize(nodes, statuses) {
  let targetSum = 0;
  let doneSum = 0;
  const counts = { done: 0, available: 0, in_progress: 0, locked: 0 };
  for (const n of nodes) {
    targetSum += n.target_count;
    doneSum += Math.min(n.done_count, n.target_count);
    counts[statuses.get(n.id).status]++;
  }
  return {
    nodeCount: nodes.length,
    ...counts,
    unitsTotal: targetSum,
    unitsDone: doneSum,
    percent: targetSum === 0 ? 0 : Math.round((doneSum / targetSum) * 100),
    complete: nodes.length > 0 && counts.done === nodes.length,
  };
}

export function getPlan(planId) {
  const plan = selectPlan.get(planId);
  if (!plan) throw new ApiError(404, 'Nie znaleziono planu');
  const nodes = selectNodes.all(planId);
  const edges = selectEdges.all(planId);
  const assignments = assignmentsFor(planId);
  const statuses = computeStatuses(nodes, edges, assignments);
  const contributions = contributionsFor(planId);

  return {
    ...plan,
    archived: !!plan.archived,
    summary: summarize(nodes, statuses),
    nodes: nodes.map((n) => ({
      ...n,
      status: statuses.get(n.id).status,
      blockedBy: statuses.get(n.id).blockedBy,
      assignees: assignments.get(n.id) || [],
      contributions: contributions.get(n.id) || [],
    })),
    edges,
  };
}

export function listPlans() {
  const plans = db.prepare('SELECT * FROM plans ORDER BY updated_at DESC').all();
  return plans.map((plan) => {
    const nodes = selectNodes.all(plan.id);
    const edges = selectEdges.all(plan.id);
    const assignments = assignmentsFor(plan.id);
    const statuses = computeStatuses(nodes, edges, assignments);
    return { ...plan, archived: !!plan.archived, summary: summarize(nodes, statuses) };
  });
}

/* ---------- plany ---------- */

const touchPlan = (planId) =>
  db.prepare('UPDATE plans SET updated_at = ? WHERE id = ?').run(now(), planId);

export function createPlan({ name, description = '' }) {
  const clean = String(name || '').trim();
  if (!clean) throw new ApiError(400, 'Nazwa planu jest wymagana');
  const id = uid();
  const ts = now();
  db.prepare(
    'INSERT INTO plans (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, clean, String(description || ''), ts, ts);
  return getPlan(id);
}

export function updatePlan(planId, patch) {
  const plan = selectPlan.get(planId);
  if (!plan) throw new ApiError(404, 'Nie znaleziono planu');
  const name = patch.name !== undefined ? String(patch.name).trim() : plan.name;
  if (!name) throw new ApiError(400, 'Nazwa planu jest wymagana');
  const description =
    patch.description !== undefined ? String(patch.description) : plan.description;
  const archived = patch.archived !== undefined ? (patch.archived ? 1 : 0) : plan.archived;
  const archivedAt = archived ? plan.archived_at || now() : null;
  db.prepare(
    'UPDATE plans SET name = ?, description = ?, archived = ?, archived_at = ?, updated_at = ? WHERE id = ?'
  ).run(name, description, archived, archivedAt, now(), planId);
  return getPlan(planId);
}

export function deletePlan(planId) {
  const res = db.prepare('DELETE FROM plans WHERE id = ?').run(planId);
  if (res.changes === 0) throw new ApiError(404, 'Nie znaleziono planu');
}

export const duplicatePlan = db.transaction((planId, newName) => {
  const source = getPlan(planId);
  const id = uid();
  const ts = now();
  db.prepare(
    'INSERT INTO plans (id, name, description, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, newName || `${source.name} (kopia)`, source.description, ts, ts);

  const idMap = new Map();
  const insertNode = db.prepare(
    `INSERT INTO nodes (id, plan_id, title, description, target_count, done_count, x, y, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  );
  for (const n of source.nodes) {
    const newId = uid();
    idMap.set(n.id, newId);
    insertNode.run(newId, id, n.title, n.description, n.target_count, n.x, n.y, ts);
  }
  const insertEdge = db.prepare(
    'INSERT INTO edges (id, plan_id, source_id, target_id) VALUES (?, ?, ?, ?)'
  );
  for (const e of source.edges) {
    insertEdge.run(uid(), id, idMap.get(e.source_id), idMap.get(e.target_id));
  }
  return getPlan(id);
});

/* ---------- zadania ---------- */

function requireNode(nodeId) {
  const node = db.prepare('SELECT * FROM nodes WHERE id = ?').get(nodeId);
  if (!node) throw new ApiError(404, 'Nie znaleziono zadania');
  return node;
}

function statusOf(node) {
  const nodes = selectNodes.all(node.plan_id);
  const edges = selectEdges.all(node.plan_id);
  return computeStatuses(nodes, edges).get(node.id).status;
}

function normalizeTarget(value, fallback = 1) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) throw new ApiError(400, 'Licznik musi być liczbą >= 1');
  return Math.min(n, 100000);
}

export function createNode(planId, body) {
  if (!selectPlan.get(planId)) throw new ApiError(404, 'Nie znaleziono planu');
  const title = String(body.title || '').trim() || 'Nowe zadanie';
  const id = uid();
  db.prepare(
    `INSERT INTO nodes (id, plan_id, title, description, target_count, done_count, x, y, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)`
  ).run(
    id,
    planId,
    title,
    String(body.description || ''),
    normalizeTarget(body.target_count),
    Number(body.x) || 0,
    Number(body.y) || 0,
    now()
  );
  touchPlan(planId);
  return { plan: getPlan(planId), nodeId: id };
}

export function updateNode(nodeId, patch) {
  const node = requireNode(nodeId);
  const title = patch.title !== undefined ? String(patch.title).trim() : node.title;
  if (!title) throw new ApiError(400, 'Tytuł zadania jest wymagany');
  const description =
    patch.description !== undefined ? String(patch.description) : node.description;
  const target = normalizeTarget(patch.target_count, node.target_count);
  const x = patch.x !== undefined ? Number(patch.x) : node.x;
  const y = patch.y !== undefined ? Number(patch.y) : node.y;
  const doneCount = Math.min(node.done_count, target);
  const completedAt = doneCount >= target ? node.completed_at || now() : null;
  db.prepare(
    `UPDATE nodes SET title = ?, description = ?, target_count = ?, done_count = ?,
     x = ?, y = ?, completed_at = ? WHERE id = ?`
  ).run(title, description, target, doneCount, x, y, completedAt, nodeId);
  touchPlan(node.plan_id);
  return getPlan(node.plan_id);
}

export function deleteNode(nodeId) {
  const node = requireNode(nodeId);
  db.prepare('DELETE FROM nodes WHERE id = ?').run(nodeId);
  touchPlan(node.plan_id);
  return getPlan(node.plan_id);
}

export const savePositions = db.transaction((planId, positions) => {
  const stmt = db.prepare('UPDATE nodes SET x = ?, y = ? WHERE id = ? AND plan_id = ?');
  for (const p of positions) stmt.run(Number(p.x) || 0, Number(p.y) || 0, p.id, planId);
  touchPlan(planId);
  return getPlan(planId);
});

/* ---------- licznik i przypisania ---------- */

export function changeCount(nodeId, { amount, person }) {
  const node = requireNode(nodeId);
  const delta = Math.floor(Number(amount));
  if (!Number.isFinite(delta) || delta === 0) throw new ApiError(400, 'Nieprawidłowa wartość');
  const who = String(person || '').trim();
  if (!who) throw new ApiError(400, 'Podaj swoje imię');

  if (delta > 0 && statusOf(node) === 'locked') {
    throw new ApiError(409, 'Zadanie jest zablokowane przez nieukończone zależności');
  }

  const next = Math.max(0, Math.min(node.target_count, node.done_count + delta));
  if (next === node.done_count) {
    return getPlan(node.plan_id);
  }
  const applied = next - node.done_count;
  const completedAt = next >= node.target_count ? node.completed_at || now() : null;
  db.prepare('UPDATE nodes SET done_count = ?, completed_at = ? WHERE id = ?').run(
    next,
    completedAt,
    nodeId
  );
  db.prepare(
    'INSERT INTO contributions (node_id, person, amount, created_at) VALUES (?, ?, ?, ?)'
  ).run(nodeId, who, applied, now());
  touchPlan(node.plan_id);
  return getPlan(node.plan_id);
}

export function setAssignment(nodeId, person, assigned) {
  const node = requireNode(nodeId);
  const who = String(person || '').trim();
  if (!who) throw new ApiError(400, 'Podaj swoje imię');
  if (assigned) {
    if (statusOf(node) === 'locked') {
      throw new ApiError(409, 'Nie można przypisać się do zablokowanego zadania');
    }
    db.prepare(
      'INSERT OR IGNORE INTO assignments (node_id, person, created_at) VALUES (?, ?, ?)'
    ).run(nodeId, who, now());
  } else {
    db.prepare('DELETE FROM assignments WHERE node_id = ? AND person = ?').run(nodeId, who);
  }
  touchPlan(node.plan_id);
  return getPlan(node.plan_id);
}

/* ---------- zależności ---------- */

function wouldCreateCycle(planId, sourceId, targetId) {
  if (sourceId === targetId) return true;
  const edges = selectEdges.all(planId);
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, []);
    adj.get(e.source_id).push(e.target_id);
  }
  // Czy z targetId da się już dojść do sourceId? Jeśli tak, nowa krawędź zamknie cykl.
  const stack = [targetId];
  const seen = new Set();
  while (stack.length) {
    const cur = stack.pop();
    if (cur === sourceId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    for (const next of adj.get(cur) || []) stack.push(next);
  }
  return false;
}

export function createEdge(planId, sourceId, targetId) {
  const source = requireNode(sourceId);
  const target = requireNode(targetId);
  if (source.plan_id !== planId || target.plan_id !== planId) {
    throw new ApiError(400, 'Zadania należą do innego planu');
  }
  if (wouldCreateCycle(planId, sourceId, targetId)) {
    throw new ApiError(409, 'Taka zależność utworzyłaby cykl');
  }
  db.prepare(
    'INSERT OR IGNORE INTO edges (id, plan_id, source_id, target_id) VALUES (?, ?, ?, ?)'
  ).run(uid(), planId, sourceId, targetId);
  touchPlan(planId);
  return getPlan(planId);
}

export function deleteEdge(edgeId) {
  const edge = db.prepare('SELECT * FROM edges WHERE id = ?').get(edgeId);
  if (!edge) throw new ApiError(404, 'Nie znaleziono zależności');
  db.prepare('DELETE FROM edges WHERE id = ?').run(edgeId);
  touchPlan(edge.plan_id);
  return getPlan(edge.plan_id);
}

/* ---------- osoby ---------- */

export function listPeople() {
  const rows = db
    .prepare(
      `SELECT person FROM assignments
       UNION SELECT person FROM contributions`
    )
    .all();
  return rows.map((r) => r.person).sort((a, b) => a.localeCompare(b, 'pl'));
}
