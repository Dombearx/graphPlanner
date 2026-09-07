import { useCallback, useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { ReactFlowProvider } from '@xyflow/react';
import GraphCanvas from './GraphCanvas.jsx';
import ListView from './ListView.jsx';
import TaskDetails from './TaskDetails.jsx';
import { Icon, ProgressRing } from './ui.jsx';
import { api } from '../lib/api.js';
import { usePlan, useLocalSetting, useMediaQuery } from '../lib/hooks.js';

export default function PlanView({ me, onOpenMenu, tv, setTv, onError, error }) {
  const { planId } = useParams();
  const [params, setParams] = useSearchParams();
  const { plan, setPlan, loading, error: loadError } = usePlan(planId);

  const isPhone = useMediaQuery('(max-width: 900px)');
  const [view, setView] = useLocalSetting('graphplanner.view', null);
  const [hideCompleted, setHideCompleted] = useLocalSetting('graphplanner.hideCompleted', false);
  const [selectedId, setSelectedId] = useState(null);
  const editing = params.get('edit') === '1';

  const setEditing = useCallback(
    (on) => {
      const next = new URLSearchParams(params);
      if (on) next.set('edit', '1');
      else next.delete('edit');
      setParams(next, { replace: true });
    },
    [params, setParams]
  );

  useEffect(() => setSelectedId(null), [planId]);
  useEffect(() => {
    if (editing && tv) setTv(false);
  }, [editing, tv, setTv]);

  // Na telefonie domyślnie lista („co mogę teraz zrobić”), na dużym ekranie graf.
  // Edycja zawsze odbywa się na grafie.
  const chosenView = view ?? (isPhone ? 'list' : 'graph');
  const effectiveView = editing ? 'graph' : chosenView;

  const call = useCallback(
    async (fn) => {
      try {
        const updated = await fn();
        if (updated && updated.id === planId) setPlan(updated);
        return updated;
      } catch (err) {
        onError(err.message);
        return null;
      }
    },
    [planId, setPlan, onError]
  );

  const changeCount = useCallback(
    (nodeId, amount) => call(() => api.changeCount(nodeId, amount, me)),
    [call, me]
  );
  const assign = useCallback(
    (nodeId, assigned) => call(() => api.setAssignment(nodeId, me, assigned)),
    [call, me]
  );
  const quickAdd = useCallback((task) => changeCount(task.id, 1), [changeCount]);
  const movePositions = useCallback(
    (positions) => call(() => api.savePositions(planId, positions)),
    [call, planId]
  );
  const connectTasks = useCallback(
    (source, target) => call(() => api.createEdge(planId, source, target)),
    [call, planId]
  );
  const addTask = useCallback(
    async ({ x, y }) => {
      const updated = await call(() => api.createNode(planId, { title: 'Nowe zadanie', x, y }));
      if (updated?.createdNodeId) setSelectedId(updated.createdNodeId);
    },
    [call, planId]
  );
  const updateTask = useCallback((nodeId, patch) => call(() => api.updateNode(nodeId, patch)), [call]);
  const deleteTask = useCallback(
    async (nodeId) => {
      await call(() => api.deleteNode(nodeId));
      setSelectedId(null);
    },
    [call]
  );
  const deleteEdge = useCallback((edgeId) => call(() => api.deleteEdge(edgeId)), [call]);

  if (loadError) {
    return (
      <div className="plans-page">
        <p className="empty-note">Nie udało się wczytać planu: {loadError}</p>
      </div>
    );
  }
  if (loading || !plan) {
    return (
      <div className="plans-page">
        <p className="empty-note">Wczytywanie…</p>
      </div>
    );
  }

  const s = plan.summary;
  const selected = plan.nodes.find((n) => n.id === selectedId) || null;

  return (
    <>
      <header className="topbar">
        {isPhone && !tv && (
          <button className="btn ghost icon" onClick={onOpenMenu} aria-label="Menu">
            <Icon name="menu" size={18} />
          </button>
        )}

        {tv ? (
          <>
            <ProgressRing percent={s.percent} />
            <div className="topbar-title" style={{ flex: 1, marginLeft: 8 }}>
              <h1>{plan.name}</h1>
              {plan.description && <div className="sub">{plan.description}</div>}
            </div>
            <div className="tv-stats">
              <div className="tv-stat success">
                <div className="value">{s.done}</div>
                <div className="label">gotowe</div>
              </div>
              <div className="tv-stat accent">
                <div className="value">{s.available + s.in_progress}</div>
                <div className="label">dostępne</div>
              </div>
              <div className="tv-stat">
                <div className="value">{s.locked}</div>
                <div className="label">zablokowane</div>
              </div>
              <div className="tv-stat warn">
                <div className="value">
                  {s.unitsDone}/{s.unitsTotal}
                </div>
                <div className="label">sztuk</div>
              </div>
            </div>
            <button className="btn ghost icon" onClick={() => setTv(false)} title="Wyjdź z trybu TV">
              <Icon name="close" size={18} />
            </button>
          </>
        ) : (
          <>
            <div className="topbar-title" style={{ flex: 1 }}>
              <h1>{plan.name}</h1>
              <div className="sub">
                {s.done}/{s.nodeCount} zadań · {s.available + s.in_progress} do wzięcia
                {plan.archived ? ' · w archiwum' : ''}
              </div>
            </div>

            <div className={`progress-pill ${s.percent >= 100 ? 'full' : ''}`}>
              <span className="bar">
                <span style={{ width: `${s.percent}%` }} />
              </span>
              <span className="pct">{s.percent}%</span>
            </div>

            {!editing && (
              <div className="seg">
                <button className={chosenView === 'graph' ? 'on' : ''} onClick={() => setView('graph')}>
                  <Icon name="graph" size={13} /> {isPhone ? '' : 'Graf'}
                </button>
                <button className={chosenView === 'list' ? 'on' : ''} onClick={() => setView('list')}>
                  <Icon name="list" size={13} /> {isPhone ? '' : 'Lista'}
                </button>
              </div>
            )}

            <button
              className={`btn ${editing ? 'active' : ''} ${isPhone ? 'icon' : ''}`}
              onClick={() => setEditing(!editing)}
              title={editing ? 'Zakończ edycję' : 'Edytuj graf'}
            >
              <Icon name={editing ? 'check' : 'edit'} size={15} />
              {!isPhone && (editing ? 'Zakończ edycję' : 'Edytuj')}
            </button>

            {!isPhone && (
              <button className="btn icon" onClick={() => setTv(true)} title="Tryb TV / prezentacji">
                <Icon name="tv" size={16} />
              </button>
            )}
          </>
        )}
      </header>

      <div className="content">
        <div className="canvas-wrap">
          {error && (
            <div className="banner err">
              <Icon name="info" size={15} /> {error}
            </div>
          )}
          {!error && s.complete && !plan.archived && !editing && (
            <div className="banner ok">
              <Icon name="checkCircle" size={16} />
              Cały plan ukończony.
              <button
                className="btn small"
                onClick={() => call(() => api.updatePlan(plan.id, { archived: true }))}
              >
                <Icon name="archive" size={13} /> Przenieś do archiwum
              </button>
            </div>
          )}

          {effectiveView === 'graph' ? (
            <ReactFlowProvider>
              <GraphCanvas
                plan={plan}
                me={me}
                editing={editing}
                tv={tv}
                hideCompleted={hideCompleted}
                setHideCompleted={setHideCompleted}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onQuickAdd={quickAdd}
                onAddTask={addTask}
                onMovePositions={movePositions}
                onConnectTasks={connectTasks}
                onDeleteEdge={deleteEdge}
                onDeleteTask={deleteTask}
                showMiniMap={!isPhone && plan.nodes.length > 6}
              />
            </ReactFlowProvider>
          ) : (
            <ListView
              plan={plan}
              me={me}
              onChangeCount={changeCount}
              onAssign={assign}
              onSelect={setSelectedId}
            />
          )}
        </div>

        {selected && !tv && (
          <TaskDetails
            task={selected}
            plan={plan}
            me={me}
            editing={editing}
            onClose={() => setSelectedId(null)}
            onChangeCount={changeCount}
            onAssign={assign}
            onUpdate={updateTask}
            onDelete={deleteTask}
            onSelect={setSelectedId}
            onDeleteEdge={deleteEdge}
          />
        )}
      </div>
    </>
  );
}
