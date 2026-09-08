import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { ApiError, listPlans, getPlan, createPlan, updatePlan, deletePlan, duplicatePlan,
  createNode, updateNode, deleteNode, savePositions, changeCount, setAssignment,
  createEdge, deleteEdge, listPeople } from './store.js';
import { seedIfEmpty } from './seed.js';

const PORT = Number(process.env.PORT) || 3001;
const app = express();
app.use(express.json({ limit: '1mb' }));

/* ---------- SSE: każda zmiana rozgłaszana do wszystkich otwartych kart ---------- */

const clients = new Set();

function broadcast(event, payload) {
  const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const res of clients) {
    try {
      res.write(data);
    } catch {
      clients.delete(res);
    }
  }
}

app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
});

/** Zwraca plan i rozgłasza go pozostałym klientom. */
function respondPlan(res, plan) {
  broadcast('plan', plan);
  res.json(plan);
}

const wrap = (fn) => (req, res, next) => {
  try {
    fn(req, res, next);
  } catch (err) {
    next(err);
  }
};

/* ---------- plany ---------- */

app.get('/api/plans', wrap((req, res) => res.json(listPlans())));

app.post('/api/plans', wrap((req, res) => {
  const plan = createPlan(req.body || {});
  broadcast('plans', {});
  res.status(201).json(plan);
}));

app.get('/api/plans/:id', wrap((req, res) => res.json(getPlan(req.params.id))));

app.patch('/api/plans/:id', wrap((req, res) => respondPlan(res, updatePlan(req.params.id, req.body || {}))));

app.delete('/api/plans/:id', wrap((req, res) => {
  deletePlan(req.params.id);
  broadcast('plans', {});
  res.status(204).end();
}));

app.post('/api/plans/:id/duplicate', wrap((req, res) => {
  const plan = duplicatePlan(req.params.id, (req.body || {}).name);
  broadcast('plans', {});
  res.status(201).json(plan);
}));

/* ---------- zadania ---------- */

app.post('/api/plans/:id/nodes', wrap((req, res) => {
  const { plan, nodeId } = createNode(req.params.id, req.body || {});
  broadcast('plan', plan);
  res.status(201).json({ ...plan, createdNodeId: nodeId });
}));

app.patch('/api/nodes/:id', wrap((req, res) => respondPlan(res, updateNode(req.params.id, req.body || {}))));

app.delete('/api/nodes/:id', wrap((req, res) => respondPlan(res, deleteNode(req.params.id))));

app.post('/api/plans/:id/positions', wrap((req, res) =>
  respondPlan(res, savePositions(req.params.id, (req.body || {}).positions || []))));

app.post('/api/nodes/:id/count', wrap((req, res) => {
  const { amount, person } = req.body || {};
  respondPlan(res, changeCount(req.params.id, { amount, person }));
}));

app.post('/api/nodes/:id/assign', wrap((req, res) => {
  const { person, assigned } = req.body || {};
  respondPlan(res, setAssignment(req.params.id, person, assigned !== false));
}));

/* ---------- zależności ---------- */

app.post('/api/plans/:id/edges', wrap((req, res) => {
  const { source, target } = req.body || {};
  respondPlan(res, createEdge(req.params.id, source, target));
}));

app.delete('/api/edges/:id', wrap((req, res) => respondPlan(res, deleteEdge(req.params.id))));

/* ---------- osoby ---------- */

app.get('/api/people', wrap((req, res) => res.json(listPeople())));

/* ---------- health check (dla dockera i monitoringu) ---------- */

app.get('/api/health', (req, res) => res.json({ ok: true, clients: clients.size }));

/* ---------- frontend ---------- */

const distDir = path.join(process.cwd(), 'dist');
if (fs.existsSync(distDir)) {
  // Assety Vite mają hash w nazwie (bezpieczne do cache'owania na zawsze),
  // ale index.html nie — musi się zawsze odświeżać, inaczej karta otwarta
  // w trakcie wdrożenia zostaje z odniesieniami do usuniętych już plików
  // i dostaje "disallowed MIME type" zamiast JS-a.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (path.basename(filePath) === 'index.html') {
          res.setHeader('Cache-Control', 'no-cache');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      },
    })
  );
  app.get(/^(?!\/api\/).*/, (req, res) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(path.join(distDir, 'index.html'));
  });
}

/* ---------- błędy ---------- */

app.use((err, req, res, next) => {
  if (err instanceof ApiError) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Błąd serwera' });
});

seedIfEmpty();

app.listen(PORT, '0.0.0.0', () => {
  console.log(`GraphPlanner nasłuchuje na http://0.0.0.0:${PORT}`);
});
