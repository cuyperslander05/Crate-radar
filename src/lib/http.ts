import type { Response } from 'express';
import { isProduction } from './env.ts';

/**
 * An error whose message is safe to show to the client.
 * Anything else is reported as a generic message so internal details — SQL
 * text, connection strings, stack traces — never reach the browser.
 */
export class HttpError extends Error {
  // Declared explicitly rather than as a constructor parameter property, which
  // Node's type-stripping loader cannot compile.
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (message: string) => new HttpError(400, message);
export const forbidden = (message = 'Forbidden') => new HttpError(403, message);
export const notFound = (message = 'Not found') => new HttpError(404, message);

/**
 * Translates a thrown value into a response. Unexpected errors are logged
 * server-side with full detail and answered with a generic 500.
 */
export function sendError(res: Response, error: unknown, context: string) {
  if (error instanceof HttpError) {
    res.status(error.status).json({ error: error.message });
    return;
  }

  console.error(`[${context}]`, error);

  // Drizzle wraps driver errors, and its own message is the full SQL text — the
  // useful part ("column ... does not exist") is only on the cause.
  const cause = (error as { cause?: unknown })?.cause;
  if (cause) console.error(`[${context}] caused by:`, cause);

  const detail = (cause as Error)?.message ?? (error as Error)?.message ?? 'Unknown error';
  res.status(500).json({
    error: isProduction ? 'Something went wrong. Please try again.' : `${context}: ${detail}`,
  });
}

/** Wraps an async route handler so rejections reach sendError instead of hanging. */
export function asyncRoute<T extends (...args: any[]) => Promise<unknown>>(
  context: string,
  handler: T
) {
  return async (req: any, res: Response, next: any) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      sendError(res, error, context);
    }
  };
}

/** Parses a positive integer route parameter, rejecting NaN and out-of-range input. */
export function parseId(raw: string, label = 'id'): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0 || value > Number.MAX_SAFE_INTEGER) {
    throw badRequest(`Invalid ${label}`);
  }
  return value;
}

/** Trims and length-checks a required string field from a request body. */
export function requireString(
  value: unknown,
  label: string,
  { min = 1, max = 200 }: { min?: number; max?: number } = {}
): string {
  if (typeof value !== 'string') throw badRequest(`${label} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length < min) throw badRequest(`${label} is required`);
  if (trimmed.length > max) throw badRequest(`${label} must be at most ${max} characters`);
  return trimmed;
}

/** Same as requireString but allows the value to be absent. */
export function optionalString(
  value: unknown,
  label: string,
  { max = 500 }: { max?: number } = {}
): string | null {
  if (value === undefined || value === null || value === '') return null;
  return requireString(value, label, { max });
}

const SPOTIFY_URI_PATTERN = /^spotify:track:[A-Za-z0-9]{22}$/;

/**
 * Validates a Spotify track URI. The value is forwarded to the Spotify API and
 * rendered in other users' clients, so it must be exactly the expected shape.
 */
export function requireSpotifyTrackUri(value: unknown): string {
  const uri = requireString(value, 'spotifyUri', { max: 100 });
  if (!SPOTIFY_URI_PATTERN.test(uri)) throw badRequest('Invalid Spotify track URI');
  return uri;
}

/**
 * Validates that a URL is an https image link before it is stored and rendered.
 * Blocks javascript: and data: URIs, which would otherwise be an XSS vector in
 * any context that interpolates the value into markup.
 */
export function optionalHttpsUrl(value: unknown, label: string): string | null {
  const raw = optionalString(value, label, { max: 2048 });
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw badRequest(`${label} must be a valid URL`);
  }
  if (parsed.protocol !== 'https:') throw badRequest(`${label} must use https`);
  return parsed.toString();
}
