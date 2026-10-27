function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value)) throw new Error(`${name} must be an integer, got "${raw}"`);
  return value;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const config = {
  port: intFromEnv('PORT', 3000),
  host: process.env.HOST ?? '0.0.0.0',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  inviteTtlSeconds: intFromEnv('INVITE_TTL_SECONDS', 60),
  // How long to keep serving after SIGTERM so the Service stops routing to us first.
  shutdownDelayMs: intFromEnv('SHUTDOWN_DELAY_MS', 5000),
  db: {
    url: required('DATABASE_URL'),
    // Per pod. Keep (replicas x poolMax) under the server's max_connections,
    // or put PgBouncer / RDS Proxy in front.
    poolMax: intFromEnv('DB_POOL_MAX', 10),
    idleTimeoutMs: intFromEnv('DB_IDLE_TIMEOUT_MS', 30_000),
    connectTimeoutMs: intFromEnv('DB_CONNECT_TIMEOUT_MS', 5_000),
    statementTimeoutMs: intFromEnv('DB_STATEMENT_TIMEOUT_MS', 10_000),
  },
} as const;

export type DbConfig = typeof config.db;
