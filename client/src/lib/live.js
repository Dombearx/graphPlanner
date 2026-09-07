/**
 * Jedno połączenie SSE na kartę przeglądarki. Serwer po każdej zmianie
 * rozgłasza pełny plan ("plan") albo sygnał odświeżenia listy ("plans"),
 * dzięki czemu telewizor i telefony widzą ten sam stan bez odświeżania.
 */
const listeners = new Set();
let source = null;
let connected = false;

function ensureSource() {
  if (source) return;
  source = new EventSource('/api/events');
  source.addEventListener('open', () => {
    connected = true;
    emit({ type: 'status', connected: true });
  });
  source.addEventListener('error', () => {
    connected = false;
    emit({ type: 'status', connected: false });
  });
  source.addEventListener('plan', (e) => {
    try {
      emit({ type: 'plan', plan: JSON.parse(e.data) });
    } catch {
      /* ignorujemy uszkodzony pakiet */
    }
  });
  source.addEventListener('plans', () => emit({ type: 'plans' }));
}

function emit(message) {
  for (const fn of listeners) fn(message);
}

export function subscribe(fn) {
  ensureSource();
  listeners.add(fn);
  fn({ type: 'status', connected });
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && source) {
      source.close();
      source = null;
      connected = false;
    }
  };
}
