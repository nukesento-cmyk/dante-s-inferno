export const API_BASE = '/api/v1';

export interface ApiIssue {
  path: (string | number)[] | string;
  message: string;
}

export class ApiError extends Error {
  status: number;
  issues?: ApiIssue[];
  constructor(status: number, message: string, issues?: ApiIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.issues = issues;
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const qs = opts.query
    ? '?' +
      Object.entries(opts.query)
        .filter(([, v]) => v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
        .join('&')
    : '';
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}${qs === '?' ? '' : qs}`, {
      method: opts.method ?? 'GET',
      credentials: 'include',
      signal: opts.signal,
      headers: {
        Accept: 'application/json',
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. Check your connection and try again.');
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: unknown = undefined;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = undefined;
    }
  }
  if (!res.ok) {
    const d = (data ?? {}) as { message?: string | string[]; issues?: ApiIssue[] };
    const message = Array.isArray(d.message) ? d.message.join(', ') : d.message || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, d.issues);
  }
  return data as T;
}

/** Map API issues to { "customer.phone": "message" } */
export function issuesToFieldErrors(issues?: ApiIssue[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues ?? []) {
    const key = Array.isArray(i.path) ? i.path.join('.') : String(i.path);
    if (!(key in out)) out[key] = i.message;
  }
  return out;
}
