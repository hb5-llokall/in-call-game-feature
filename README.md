# Dostt Call Games service

Backend for in-call games (Rock Paper Scissors, Ludo, Tic-tac-toe): a caller or
listener sends a game invite during a call, the other side accepts, and both
play while they keep talking.

- **Runtime:** Node.js 24 (Active LTS), TypeScript, Fastify 5
- **Database:** any Postgres-compatible server (Postgres, Aurora/RDS, Cloud SQL,
  AlloyDB, Neon, Supabase...) through Prisma 7 + `node-postgres` (`@prisma/adapter-pg`)
- **Migrations:** Prisma Migrate — `prisma migrate dev` to create, `prisma migrate deploy` to apply

## Run locally

```bash
docker compose up --build
curl localhost:3000/v1/games
```

Compose starts Postgres 18, runs the `migrate` service once (`prisma migrate deploy`),
and only then starts the API.

To run the API on your machine against the compose database instead:

```bash
docker compose up -d db
cp .env.example .env
npm install
npm run db:migrate:deploy
npm run dev
```

## API

The API gateway authenticates the user and passes their id in `x-user-id`.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/v1/games` | Enabled games |
| POST | `/v1/calls/:callId/invites` | `{ gameCode, toUserId }` |
| POST | `/v1/invites/:inviteId/accept` | Only the invitee; creates the game session |
| POST | `/v1/invites/:inviteId/decline` | Only the invitee |
| GET | `/v1/sessions/:sessionId` | Session, state, players |
| POST | `/v1/sessions/:sessionId/moves` | `{ expectedVersion, move, state, finished?, winnerUserId? }` — 409 if `expectedVersion` is stale |
| GET | `/healthz` | Liveness (no DB) |
| GET | `/readyz` | Readiness (pings DB; 503 while shutting down) |

Game rules run on the clients; the server stores the agreed state and the move log.

## Database changes → migrations

Every change to `prisma/schema.prisma` ships with a migration:

```bash
docker compose up -d db
npm run db:migrate:dev -- --name add_game_ratings
```

This writes `prisma/migrations/<timestamp>_add_game_ratings/migration.sql`. Review it and
commit it with the schema change. For data migrations or SQL Prisma can't express, use
`npm run db:migrate:create -- --name <name>` and edit the generated file
(see `20261027000100_seed_games`).

Never edit a migration that has already been deployed — add a new one.

## Deploying to Kubernetes

Multiple-pod design:

- **Stateless pods.** All state is in Postgres; any pod can serve any request.
- **Race-safe writes.** Accepting an invite and recording a move are conditional updates
  (`WHERE status = 'pending'` / `WHERE version = $expected`) inside a transaction, plus a
  unique `(session_id, seq)` on moves. Two pods racing on the same invite or move: one wins,
  the other gets a 409.
- **Connection budget.** `DB_POOL_MAX` is per pod. Keep `maxReplicas × DB_POOL_MAX` under the
  database's `max_connections`, or put PgBouncer / RDS Proxy in front.
- **Graceful shutdown.** On SIGTERM `/readyz` fails, the pod waits `SHUTDOWN_DELAY_MS` for the
  Service to stop routing to it, then drains and closes the pool.
- **Migrations run once per deploy, never at pod startup.** The `k8s/migrate-job.yaml` Job runs
  `prisma migrate deploy` with the same image; the Deployment is rolled only after it succeeds.
  `migrate deploy` also takes a Postgres advisory lock, so an accidental concurrent run is safe.

```bash
docker build -t ghcr.io/hb5-llokall/in-call-game-feature:<sha> .
docker push ghcr.io/hb5-llokall/in-call-game-feature:<sha>

kubectl -n dostt-games create secret generic dostt-call-games-db \
  --from-literal=DATABASE_URL='postgresql://user:pass@host:5432/dostt_games?schema=public&sslmode=require'

IMAGE=ghcr.io/hb5-llokall/in-call-game-feature:<sha> ./scripts/deploy.sh
```

Using Helm or Argo CD? Keep the migrate Job and mark it as a pre-install/pre-upgrade hook or a
PreSync hook (annotations are listed at the top of `k8s/migrate-job.yaml`).

## Layout

```
prisma/schema.prisma        data model (source of truth)
prisma/migrations/          generated SQL migrations, applied in order
prisma.config.ts            Prisma CLI config (reads DATABASE_URL)
src/db/client.ts            database client: pg pool + Prisma, ping, transactions
src/routes/games.ts         HTTP routes
src/server.ts               startup and graceful shutdown
k8s/                        Deployment, Service, HPA, PDB, ConfigMap, migrate Job
scripts/deploy.sh           migrate, then roll out
```
