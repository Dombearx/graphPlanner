import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Avatar, Icon } from './ui.jsx';

function PlanRow({ plan, onNavigate }) {
  const pct = plan.summary.percent;
  return (
    <NavLink
      to={`/plan/${plan.id}`}
      className={({ isActive }) => `plan-item ${isActive ? 'active' : ''} ${plan.summary.complete ? 'done' : ''}`}
      onClick={onNavigate}
    >
      <span className="plan-item-title">{plan.name}</span>
      <span className="plan-item-meta">
        <span className={`mini-bar ${pct >= 100 ? 'full' : ''}`}>
          <span style={{ width: `${pct}%` }} />
        </span>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
      </span>
    </NavLink>
  );
}

export default function Sidebar({ plans, me, open, onClose, onEditName, theme, onToggleTheme }) {
  const [showArchive, setShowArchive] = useState(false);
  const active = plans.filter((p) => !p.archived);
  const archived = plans.filter((p) => p.archived);

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-head">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="graph" size={17} />
          </span>
          GraphPlanner
        </div>
        <span className="spacer" />
        <button className="btn ghost icon" onClick={onToggleTheme} title="Zmień motyw">
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </button>
      </div>

      <div className="sidebar-scroll">
        <NavLink
          to="/plany"
          className={({ isActive }) => `plan-item ${isActive ? 'active' : ''}`}
          onClick={onClose}
          style={{ display: 'flex', alignItems: 'center', gap: 9, fontWeight: 600 }}
        >
          <Icon name="layout" size={15} /> Wszystkie plany
        </NavLink>

        <div className="section-label">
          Aktywne <span className="count">{active.length}</span>
        </div>
        {active.length === 0 && <p className="empty-note">Brak aktywnych planów.</p>}
        {active.map((plan) => (
          <PlanRow key={plan.id} plan={plan} onNavigate={onClose} />
        ))}

        {archived.length > 0 && (
          <>
            <button className="section-label section-toggle" onClick={() => setShowArchive((v) => !v)}>
              <Icon name={showArchive ? 'chevronDown' : 'chevronRight'} size={12} />
              Archiwum <span className="count">{archived.length}</span>
            </button>
            {showArchive && archived.map((plan) => <PlanRow key={plan.id} plan={plan} onNavigate={onClose} />)}
          </>
        )}
      </div>

      <div className="sidebar-foot">
        <button className="me-chip" onClick={onEditName} title="Zmień imię">
          <Avatar name={me} mine />
          <span style={{ minWidth: 0 }}>
            <span className="me-chip-name" style={{ display: 'block' }}>{me}</span>
            <span className="me-chip-sub">Zmień imię</span>
          </span>
          <span className="spacer" />
          <Icon name="edit" size={13} />
        </button>
      </div>
    </aside>
  );
}
