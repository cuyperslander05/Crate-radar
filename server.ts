import {
  env,
  isProduction,
  assertProductionSecrets,
  getSpotifyRedirectUri,
} from './src/lib/env.ts';
import express from 'express';
import { createServer as createHttpServer } from 'http';
import path from 'path';
import { securityHeaders, corsGuard, rateLimit } from './src/middleware/security.ts';
import usersRouter from './src/routes/users.ts';
import jamsRouter from './src/routes/jams.ts';
import spotifyRouter from './src/routes/spotify.ts';
import { createSocketServer } from './src/sockets/index.ts';

async function startServer() {
  assertProductionSecrets();

  const app = express();

  // Rate limiting keys off req.ip, which is only meaningful behind a proxy when
  // Express is told to trust the X-Forwarded-For header.
  if (isProduction) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(securityHeaders);
  app.use(corsGuard);
  app.use(express.json({ limit: '64kb' }));

  // Broad ceiling on API traffic; individual routes add tighter limits.
  app.use('/api', rateLimit({ windowMs: 60_000, max: 300, keyPrefix: 'api' }));

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/spotify', spotifyRouter);
  app.use('/api/jams', jamsRouter);
  app.use('/api', usersRouter);

  // Unmatched API paths must 404 as JSON rather than falling through to the
  // SPA shell, which would return HTML to a fetch() caller.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const httpServer = createHttpServer(app);
  createSocketServer(httpServer);

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`Crate server listening on ${env.appUrl} (${env.nodeEnv})`);
    console.log(`Firebase project: ${env.firebase.projectId}`);
    if (env.spotify.clientId) {
      // Spotify compares this byte for byte against the dashboard entry.
      console.log(`Spotify redirect URI: ${getSpotifyRedirectUri()}`);
    }
  });

  const shutdown = (signal: string) => {
    console.log(`${signal} received, shutting down.`);
    httpServer.close(() => process.exit(0));
    // Do not let a hung connection block the exit indefinitely.
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
