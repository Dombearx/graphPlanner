import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  MarkerType,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import TaskNode from './TaskNode.jsx';
import TvPad from './TvPad.jsx';
import { Icon, STATUS_COLOR, STATUS_LABEL } from './ui.jsx';
import { autoLayout } from '../../../shared/layout.js';
import {
  TV_PAN_STEP,
  TV_READABLE_ZOOM,
  TV_ZOOM_STEP,
  clampViewport,
  showsAnyTask,
  taskCenter,
  taskInDirection,
  taskNearestTo,
  tasksBounds,
} from '../lib/tvNav.js';

const nodeTypes = { task: TaskNode };

const MIN_ZOOM = 0.08;
const MAX_ZOOM = 2.5;

// Pilot bywa opisany różnie w zależności od przeglądarki telewizyjnej,
// więc łapiemy wszystkie sensowne warianty tej samej akcji.
const DIR_KEYS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};
const ZOOM_IN_KEYS = new Set(['+', '=', 'Add', 'PageUp', 'ChannelUp']);
const ZOOM_OUT_KEYS = new Set(['-', '_', 'Subtract', 'PageDown', 'ChannelDown']);
const FIT_KEYS = new Set(['0', 'f', 'F', 'Home']);
// Część przeglądarek telewizyjnych podaje tylko stary `keyCode` dla krzyżaka.
const DIR_CODES = { 37: 'left', 38: 'up', 39: 'right', 40: 'down' };

const remoteDirection = (e) => DIR_KEYS[e.key] || DIR_CODES[e.keyCode];

/** Środek płótna we współrzędnych ekranu – punkt odniesienia dla nawigacji. */
function centerOfPane(el) {
  const rect = el?.getBoundingClientRect();
  if (!rect) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// Bez ograniczenia maxZoom mały graf (2-3 zadania) zostałby rozdmuchany
// na cały ekran; na telewizorze pozwalamy powiększyć trochę mocniej.
const fitOptions = (tv) => ({ padding: 0.16, duration: 400, maxZoom: tv ? 1.5 : 1.1 });

export default function GraphCanvas({
  plan,
  me,
  editing,
  hideCompleted,
  setHideCompleted,
  selectedId,
  onSelect,
  onNodeDoubleClick,
  onQuickAdd,
  onAddTask,
  onMovePositions,
  onConnectTasks,
  onDeleteEdge,
  onDeleteTask,
  showMiniMap,
  tv,
}) {
  const [rfNodes, setRfNodes, onNodesChange] = useNodesState([]);
  const [rfEdges, setRfEdges, onEdgesChange] = useEdgesState([]);
  const dragging = useRef(false);
  const flow = useReactFlow();
  const fittedFor = useRef(null);
  const paneRef = useRef(null);
  // Nawigacja pilotem czyta bieżący wybór z refa, żeby obsługa klawiszy
  // nie przepinała się przy każdym przeskoku między zadaniami.
  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;

  const visibleTasks = useMemo(
    () => plan.nodes.filter((n) => !(hideCompleted && n.status === 'done')),
    [plan.nodes, hideCompleted]
  );

  useEffect(() => {
    if (dragging.current) return;
    const visibleIds = new Set(visibleTasks.map((n) => n.id));
    setRfNodes(
      visibleTasks.map((task) => ({
        id: task.id,
        type: 'task',
        position: { x: task.x, y: task.y },
        selected: task.id === selectedId,
        draggable: editing,
        data: { task, me, editing, onQuickAdd, dim: !editing && task.status === 'done' },
      }))
    );
    setRfEdges(
      plan.edges
        .filter((e) => visibleIds.has(e.source_id) && visibleIds.has(e.target_id))
        .map((e) => {
          const source = plan.nodes.find((n) => n.id === e.source_id);
          const satisfied = source && source.status === 'done';
          return {
            id: e.id,
            source: e.source_id,
            target: e.target_id,
            type: 'smoothstep',
            className: satisfied ? 'satisfied' : '',
            markerEnd: {
              type: MarkerType.ArrowClosed,
              width: 16,
              height: 16,
              color: satisfied ? 'var(--success)' : 'var(--border-strong)',
            },
          };
        })
    );
  }, [visibleTasks, plan.edges, plan.nodes, me, editing, selectedId, onQuickAdd, setRfNodes, setRfEdges]);

  // Dopasowanie widoku przy pierwszym wejściu w dany plan.
  useEffect(() => {
    if (fittedFor.current === plan.id || rfNodes.length === 0) return;
    fittedFor.current = plan.id;
    const t = setTimeout(() => flow.fitView(fitOptions(tv)), 60);
    return () => clearTimeout(t);
  }, [plan.id, rfNodes.length, flow, tv]);

  // Wejście i wyjście z trybu TV mocno zmienia rozmiar płótna - dopasowujemy ponownie.
  useEffect(() => {
    const t = setTimeout(() => flow.fitView(fitOptions(tv)), 220);
    return () => clearTimeout(t);
  }, [tv, flow]);

  const handleDragStop = useCallback(() => {
    dragging.current = false;
    const positions = flow.getNodes().map((n) => ({ id: n.id, x: n.position.x, y: n.position.y }));
    onMovePositions(positions);
  }, [flow, onMovePositions]);

  const handleAutoLayout = useCallback(() => {
    const positions = autoLayout(plan.nodes, plan.edges);
    onMovePositions(positions);
    setTimeout(() => flow.fitView(fitOptions(tv)), 120);
  }, [plan.nodes, plan.edges, onMovePositions, flow, tv]);

  const handleAddTask = useCallback(() => {
    const { x, y, zoom } = flow.getViewport();
    const rect = { w: window.innerWidth, h: window.innerHeight };
    const center = { x: (-x + rect.w / 2) / zoom - 130, y: (-y + rect.h / 2) / zoom - 66 };
    // lekkie rozsunięcie, żeby nowe zadania nie lądowały jedno na drugim
    const jitter = plan.nodes.length % 5;
    onAddTask({ x: Math.round(center.x + jitter * 24), y: Math.round(center.y + jitter * 24) });
  }, [flow, onAddTask, plan.nodes.length]);

  const fitAll = useCallback(() => flow.fitView(fitOptions(tv)), [flow, tv]);

  const paneSize = useCallback(() => {
    const rect = paneRef.current?.getBoundingClientRect();
    return {
      w: rect?.width || window.innerWidth,
      h: rect?.height || window.innerHeight,
    };
  }, []);

  /** Zoom trzymający środek ekranu w miejscu - inaczej obraz „ucieka” przy każdym kroku. */
  const zoomByStep = useCallback(
    (factor) => {
      const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, flow.getZoom() * factor));
      flow.zoomTo(next, { duration: 200 });
    },
    [flow]
  );

  const panByStep = useCallback(
    (dir) => {
      const { x, y, zoom } = flow.getViewport();
      const size = paneSize();
      const dx = dir === 'left' ? size.w * TV_PAN_STEP : dir === 'right' ? -size.w * TV_PAN_STEP : 0;
      const dy = dir === 'up' ? size.h * TV_PAN_STEP : dir === 'down' ? -size.h * TV_PAN_STEP : 0;
      const next = clampViewport({ x: x + dx, y: y + dy, zoom }, tasksBounds(visibleTasks), size);
      // Nie zamieniamy widoku z zadaniami na pusty kawałek płótna - na skraju
      // grafu strzałka po prostu nic nie robi, zamiast wywozić widza w pustkę.
      const current = { x, y, zoom };
      if (!showsAnyTask(next, visibleTasks, size) && showsAnyTask(current, visibleTasks, size)) return;
      flow.setViewport(next, { duration: 240 });
    },
    [flow, paneSize, visibleTasks]
  );

  const focusTask = useCallback(
    (task) => {
      const { x, y } = taskCenter(task);
      // Raz przybliżonego widoku nie oddalamy - zoom wybrany przez oglądającego wygrywa.
      const zoom = Math.max(flow.getZoom(), TV_READABLE_ZOOM);
      flow.setCenter(x, y, { zoom, duration: 320 });
    },
    [flow]
  );

  /**
   * Krzyżak pilota: przeskok na sąsiednie zadanie i wycentrowanie go w czytelnym
   * powiększeniu. Gdy w danym kierunku nie ma już zadania, przesuwamy płótno -
   * dzięki temu strzałki działają też na pustym obszarze grafu.
   */
  const stepTo = useCallback(
    (dir) => {
      if (visibleTasks.length === 0) {
        panByStep(dir);
        return;
      }
      const current = visibleTasks.some((t) => t.id === selectedRef.current)
        ? selectedRef.current
        : null;
      const next = current
        ? taskInDirection(visibleTasks, current, dir)
        : taskNearestTo(visibleTasks, flow.screenToFlowPosition(centerOfPane(paneRef.current)));
      if (!next) {
        panByStep(dir);
        return;
      }
      onSelect(next.id);
      focusTask(next);
    },
    [visibleTasks, flow, onSelect, focusTask, panByStep]
  );

  // Pilot wysyła zwykłe zdarzenia klawiatury; przechwytujemy je w fazie
  // przechwytywania, żeby przeglądarka nie przesunęła w tym czasie fokusu
  // na przyciski interfejsu.
  useEffect(() => {
    if (!tv) return undefined;
    const onKeyDown = (e) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;

      const dir = remoteDirection(e);
      if (dir) {
        e.preventDefault();
        stepTo(dir);
      } else if (ZOOM_IN_KEYS.has(e.key)) {
        e.preventDefault();
        zoomByStep(TV_ZOOM_STEP);
      } else if (ZOOM_OUT_KEYS.has(e.key)) {
        e.preventDefault();
        zoomByStep(1 / TV_ZOOM_STEP);
      } else if (FIT_KEYS.has(e.key)) {
        e.preventDefault();
        fitAll();
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [tv, stepTo, zoomByStep, fitAll]);

  const handleConnect = useCallback(
    (params) => onConnectTasks(params.source, params.target),
    [onConnectTasks]
  );

  return (
    <>
      <div className="toolbar">
        {editing ? (
          <>
            <button className="btn primary small" onClick={handleAddTask}>
              <Icon name="plus" size={14} /> Zadanie
            </button>
            <button className="btn small" onClick={handleAutoLayout} title="Ułóż graf automatycznie">
              <Icon name="layout" size={14} /> Auto-układ
            </button>
            <div className="divider" />
            <button
              className="btn small danger"
              disabled={!selectedId}
              onClick={() => selectedId && onDeleteTask(selectedId)}
            >
              <Icon name="trash" size={14} /> Usuń
            </button>
            <span className="hint toolbar-hint">
              Przeciągnij kropkę z prawej krawędzi zadania na lewą krawędź kolejnego, aby dodać
              zależność. Kliknij strzałkę, aby ją usunąć.
            </span>
          </>
        ) : (
          <>
            <button
              className="btn small"
              onClick={fitAll}
              title="Dopasuj widok do grafu"
            >
              <Icon name="fit" size={14} /> Dopasuj
            </button>
            <button
              className={`btn small ${hideCompleted ? 'active' : ''}`}
              onClick={() => setHideCompleted(!hideCompleted)}
              title="Ukryj zadania już ukończone"
            >
              <Icon name={hideCompleted ? 'eyeOff' : 'eye'} size={14} />
              {hideCompleted ? 'Ukończone ukryte' : 'Ukryj ukończone'}
            </button>
          </>
        )}
      </div>

      <ReactFlow
        ref={paneRef}
        className={editing ? 'editing' : ''}
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStart={() => {
          dragging.current = true;
        }}
        onNodeDragStop={handleDragStop}
        onConnect={handleConnect}
        onEdgeClick={(e, edge) => editing && onDeleteEdge(edge.id)}
        onNodeClick={(e, node) => onSelect(node.id)}
        onNodeDoubleClick={(e, node) => editing && onNodeDoubleClick(node.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={editing}
        nodesConnectable={editing}
        elementsSelectable
        deleteKeyCode={null}
        zoomOnDoubleClick={!editing}
        /* Na telewizorze kółko myszy jest emulowane przez pilota i zoom „pod kursorem”
           skacze razem z nim. Przewijanie przesuwa więc płótno, a przybliżanie
           zostaje na przyciskach i klawiszach, gdzie środek ekranu stoi w miejscu. */
        zoomOnScroll={!tv}
        panOnScroll={tv}
        panOnScrollSpeed={0.8}
        /* Strzałki obsługujemy sami (skok między zadaniami), więc wyłączamy
           wbudowaną nawigację klawiaturą React Flow, żeby się nie dublowały. */
        disableKeyboardA11y={tv}
        minZoom={MIN_ZOOM}
        maxZoom={MAX_ZOOM}
        proOptions={{ hideAttribution: true }}
        fitView
        fitViewOptions={fitOptions(tv)}
      >
        <Background variant={BackgroundVariant.Dots} gap={26} size={1.4} color="var(--border)" />
        {!tv && <Controls showInteractive={false} position="bottom-right" />}
        {showMiniMap && !tv && (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            style={{ width: 168, height: 108, marginBottom: 92 }}
            nodeColor={(n) => STATUS_COLOR[n.data.task.status]}
            nodeStrokeWidth={0}
            maskColor="rgba(0,0,0,0.35)"
          />
        )}
      </ReactFlow>

      {tv && (
        <TvPad
          onStep={stepTo}
          onZoomIn={() => zoomByStep(TV_ZOOM_STEP)}
          onZoomOut={() => zoomByStep(1 / TV_ZOOM_STEP)}
          onFit={fitAll}
        />
      )}

      <div className="legend">
        {['available', 'in_progress', 'done', 'locked'].map((s) => (
          <span className="item" key={s}>
            <span className="dot" style={{ background: STATUS_COLOR[s] }} />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </div>
    </>
  );
}
