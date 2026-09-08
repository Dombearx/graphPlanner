const base = import.meta.env.BASE_URL.replace(/\/$/, '');

async function request(method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Błąd ${res.status}`);
  return data;
}

export const api = {
  listPlans: () => request('GET', '/api/plans'),
  getPlan: (id) => request('GET', `/api/plans/${id}`),
  createPlan: (body) => request('POST', '/api/plans', body),
  updatePlan: (id, body) => request('PATCH', `/api/plans/${id}`, body),
  deletePlan: (id) => request('DELETE', `/api/plans/${id}`),
  duplicatePlan: (id, name) => request('POST', `/api/plans/${id}/duplicate`, { name }),

  createNode: (planId, body) => request('POST', `/api/plans/${planId}/nodes`, body),
  updateNode: (id, body) => request('PATCH', `/api/nodes/${id}`, body),
  deleteNode: (id) => request('DELETE', `/api/nodes/${id}`),
  savePositions: (planId, positions) =>
    request('POST', `/api/plans/${planId}/positions`, { positions }),

  changeCount: (id, amount, person) => request('POST', `/api/nodes/${id}/count`, { amount, person }),
  setAssignment: (id, person, assigned) =>
    request('POST', `/api/nodes/${id}/assign`, { person, assigned }),

  createEdge: (planId, source, target) =>
    request('POST', `/api/plans/${planId}/edges`, { source, target }),
  deleteEdge: (id) => request('DELETE', `/api/edges/${id}`),

  listPeople: () => request('GET', '/api/people'),
};
