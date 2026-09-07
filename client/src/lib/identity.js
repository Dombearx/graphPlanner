import { useCallback, useEffect, useState } from 'react';

const KEY = 'graphplanner.person';

export function useIdentity() {
  const [person, setPerson] = useState(() => {
    try {
      return localStorage.getItem(KEY) || '';
    } catch {
      return '';
    }
  });

  const save = useCallback((name) => {
    const clean = String(name || '').trim().slice(0, 40);
    setPerson(clean);
    try {
      if (clean) localStorage.setItem(KEY, clean);
      else localStorage.removeItem(KEY);
    } catch {
      /* prywatne okno – działamy bez zapisu */
    }
  }, []);

  // Zmiana imienia w innej karcie tej samej przeglądarki.
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === KEY) setPerson(e.newValue || '');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return { person, setPerson: save };
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Stabilny kolor awatara na podstawie imienia. */
export function personHue(name) {
  let hash = 0;
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) % 360;
  return hash;
}
