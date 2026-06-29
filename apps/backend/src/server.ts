import express, { type Express } from 'express';
import { loadConfig, type BackendConfig } from './config';
import { inferRouter } from './routes/infer';
import { toolsRouter } from './routes/tools';

export function createApp(config: BackendConfig = loadConfig()): Express {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'sage-backend-v3', provider: config.provider });
  });

  // POST /api/sage/infer
  app.use('/api/sage', inferRouter(config));
  // POST /api/sage/tools/{search,fetch,execute,research}
  app.use('/api/sage/tools', toolsRouter(config));

  return app;
}

export function startServer(config: BackendConfig = loadConfig()) {
  const app = createApp(config);
  return app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `SAGE Backend v3 listening on :${config.port} (provider=${config.provider})`,
    );
  });
}
