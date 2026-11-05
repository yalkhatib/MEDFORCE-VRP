/** Client HTTP du back-office (jeton JWT + rafraîchissement automatique). */
const KEY = 'medforce.session';

export interface Session {
  accessToken: string;
  refreshToken: string;
  utilisateur: { id: string; login: string; nom: string; prenom: string; role: string; codeRp: string };
}

export function session(): Session | null {
  try {
    const s = localStorage.getItem(KEY);
    return s ? (JSON.parse(s) as Session) : null;
  } catch {
    return null;
  }
}

export function setSession(s: Session | null) {
  try {
    s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY);
  } catch {
    /* stockage indisponible */
  }
}

export class ApiError extends Error {
  constructor(public status: number, public body: any) {
    super(typeof body?.message === 'string' ? body.message : body?.message?.message ?? `Erreur ${status}`);
  }
}

async function brut(method: string, path: string, body?: unknown, token?: string) {
  const r = await fetch(`/api${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  const data = text ? JSON.parse(text) : null;
  return { ok: r.ok, status: r.status, data };
}

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let s = session();
  let r = await brut(method, path, body, s?.accessToken);
  if (r.status === 401 && s?.refreshToken) {
    const rf = await brut('POST', '/auth/refresh', { refreshToken: s.refreshToken });
    if (rf.ok) {
      setSession(rf.data);
      s = rf.data;
      r = await brut(method, path, body, s!.accessToken);
    } else {
      setSession(null);
      location.href = '/login';
    }
  }
  if (!r.ok) throw new ApiError(r.status, r.data);
  return r.data as T;
}

export const get = <T = any>(p: string) => api<T>('GET', p);
export const post = <T = any>(p: string, b?: unknown) => api<T>('POST', p, b ?? {});
export const put = <T = any>(p: string, b?: unknown) => api<T>('PUT', p, b ?? {});

export const fmt = (n: number | null | undefined, d = 2) =>
  n == null ? '' : n.toLocaleString('fr-MA', { minimumFractionDigits: d, maximumFractionDigits: d });

export const uuid = () => crypto.randomUUID();
