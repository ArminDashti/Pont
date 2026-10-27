export const API_BASE =
  (import.meta.env.VITE_PONT_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:9880/api';

export function token(): string | null {
  return sessionStorage.getItem('pont_token');
}

export function setToken(value: string | null): void {
  if (value) {
    sessionStorage.setItem('pont_token', value);
  } else {
    sessionStorage.removeItem('pont_token');
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Content-Type', 'application/json');
  const t = token();
  if (t) {
    headers.set('Authorization', `Bearer ${t}`);
  }
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}
