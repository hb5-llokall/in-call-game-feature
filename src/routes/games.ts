import type { FastifyInstance, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { isUniqueViolation, withTransaction, type Db } from '../db/client.js';
import { conflict, forbidden, HttpError, notFound } from '../errors.js';

// The API gateway authenticates the user and forwards their id in this header.
function userId(req: FastifyRequest): string {
  const id = req.headers['x-user-id'];
  if (typeof id !== 'string' || id === '') throw new HttpError(401, 'x-user-id header is required');
  return id;
}

const idParam = (name: string) => ({
  type: 'object',
  required: [name],
  properties: { [name]: { type: 'string', format: 'uuid' } },
});

export async function gameRoutes(app: FastifyInstance, { db }: { db: Db }) {
  app.get('/v1/games', async () => {
    const games = await db.game.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } });
    return { games };
  });

  // "You or your caller picks a game and sends an invite."
  app.post<{ Params: { callId: string }; Body: { gameCode: string; toUserId: string } }>(
    '/v1/calls/:callId/invites',
    {
      schema: {
        params: { type: 'object', required: ['callId'], properties: { callId: { type: 'string', minLength: 1, maxLength: 64 } } },
        body: {
          type: 'object',
          required: ['gameCode', 'toUserId'],
          additionalProperties: false,
          properties: {
            gameCode: { type: 'string', maxLength: 32 },
            toUserId: { type: 'string', minLength: 1, maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const fromUserId = userId(req);
      const { gameCode, toUserId } = req.body;
      if (toUserId === fromUserId) throw new HttpError(400, 'cannot invite yourself');

      const game = await db.game.findUnique({ where: { code: gameCode } });
      if (!game?.enabled) throw notFound('game');

      const invite = await db.gameInvite.create({
        data: {
          callId: req.params.callId,
          gameCode,
          fromUserId,
          toUserId,
          expiresAt: new Date(Date.now() + config.inviteTtlSeconds * 1000),
        },
      });
      return reply.code(201).send({ invite });
    },
  );

  // "The other person taps Accept." Creates the session in the same transaction.
  app.post<{ Params: { inviteId: string } }>(
    '/v1/invites/:inviteId/accept',
    { schema: { params: idParam('inviteId') } },
    async (req, reply) => {
      const me = userId(req);
      const session = await withTransaction(db, async (tx) => {
        // Conditional update instead of read-then-write: if two pods handle a
        // double tap, only one of them flips the row.
        const { count } = await tx.gameInvite.updateMany({
          where: { id: req.params.inviteId, toUserId: me, status: 'pending', expiresAt: { gt: new Date() } },
          data: { status: 'accepted', respondedAt: new Date() },
        });
        if (count === 0) throw conflict('invite is not pending, has expired, or is not addressed to you');

        const invite = await tx.gameInvite.findUniqueOrThrow({ where: { id: req.params.inviteId } });
        return tx.gameSession.create({
          data: {
            inviteId: invite.id,
            callId: invite.callId,
            gameCode: invite.gameCode,
            players: {
              create: [
                { userId: invite.fromUserId, seat: 0 },
                { userId: invite.toUserId, seat: 1 },
              ],
            },
          },
          include: { players: true },
        });
      });
      return reply.code(201).send({ session });
    },
  );

  app.post<{ Params: { inviteId: string } }>(
    '/v1/invites/:inviteId/decline',
    { schema: { params: idParam('inviteId') } },
    async (req) => {
      const me = userId(req);
      const { count } = await db.gameInvite.updateMany({
        where: { id: req.params.inviteId, toUserId: me, status: 'pending' },
        data: { status: 'declined', respondedAt: new Date() },
      });
      if (count === 0) throw conflict('invite is not pending or is not addressed to you');
      return { ok: true };
    },
  );

  app.get<{ Params: { sessionId: string } }>(
    '/v1/sessions/:sessionId',
    { schema: { params: idParam('sessionId') } },
    async (req) => {
      const session = await db.gameSession.findUnique({
        where: { id: req.params.sessionId },
        include: { players: { orderBy: { seat: 'asc' } } },
      });
      if (!session) throw notFound('session');
      return { session };
    },
  );

  // Records a move. Clients send the version they last saw; a stale version gets
  // a 409 and the client refetches the session and retries.
  app.post<{
    Params: { sessionId: string };
    Body: { expectedVersion: number; move: object; state: object; winnerUserId?: string | null; finished?: boolean };
  }>(
    '/v1/sessions/:sessionId/moves',
    {
      schema: {
        params: idParam('sessionId'),
        body: {
          type: 'object',
          required: ['expectedVersion', 'move', 'state'],
          additionalProperties: false,
          properties: {
            expectedVersion: { type: 'integer', minimum: 0 },
            move: { type: 'object' },
            state: { type: 'object' },
            finished: { type: 'boolean' },
            winnerUserId: { type: ['string', 'null'], maxLength: 64 },
          },
        },
      },
    },
    async (req, reply) => {
      const me = userId(req);
      const { sessionId } = req.params;
      const { expectedVersion, move, state, finished, winnerUserId } = req.body;

      try {
        const session = await withTransaction(db, async (tx) => {
          const player = await tx.gameSessionPlayer.findUnique({ where: { sessionId_userId: { sessionId, userId: me } } });
          if (!player) throw forbidden('you are not a player in this session');

          const { count } = await tx.gameSession.updateMany({
            where: { id: sessionId, status: 'active', version: expectedVersion },
            data: {
              version: { increment: 1 },
              state,
              ...(finished ? { status: 'completed', endedAt: new Date(), winnerUserId: winnerUserId ?? null } : {}),
            },
          });
          if (count === 0) throw conflict('session is not active or version is stale');

          await tx.gameMove.create({ data: { sessionId, seq: expectedVersion + 1, userId: me, payload: move } });
          return tx.gameSession.findUniqueOrThrow({ where: { id: sessionId } });
        });
        return reply.code(201).send({ session });
      } catch (err) {
        if (isUniqueViolation(err)) throw conflict('version is stale');
        throw err;
      }
    },
  );
}
