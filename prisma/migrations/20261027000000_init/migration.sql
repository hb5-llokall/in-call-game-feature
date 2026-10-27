-- CreateEnum
CREATE TYPE "invite_status" AS ENUM ('pending', 'accepted', 'declined', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "session_status" AS ENUM ('active', 'completed', 'abandoned');

-- CreateTable
CREATE TABLE "games" (
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "min_players" SMALLINT NOT NULL DEFAULT 2,
    "max_players" SMALLINT NOT NULL DEFAULT 2,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "game_invites" (
    "id" UUID NOT NULL,
    "call_id" VARCHAR(64) NOT NULL,
    "game_code" VARCHAR(32) NOT NULL,
    "from_user_id" VARCHAR(64) NOT NULL,
    "to_user_id" VARCHAR(64) NOT NULL,
    "status" "invite_status" NOT NULL DEFAULT 'pending',
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "responded_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_invites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_sessions" (
    "id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "call_id" VARCHAR(64) NOT NULL,
    "game_code" VARCHAR(32) NOT NULL,
    "status" "session_status" NOT NULL DEFAULT 'active',
    "state" JSONB NOT NULL DEFAULT '{}',
    "version" INTEGER NOT NULL DEFAULT 0,
    "winner_user_id" VARCHAR(64),
    "started_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "game_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_session_players" (
    "session_id" UUID NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "seat" SMALLINT NOT NULL,
    "joined_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_session_players_pkey" PRIMARY KEY ("session_id","user_id")
);

-- CreateTable
CREATE TABLE "game_moves" (
    "id" BIGSERIAL NOT NULL,
    "session_id" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "user_id" VARCHAR(64) NOT NULL,
    "payload" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_moves_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_invites_call_id_status_idx" ON "game_invites"("call_id", "status");

-- CreateIndex
CREATE INDEX "game_invites_to_user_id_status_idx" ON "game_invites"("to_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "game_sessions_invite_id_key" ON "game_sessions"("invite_id");

-- CreateIndex
CREATE INDEX "game_sessions_call_id_idx" ON "game_sessions"("call_id");

-- CreateIndex
CREATE INDEX "game_session_players_user_id_idx" ON "game_session_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_session_players_session_id_seat_key" ON "game_session_players"("session_id", "seat");

-- CreateIndex
CREATE UNIQUE INDEX "game_moves_session_id_seq_key" ON "game_moves"("session_id", "seq");

-- AddForeignKey
ALTER TABLE "game_invites" ADD CONSTRAINT "game_invites_game_code_fkey" FOREIGN KEY ("game_code") REFERENCES "games"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "game_invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_sessions" ADD CONSTRAINT "game_sessions_game_code_fkey" FOREIGN KEY ("game_code") REFERENCES "games"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_session_players" ADD CONSTRAINT "game_session_players_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_moves" ADD CONSTRAINT "game_moves_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "game_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

