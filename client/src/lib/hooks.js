import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api.js';
import { subscribe } from './live.js';

export function usePlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setPlans(await api.listPlans());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
    return subscribe((msg) => {
      if (msg.type === 'plans' || msg.type === 'plan') reload();
    });
  }, [reload]);

  return { plans, loading, reload };
}

export function usePlan(planId) {
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const planIdRef = useRef(planId);
  planIdRef.current = planId;

  const reload = useCallback(async () => {
    if (!planIdRef.current) return;
    try {
      const data = await api.getPlan(planIdRef.current);
      if (planIdRef.current === data.id) setPlan(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setPlan(null);
    setLoading(true);
    reload();
  }, [planId, reload]);

  useEffect(
    () =>
      subscribe((msg) => {
        if (msg.type === 'plan' && msg.plan.id === planIdRef.current) setPlan(msg.plan);
      }),
    []
  );

  return { plan, setPlan, error, loading, reload };
}

export function useConnection() {
  const [connected, setConnected] = useState(true);
  useEffect(() => subscribe((msg) => msg.type === 'status' && setConnected(msg.connected)), []);
  return connected;
}

/** Ustawienie zapamiętane w przeglądarce (motyw, ukrywanie ukończonych itp.). */
export function useLocalSetting(key, fallback) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch {
      return fallback;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* brak dostępu do localStorage – ustawienie działa tylko w tej sesji */
    }
  }, [key, value]);
  return [value, setValue];
}

export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}
