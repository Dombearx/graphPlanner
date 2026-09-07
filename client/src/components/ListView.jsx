import { useState } from 'react';
import { Avatar, Icon } from './ui.jsx';

const GROUPS = [
  { key: 'ready', label: 'Możesz zrobić teraz', match: (t) => t.status === 'available' || t.status === 'in_progress' },
  { key: 'locked', label: 'Czeka na zależności', match: (t) => t.status === 'locked' },
  { key: 'done', label: 'Ukończone', match: (t) => t.status === 'done', collapsible: true },
];

/**
 * Widok listy – szybka odpowiedź na pytanie „co mogę teraz wykonać”.
 * Domyślny na telefonie, dostępny też na desktopie.
 */
export default function ListView({ plan, me, onChangeCount, onAssign, onSelect }) {
  const [openDone, setOpenDone] = useState(false);

  return (
    <div className="list-view">
      {GROUPS.map((group) => {
        const tasks = plan.nodes.filter(group.match);
        if (tasks.length === 0) return null;
        const collapsed = group.collapsible && !openDone;
        return (
          <section key={group.key}>
            <h3 className="group-title">
              {group.collapsible ? (
                <button
                  className="btn ghost small"
                  style={{ padding: 0, letterSpacing: 'inherit', textTransform: 'inherit', fontSize: 'inherit', color: 'inherit', fontWeight: 700 }}
                  onClick={() => setOpenDone((v) => !v)}
                >
                  <Icon name={collapsed ? 'chevronRight' : 'chevronDown'} size={13} />
                  {group.label} ({tasks.length})
                </button>
              ) : (
                <>
                  {group.label} ({tasks.length})
                </>
              )}
            </h3>
            {!collapsed &&
              tasks.map((task) => {
                const mine = task.assignees.includes(me);
                const locked = task.status === 'locked';
                const isDone = task.status === 'done';
                return (
                  <article className={`task-card ${task.status}`} key={task.id}>
                    <h4>{task.title}</h4>
                    {task.description && <p className="desc">{task.description}</p>}
                    {task.target_count > 1 && (
                      <div className="tn-progress" style={{ marginTop: 9 }}>
                        <span style={{ width: `${Math.round((task.done_count / task.target_count) * 100)}%` }} />
                      </div>
                    )}
                    <div className="card-foot">
                      {task.target_count > 1 && (
                        <span className="tn-count">
                          {task.done_count}/{task.target_count}
                        </span>
                      )}
                      {task.assignees.length > 0 && (
                        <div className="tn-people">
                          {task.assignees.slice(0, 5).map((p) => (
                            <Avatar key={p} name={p} size="sm" mine={p === me} />
                          ))}
                        </div>
                      )}
                      <span className="spacer" />
                      {!locked && !isDone && (
                        <>
                          <button className="btn small" onClick={() => onAssign(task.id, !mine)}>
                            <Icon name="user" size={13} /> {mine ? 'Wypisz' : 'Biorę'}
                          </button>
                          <button className="btn small primary" onClick={() => onChangeCount(task.id, 1)}>
                            {task.target_count > 1 ? '+1' : <Icon name="check" size={14} />}
                          </button>
                        </>
                      )}
                      <button className="btn small ghost" onClick={() => onSelect(task.id)}>
                        Szczegóły
                      </button>
                    </div>
                  </article>
                );
              })}
          </section>
        );
      })}
      {plan.nodes.length === 0 && (
        <p className="empty-note">Ten plan nie ma jeszcze żadnych zadań. Włącz tryb edycji, aby je dodać.</p>
      )}
    </div>
  );
}
