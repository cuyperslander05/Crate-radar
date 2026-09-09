import type { Request, Response, NextFunction } from 'express';
import { getAllowedOrigins, isProduction } from '../lib/env.ts';

/**
 * Baseline security response headers.
 *
 * Kept dependency-free rather than pulling in helmet: the set below is what
 * this app actually needs, and the CSP has to allow the Spotify Web Playback
 * SDK, which loads a script from sdk.scdn.co and runs it in an iframe.
 */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), camera=(), microphone=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');

  if (isProduction) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // In development Vite needs 'unsafe-eval' for HMR, so the CSP is only
    // enforced on production builds where no eval is required.
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self' https://sdk.scdn.co https://apis.google.com",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https:",
        "media-src 'self' https:",
        "connect-src 'self' https://api.spotify.com https://accounts.spotify.com https://*.googleapis.com wss: ws:",
        "frame-src 'self' https://sdk.scdn.co https://*.firebaseapp.com https://accounts.google.com",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; ')
    );
  }

  next();
}

/**
 * Restricts cross-origin API access to the configured origins. Requests without
 * an Origin header (same-origin navigations, server-to-server) pass through.
 */
export function corsGuard(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (!origin) {
    next();
    return;
  }

  if (!getAllowedOrigins().includes(origin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return;
  }

  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Fixed-window rate limiter backed by an in-process map.
 *
 * Sufficient for a single-node deployment; a multi-node setup would need a
 * shared store (Redis) so the limit is enforced across instances.
 */
export function rateLimit(options: {
  windowMs: number;
  max: number;
  keyPrefix: string;
  message?: string;
}) {
  const { windowMs, max, keyPrefix, message = 'Too many requests. Slow down.' } = options;
  const buckets = new Map<string, Bucket>();

  // Drop expired buckets periodically so the map cannot grow without bound.
  const sweeper = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }, windowMs);
  sweeper.unref?.();

  return (req: Request & { user?: { uid?: string } }, res: Response, next: NextFunction) => {
    // Prefer the authenticated uid: it cannot be spoofed by rotating IPs and
    // does not punish everyone behind a shared NAT.
    const identity = req.user?.uid || req.ip || 'unknown';
    const key = `${keyPrefix}:${identity}`;
    const now = Date.now();

    let bucket = buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((bucket.resetAt - now) / 1000)));
      res.status(429).json({ error: message });
      return;
    }

    next();
  };
}
