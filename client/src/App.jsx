import { useCallback, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar.jsx';
import NameGate from './components/NameGate.jsx';
import PlansPage from './components/PlansPage.jsx';
import PlanView from './components/PlanView.jsx';
import { Icon, Modal } from './components/ui.jsx';
import { useIdentity } from './lib/identity.js';
import { usePlans, useConnection, useLocalSetting } from './lib/hooks.js';

function HomeRedirect({ plans, loading }) {
  if (loading) return <div className="plans-page"><p className="empty-note">Wczytywanie…</p></div>;
  const first = plans.find((p) => !p.archived) || plans[0];
  return <Navigate to={first ? `/plan/${first.id}` : '/plany'} replace />;
}

export default function App() {
  const { person, setPerson } = useIdentity();
  const { plans, loading, reload } = usePlans();
  const connected = useConnection();
  const location = useLocation();

  const [theme, setTheme] = useLocalSetting('graphplanner.theme', 'dark');
  const [drawer, setDrawer] = useState(false);
  const [tv, setTv] = useState(() => new URLSearchParams(window.location.search).get('tv') === '1');
  const [nameDialog, setNameDialog] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => setDrawer(false), [location.pathname]);

  const showError = useCallback((message) => {
    setError(message);
    setTimeout(() => setError((cur) => (cur === message ? null : cur)), 5000);
  }, []);

  if (!person) return <NameGate onSubmit={setPerson} />;

  const openNameDialog = () => {
    setNameDraft(person);
    setNameDialog(true);
  };

  return (
    <div className={`app ${tv ? 'tv' : ''}`}>
      {!tv && (
        <>
          <Sidebar
            plans={plans}
            me={person}
            open={drawer}
            onClose={() => setDrawer(false)}
            onEditName={openNameDialog}
            theme={theme}
            onToggleTheme={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          />
          {drawer && <div className="drawer-backdrop" onClick={() => setDrawer(false)} />}
        </>
      )}

      <main className="main">
        {!connected && (
          <div className="banner err" style={{ top: 8 }}>
            <span className="offline-dot" /> Brak połączenia z serwerem – zmiany innych osób mogą nie
            być widoczne.
          </div>
        )}

        <Routes>
          <Route path="/" element={<HomeRedirect plans={plans} loading={loading} />} />
          <Route
            path="/plany"
            element={
              <>
                <header className="topbar">
                  <button className="btn ghost icon hide-desktop" onClick={() => setDrawer(true)} aria-label="Menu">
                    <Icon name="menu" size={18} />
                  </button>
                  <div className="topbar-title" style={{ flex: 1 }}>
                    <h1>Wszystkie plany</h1>
                    <div className="sub">Twórz, edytuj i archiwizuj grafy zadań</div>
                  </div>
                </header>
                <div className="content" style={{ display: 'block', overflowY: 'auto' }}>
                  <PlansPage plans={plans} reload={reload} onError={showError} />
                </div>
              </>
            }
          />
          <Route
            path="/plan/:planId"
            element={
              <PlanView
                me={person}
                onOpenMenu={() => setDrawer(true)}
                tv={tv}
                setTv={setTv}
                onError={showError}
                error={error}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {nameDialog && (
        <Modal
          title="Twoje imię"
          onClose={() => setNameDialog(false)}
          footer={
            <>
              <button className="btn" onClick={() => setNameDialog(false)}>
                Anuluj
              </button>
              <button
                className="btn primary"
                disabled={!nameDraft.trim()}
                onClick={() => {
                  setPerson(nameDraft);
                  setNameDialog(false);
                }}
              >
                Zapisz
              </button>
            </>
          }
        >
          <div className="field">
            <label htmlFor="name-input">Imię widoczne przy zadaniach</label>
            <input
              id="name-input"
              className="input"
              autoFocus
              maxLength={40}
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && nameDraft.trim()) {
                  setPerson(nameDraft);
                  setNameDialog(false);
                }
              }}
            />
            <span className="hint">
              Zmiana imienia nie przenosi dotychczasowych przypisań – wpisy pod starym imieniem
              zostają przy zadaniach.
            </span>
          </div>
        </Modal>
      )}
    </div>
  );
}
