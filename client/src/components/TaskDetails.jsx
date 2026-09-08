import { useEffect, useRef, useState } from 'react';
import { Avatar, Icon, STATUS_COLOR, STATUS_LABEL } from './ui.jsx';

export default function TaskDetails({
  task,
  plan,
  me,
  editing,
  onClose,
  onChangeCount,
  onAssign,
  onUpdate,
  onDelete,
  onSelect,
  onDeleteEdge,
  focusTitle,
  onFocusTitleHandled,
}) {
  const [draft, setDraft] = useState({ title: '', description: '', target_count: 1 });
  const titleRef = useRef(null);

  useEffect(() => {
    if (task) {
      setDraft({
        title: task.title,
        description: task.description,
        target_count: task.target_count,
      });
    }
  }, [task?.id, task?.title, task?.description, task?.target_count]);

  useEffect(() => {
    if (!focusTitle) return;
    // Odłożone o klatkę, bo efekt synchronizujący `draft` z `task` (wyżej)
    // potrafi w tym samym cyklu przypisać `input.value` jeszcze raz, co kasuje zaznaczenie.
    const raf = requestAnimationFrame(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
      onFocusTitleHandled?.();
    });
    return () => cancelAnimationFrame(raf);
  }, [focusTitle, onFocusTitleHandled]);

  if (!task) return null;

  const locked = task.status === 'locked';
  const isDone = task.status === 'done';
  const mine = task.assignees.includes(me);
  const remaining = task.target_count - task.done_count;

  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const requires = plan.edges
    .filter((e) => e.target_id === task.id)
    .map((e) => ({ edge: e, node: byId.get(e.source_id) }))
    .filter((x) => x.node);
  const unlocks = plan.edges
    .filter((e) => e.source_id === task.id)
    .map((e) => ({ edge: e, node: byId.get(e.target_id) }))
    .filter((x) => x.node);

  const saveDraft = (patch) => onUpdate(task.id, patch);

  return (
    <aside className="details">
      <div className="details-head">
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 style={{ fontSize: 15, marginBottom: 6, wordBreak: 'break-word' }}>{task.title}</h2>
          <span className={`status-tag ${task.status}`}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[task.status] }} />
            {STATUS_LABEL[task.status]}
          </span>
        </div>
        <button className="btn ghost icon" onClick={onClose} aria-label="Zamknij panel">
          <Icon name="close" />
        </button>
      </div>

      <div className="details-body">
        {editing ? (
          <>
            <div className="field">
              <label htmlFor="td-title">Tytuł</label>
              <input
                id="td-title"
                ref={titleRef}
                className="input"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                onBlur={() => draft.title.trim() && saveDraft({ title: draft.title })}
              />
            </div>
            <div className="field">
              <label htmlFor="td-desc">Opis</label>
              <textarea
                id="td-desc"
                className="textarea"
                value={draft.description}
                placeholder="Co dokładnie trzeba zrobić?"
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                onBlur={() => saveDraft({ description: draft.description })}
              />
            </div>
            <div className="field">
              <label htmlFor="td-target">Ile sztuk do wykonania</label>
              <input
                id="td-target"
                className="input"
                type="number"
                min="1"
                value={draft.target_count}
                onChange={(e) => setDraft({ ...draft, target_count: e.target.value })}
                onBlur={() => saveDraft({ target_count: Number(draft.target_count) || 1 })}
              />
              <span className="hint">1 = zwykłe zadanie „zrobione / niezrobione”.</span>
            </div>

            <div className="card">
              <h3>Wymaga ukończenia ({requires.length})</h3>
              {requires.length === 0 && <span className="hint">Brak – zadanie startowe.</span>}
              {requires.map(({ edge, node }) => (
                <div className="dep-row" key={edge.id}>
                  <span className="dot" style={{ background: STATUS_COLOR[node.status] }} />
                  <span className="name">{node.title}</span>
                  <button
                    className="btn ghost small icon"
                    style={{ marginLeft: 'auto' }}
                    title="Usuń zależność"
                    onClick={() => onDeleteEdge(edge.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
            </div>

            <div className="card">
              <h3>Odblokowuje ({unlocks.length})</h3>
              {unlocks.length === 0 && <span className="hint">Brak – zadanie końcowe.</span>}
              {unlocks.map(({ edge, node }) => (
                <div className="dep-row" key={edge.id}>
                  <span className="dot" style={{ background: STATUS_COLOR[node.status] }} />
                  <span className="name">{node.title}</span>
                  <button
                    className="btn ghost small icon"
                    style={{ marginLeft: 'auto' }}
                    title="Usuń zależność"
                    onClick={() => onDeleteEdge(edge.id)}
                  >
                    <Icon name="close" size={13} />
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            {task.description && (
              <p style={{ marginTop: 0, color: 'var(--text-dim)', whiteSpace: 'pre-wrap' }}>
                {task.description}
              </p>
            )}

            {locked && (
              <div className="card" style={{ borderColor: 'var(--border-strong)' }}>
                <h3>
                  <Icon name="lock" size={13} /> Najpierw trzeba ukończyć
                </h3>
                {task.blockedBy.map((id) => {
                  const dep = byId.get(id);
                  if (!dep) return null;
                  return (
                    <button className="dep-row" key={id} style={{ width: '100%', cursor: 'pointer' }} onClick={() => onSelect(id)}>
                      <span className="dot" style={{ background: STATUS_COLOR[dep.status] }} />
                      <span className="name">{dep.title}</span>
                      <span className="amount" style={{ marginLeft: 'auto', color: 'var(--text-faint)', fontSize: 12 }}>
                        {dep.done_count}/{dep.target_count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="counter-box">
              {task.target_count > 1 ? (
                <>
                  <div className="counter-value">
                    {task.done_count}
                    <small> / {task.target_count}</small>
                  </div>
                  <div className="hint">
                    {isDone ? 'Wszystko zrobione.' : `Zostało ${remaining}.`}
                  </div>
                  <div className="tn-progress" style={{ marginTop: 10 }}>
                    <span style={{ width: `${Math.round((task.done_count / task.target_count) * 100)}%` }} />
                  </div>
                  <div className="counter-actions">
                    <button className="btn" disabled={locked || isDone} onClick={() => onChangeCount(task.id, 1)}>
                      +1
                    </button>
                    <button className="btn" disabled={locked || isDone} onClick={() => onChangeCount(task.id, 5)}>
                      +5
                    </button>
                    <button
                      className="btn success"
                      disabled={locked || isDone}
                      onClick={() => onChangeCount(task.id, remaining)}
                      title="Ustaw licznik na maksimum"
                    >
                      <Icon name="check" size={14} /> Gotowe
                    </button>
                    <button
                      className="btn"
                      disabled={task.done_count === 0}
                      onClick={() => onChangeCount(task.id, -1)}
                      title="Cofnij jedną sztukę"
                    >
                      <Icon name="minus" size={14} />
                    </button>
                  </div>
                </>
              ) : (
                <div className="counter-actions" style={{ marginTop: 0 }}>
                  {isDone ? (
                    <button className="btn" onClick={() => onChangeCount(task.id, -1)}>
                      <Icon name="restore" size={14} /> Cofnij ukończenie
                    </button>
                  ) : (
                    <button className="btn success" disabled={locked} onClick={() => onChangeCount(task.id, 1)}>
                      <Icon name="check" size={15} /> Oznacz jako ukończone
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="card">
              <h3>Kto się tym zajmuje ({task.assignees.length})</h3>
              {task.assignees.length === 0 && <span className="hint">Nikt się jeszcze nie przypisał.</span>}
              {task.assignees.map((p) => (
                <div className="person-row" key={p}>
                  <Avatar name={p} mine={p === me} />
                  <span>{p}</span>
                  {p === me && <span className="amount">to Ty</span>}
                </div>
              ))}
              <button
                className={`btn ${mine ? '' : 'primary'}`}
                style={{ width: '100%', marginTop: 10 }}
                disabled={locked}
                onClick={() => onAssign(task.id, !mine)}
              >
                <Icon name="user" size={14} />
                {mine ? 'Wypisz mnie' : 'Przypisz mnie'}
              </button>
              {locked && <span className="hint">Zadanie zablokowane – nie można się przypisać.</span>}
            </div>

            {task.contributions.length > 0 && (
              <div className="card">
                <h3>Wykonane przez</h3>
                {task.contributions.map((c) => (
                  <div className="person-row" key={c.person}>
                    <Avatar name={c.person} size="sm" mine={c.person === me} />
                    <span>{c.person}</span>
                    <span className="amount">{c.amount} szt.</span>
                  </div>
                ))}
              </div>
            )}

            {(requires.length > 0 || unlocks.length > 0) && (
              <div className="card">
                <h3>Zależności</h3>
                {requires.length > 0 && (
                  <>
                    <div className="hint" style={{ marginBottom: 6 }}>Wymaga:</div>
                    {requires.map(({ edge, node }) => (
                      <button className="dep-row" key={edge.id} style={{ width: '100%', cursor: 'pointer' }} onClick={() => onSelect(node.id)}>
                        <span className="dot" style={{ background: STATUS_COLOR[node.status] }} />
                        <span className="name">{node.title}</span>
                      </button>
                    ))}
                  </>
                )}
                {unlocks.length > 0 && (
                  <>
                    <div className="hint" style={{ margin: '10px 0 6px' }}>Odblokowuje:</div>
                    {unlocks.map(({ edge, node }) => (
                      <button className="dep-row" key={edge.id} style={{ width: '100%', cursor: 'pointer' }} onClick={() => onSelect(node.id)}>
                        <span className="dot" style={{ background: STATUS_COLOR[node.status] }} />
                        <span className="name">{node.title}</span>
                      </button>
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {editing && (
        <div className="details-foot">
          <button className="btn danger" onClick={() => onDelete(task.id)}>
            <Icon name="trash" size={14} /> Usuń zadanie
          </button>
        </div>
      )}
    </aside>
  );
}
