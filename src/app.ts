import Fastify from 'fastify';
import { config } from './config.js';
import { ping, type Db } from './db/client.js';
import { HttpError } from './errors.js';
import { gameRoutes } from './routes/games.js';

export function buildApp(db: Db) {
  const app = Fastify({
    logger: { level: config.logLevel },
    // Behind the ingress / load balancer.
    trustProxy: true,
  });

  // Flipped on SIGTERM so the readiness probe fails and the pod leaves the Service.
  let shuttingDown = false;
  app.decorate('markShuttingDown', () => {
    shuttingDown = true;
  });

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.message });
    if ((err as { validation?: unknown }).validation) return reply.code(400).send({ error: (err as Error).message });
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send({ error: 'internal error' });
  });

  // Liveness: the process is up. Never touches the DB, so a DB blip doesn't restart every pod.
  app.get('/healthz', async () => ({ status: 'ok' }));

  // Readiness: this pod can serve traffic right now.
  app.get('/readyz', async (req, reply) => {
    if (shuttingDown) return reply.code(503).send({ status: 'shutting down' });
    try {
      await ping(db);
      return { status: 'ready' };
    } catch (err) {
      req.log.warn({ err }, 'readiness check failed');
      return reply.code(503).send({ status: 'database unavailable' });
    }
  });

  app.register(gameRoutes, { db });
  return app;
}

declare module 'fastify' {
  interface FastifyInstance {
    markShuttingDown: () => void;
  }
}
