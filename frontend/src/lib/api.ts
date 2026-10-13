import { ApiError } from '../types';

let inMemoryCsrfToken: string | null = null;

function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export function setCsrfToken(token: string | null): void {
  inMemoryCsrfToken = token;
}

export async function ensureCsrfToken(force = false): Promise<string> {
  if (!force) {
    if (inMemoryCsrfToken) return inMemoryCsrfToken;
    const existing = getCookie('csrftoken');
    if (existing) {
      inMemoryCsrfToken = existing;
      return existing;
    }
  }

  try {
    const res = await fetch('/api/v1/auth/csrf/', { credentials: 'include' });
    const data = await res.json();
    const token = data.csrfToken || getCookie('csrftoken') || '';
    if (token) inMemoryCsrfToken = token;
    return token;
  } catch {
    const token = getCookie('csrftoken') || '';
    if (token) inMemoryCsrfToken = token;
    return token;
  }
}

export class ApiException extends Error {
  apiError: ApiError;
  status: number;

  constructor(status: number, apiError: ApiError) {
    super(apiError.message || 'API request failed');
    this.name = 'ApiException';
    this.status = status;
    this.apiError = apiError;
  }
}

export async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = endpoint.startsWith('/') ? endpoint : `/api/v1/${endpoint}`;
  const method = (options.method || 'GET').toUpperCase();
  const isWrite = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

  const headers = new Headers(options.headers || {});
  headers.set('Accept', 'application/json');

  if (isWrite) {
    headers.set('Content-Type', 'application/json');
    const csrfToken = await ensureCsrfToken();
    if (csrfToken) {
      headers.set('X-CSRFToken', csrfToken);
    }
  }

  let response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  // If 403 on a mutating endpoint, refresh CSRF token and retry once
  if (response.status === 403 && isWrite) {
    const freshToken = await ensureCsrfToken(true);
    if (freshToken) {
      headers.set('X-CSRFToken', freshToken);
      response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include',
      });
    }
  }

  if (response.status === 204) {
    return {} as T;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  if (data && typeof data === 'object' && 'csrfToken' in data && typeof data.csrfToken === 'string') {
    setCsrfToken(data.csrfToken);
  }

  if (!response.ok) {
    const errorPayload: ApiError = data?.error || {
      code: response.status === 401 ? 'not_authenticated' : 'error',
      message: response.statusText || 'An error occurred',
    };
    throw new ApiException(response.status, errorPayload);
  }

  return data as T;
}
