import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Avatar, Icon } from './ui.jsx';

/**
 * Węzeł zadania na grafie. Wygląd niesie cały stan: kolor obramowania to
 * status, pasek to postęp licznika, awatary to osoby przypisane.
 */
function TaskNode({ data, selected }) {
  const { task, me, editing, dim, onQuickAdd } = data;
  const { status, done_count: done, target_count: target } = task;
  const percent = target > 0 ? Math.round((done / target) * 100) : 0;
  const locked = status === 'locked';
  const isDone = status === 'done';
  const mine = task.assignees.includes(me);

  return (
    <div
      className={`task-node ${status} ${selected ? 'selected' : ''} ${dim ? 'dim' : ''}`}
      title={locked ? 'Zablokowane – najpierw ukończ zadania poprzedzające' : task.title}
    >
      <Handle type="target" position={Position.Left} isConnectable={editing} />

      <div className="tn-head">
        <div className="tn-title">{task.title}</div>
        <span className="tn-badge">
          {isDone ? <Icon name="check" size={16} /> : locked ? <Icon name="lock" size={14} /> : null}
        </span>
      </div>

      {task.description && <p className="tn-desc">{task.description}</p>}

      {target > 1 && (
        <div className="tn-progress">
          <span style={{ width: `${percent}%` }} />
        </div>
      )}

      <div className="tn-foot">
        {target > 1 && (
          <span className="tn-count">
            {done}/{target}
          </span>
        )}
        {task.assignees.length > 0 && (
          <div className="tn-people">
            {task.assignees.slice(0, 4).map((p) => (
              <Avatar key={p} name={p} size="sm" mine={p === me} />
            ))}
            {task.assignees.length > 4 && (
              <span className="tn-count" style={{ marginLeft: 4 }}>
                +{task.assignees.length - 4}
              </span>
            )}
          </div>
        )}
        {!editing && !locked && !isDone && (
          <button
            className="tn-plus"
            title={target > 1 ? 'Dodaj jedną sztukę' : 'Oznacz jako ukończone'}
            onClick={(e) => {
              e.stopPropagation();
              onQuickAdd(task);
            }}
          >
            {target > 1 ? '+1' : <Icon name="check" size={14} />}
          </button>
        )}
        {!editing && locked && (
          <span className="tn-lock">
            <Icon name="lock" size={11} /> {task.blockedBy.length}
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Right} isConnectable={editing} />
    </div>
  );
}

export default memo(TaskNode);
