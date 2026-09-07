import { useState } from 'react';
import { Icon } from './ui.jsx';

/** Pierwsze wejście: podanie imienia. Bez logowania – tylko podpis pod zadaniami. */
export default function NameGate({ onSubmit }) {
  const [name, setName] = useState('');
  const clean = name.trim();

  return (
    <div className="gate">
      <form
        className="gate-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (clean) onSubmit(clean);
        }}
      >
        <div className="gate-logo">
          <Icon name="graph" size={22} />
        </div>
        <h1>Jak masz na imię?</h1>
        <p>
          Imię pojawi się przy zadaniach, do których się przypiszesz. Bez haseł i kont – możesz je
          zmienić w każdej chwili.
        </p>
        <div className="field">
          <input
            className="input"
            autoFocus
            maxLength={40}
            placeholder="np. Ania"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <button className="btn primary" style={{ width: '100%' }} disabled={!clean} type="submit">
          Zaczynamy
        </button>
      </form>
    </div>
  );
}
