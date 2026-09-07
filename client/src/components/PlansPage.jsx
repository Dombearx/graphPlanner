import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { Icon, Modal, ProgressRing } from './ui.jsx';

function PlanCard({ plan, onOpen, onEdit, onDuplicate, onArchive, onDelete }) {
  const s = plan.summary;
  return (
    <article className={`plan-card ${plan.archived ? 'archived' : ''}`}>
      <div className="plan-card-top">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="plan-card-title">{plan.name}</h3>
          {plan.description && <p className="plan-card-desc">{plan.description}</p>}
        </div>
        <ProgressRing percent={s.percent} size={62} stroke={7} />
      </div>

      <div className="plan-card-stats">
        <span><b>{s.nodeCount}</b> zadań</span>
        <span className="ok"><b>{s.done}</b> gotowych</span>
        <span className="accent"><b>{s.available + s.in_progress}</b> dostępnych</span>
        <span className="muted"><b>{s.locked}</b> zablokowanych</span>
      </div>

      <div className="plan-card-actions">
        <button className="btn small primary" onClick={() => onOpen(plan)}>
          Otwórz
        </button>
        <button className="btn small" onClick={() => onEdit(plan)} title="Zmień nazwę i opis">
          <Icon name="edit" size={13} /> Edytuj
        </button>
        <button className="btn small" onClick={() => onDuplicate(plan)} title="Utwórz kopię ze wyzerowanymi licznikami">
          <Icon name="copy" size={13} /> Kopiuj
        </button>
        <span className="spacer" />
        <button
          className="btn small ghost"
          onClick={() => onArchive(plan, !plan.archived)}
          title={plan.archived ? 'Przywróć do aktywnych' : 'Przenieś do archiwum'}
        >
          <Icon name={plan.archived ? 'restore' : 'archive'} size={13} />
          {plan.archived ? 'Przywróć' : 'Archiwum'}
        </button>
        <button className="btn small danger icon" onClick={() => onDelete(plan)} title="Usuń plan">
          <Icon name="trash" size={13} />
        </button>
      </div>
    </article>
  );
}

export default function PlansPage({ plans, reload, onError }) {
  const navigate = useNavigate();
  const [dialog, setDialog] = useState(null); // {mode:'create'|'edit'|'delete', plan}
  const [form, setForm] = useState({ name: '', description: '' });

  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);

  const run = async (fn) => {
    try {
      await fn();
      await reload();
    } catch (err) {
      onError(err.message);
    }
  };

  const openCreate = () => {
    setForm({ name: '', description: '' });
    setDialog({ mode: 'create' });
  };
  const openEdit = (plan) => {
    setForm({ name: plan.name, description: plan.description });
    setDialog({ mode: 'edit', plan });
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) return;
    if (dialog.mode === 'create') {
      try {
        const plan = await api.createPlan(form);
        await reload();
        setDialog(null);
        navigate(`/plan/${plan.id}?edit=1`);
      } catch (err) {
        onError(err.message);
      }
    } else {
      await run(() => api.updatePlan(dialog.plan.id, form));
      setDialog(null);
    }
  };

  return (
    <div className="plans-page">
      <header className="plans-head">
        <div>
          <p className="hint" style={{ margin: 0 }}>
            Każdy plan to osobny graf zadań. Wybierz plan, aby go otworzyć, albo utwórz nowy.
          </p>
        </div>
        <button className="btn primary" onClick={openCreate}>
          <Icon name="plus" size={15} /> Nowy plan
        </button>
      </header>

      <h2 className="group-title">Aktywne ({active.length})</h2>
      {active.length === 0 && (
        <p className="empty-note">Brak aktywnych planów – zacznij od przycisku „Nowy plan”.</p>
      )}
      <div className="plan-grid">
        {active.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onOpen={(p) => navigate(`/plan/${p.id}`)}
            onEdit={openEdit}
            onDuplicate={(p) => run(() => api.duplicatePlan(p.id))}
            onArchive={(p, archivedNext) => run(() => api.updatePlan(p.id, { archived: archivedNext }))}
            onDelete={(p) => setDialog({ mode: 'delete', plan: p })}
          />
        ))}
      </div>

      {archived.length > 0 && (
        <>
          <h2 className="group-title" style={{ marginTop: 28 }}>
            <Icon name="archive" size={14} /> Archiwum ({archived.length})
          </h2>
          <div className="plan-grid">
            {archived.map((plan) => (
              <PlanCard
                key={plan.id}
                plan={plan}
                onOpen={(p) => navigate(`/plan/${p.id}`)}
                onEdit={openEdit}
                onDuplicate={(p) => run(() => api.duplicatePlan(p.id))}
                onArchive={(p, archivedNext) => run(() => api.updatePlan(p.id, { archived: archivedNext }))}
                onDelete={(p) => setDialog({ mode: 'delete', plan: p })}
              />
            ))}
          </div>
        </>
      )}

      {dialog && dialog.mode !== 'delete' && (
        <Modal
          title={dialog.mode === 'create' ? 'Nowy plan' : 'Edycja planu'}
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDialog(null)}>
                Anuluj
              </button>
              <button className="btn primary" disabled={!form.name.trim()} onClick={submit}>
                {dialog.mode === 'create' ? 'Utwórz i przejdź do edycji' : 'Zapisz'}
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="pf-name">Nazwa</label>
            <input
              id="pf-name"
              className="input"
              autoFocus
              value={form.name}
              placeholder="np. Remont magazynu"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </div>
          <div className="field">
            <label htmlFor="pf-desc">Opis (opcjonalnie)</label>
            <textarea
              id="pf-desc"
              className="textarea"
              value={form.description}
              placeholder="Czego dotyczy ten plan?"
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
        </Modal>
      )}

      {dialog && dialog.mode === 'delete' && (
        <Modal
          title="Usunąć plan?"
          onClose={() => setDialog(null)}
          footer={
            <>
              <button className="btn" onClick={() => setDialog(null)}>
                Anuluj
              </button>
              <button
                className="btn primary"
                style={{ background: 'var(--danger)', borderColor: 'var(--danger)' }}
                onClick={async () => {
                  await run(() => api.deletePlan(dialog.plan.id));
                  setDialog(null);
                }}
              >
                Usuń bezpowrotnie
              </button>
            </>
          }
        >
          <p style={{ margin: 0 }}>
            Plan <b>{dialog.plan.name}</b> zostanie usunięty razem ze wszystkimi zadaniami,
            zależnościami i historią wykonania. Tej operacji nie da się cofnąć – jeśli chcesz tylko
            schować plan, użyj archiwum.
          </p>
        </Modal>
      )}
    </div>
  );
}
