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
import { Icon, STATUS_COLOR, STATUS_LABEL } from './ui.jsx';
import { autoLayout } from '../../../shared/layout.js';

const nodeTypes = { task: TaskNode };

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
              onClick={() => flow.fitView(fitOptions(tv))}
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
        minZoom={0.08}
        maxZoom={2.5}
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
