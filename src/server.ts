import { setTimeout as sleep } from 'node:timers/promises';
import { buildApp } from './app.js';
import { config } from './config.js';
import { createDb } from './db/client.js';

// Migrations are NOT run here. With N replicas that would mean N pods racing to
// migrate on every rollout; they run once per deploy in the migrate Job instead.
const db = createDb(config.db);
const app = buildApp(db);

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  app.log.info({ signal }, 'shutting down');
  app.markShuttingDown();
  // Give kube-proxy / the ingress time to drop this pod before we stop accepting.
  await sleep(config.shutdownDelayMs);
  await app.close();
  await db.$disconnect();
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.error(err);
  await db.$disconnect();
  process.exit(1);
}
