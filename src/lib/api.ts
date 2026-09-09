import { auth } from './firebase';

/**
 * An error carrying the HTTP status, so callers can distinguish "you need to
 * link Spotify" (428) from a genuine failure.
 */
export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }

  /** The server needs the user to connect their Spotify account first. */
  get needsSpotify() {
    return this.status === 428;
  }
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) throw new ApiError(401, 'You are signed out. Please sign in again.');
  return { Authorization: `Bearer ${token}` };
}

/**
 * Authenticated fetch wrapper. Always throws an ApiError on a non-2xx response
 * so callers can surface a real message instead of silently rendering an empty
 * state, which is what the previous console.error-only handlers did.
 */
export async function api<T>(
  path: string,
  options: RequestInit & { json?: unknown } = {}
): Promise<T> {
  const { json, headers, ...rest } = options;

  let response: Response;
  try {
    response = await fetch(path, {
      ...rest,
      headers: {
        ...(await authHeaders()),
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }

  if (response.status === 204) return undefined as T;

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      (payload && typeof payload.error === 'string' && payload.error) ||
        `Request failed (${response.status})`
    );
  }

  return payload as T;
}

/** Normalises anything thrown into a message safe to show the user. */
export function errorMessage(error: unknown, fallback = 'Something went wrong.'): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
