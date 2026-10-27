// Database client for any Postgres-wire-compatible server (Postgres, Aurora/RDS,
// Cloud SQL, AlloyDB, Neon, Supabase, ...). Prisma runs on top of node-postgres
// through the driver adapter, so the connection is a plain `pg` pool.
import { PrismaPg } from '@prisma/adapter-pg';
import { Prisma, PrismaClient } from '../generated/prisma/client.js';
import type { DbConfig } from '../config.js';

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

export function createDb(cfg: DbConfig): Db {
  const adapter = new PrismaPg({
    connectionString: cfg.url,
    max: cfg.poolMax,
    idleTimeoutMillis: cfg.idleTimeoutMs,
    connectionTimeoutMillis: cfg.connectTimeoutMs,
    statement_timeout: cfg.statementTimeoutMs,
    application_name: process.env.HOSTNAME ?? 'dostt-call-games',
  });
  return new PrismaClient({ adapter });
}

/** Cheap round trip used by the readiness probe. */
export async function ping(db: Db): Promise<void> {
  await db.$queryRaw`SELECT 1`;
}

export function withTransaction<T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
}

/** True when `err` is a unique-constraint violation (e.g. two pods racing on the same row). */
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
