import { deviceId } from './device.js';

export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '') + '/api';

export async function api(path, { method = 'GET', body, signal } = {}) {
  const headers = { 'X-Device': deviceId() };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${API_BASE}${path}`, { method, headers, signal, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== null && v !== undefined && v !== '')).toString();
