import type { PaymentMethod, Prisma, PrismaClient, SessionStatus } from "@prisma/client";
import { normalizeCustomerPhone } from "./phone";
import { prisma } from "./prisma";
import { calculateTax, getSettings } from "./settings";
import { remainingSeconds, todayRange, monthRange, rangeForBusinessDate } from "./time";

type Client = PrismaClient | Prisma.TransactionClient;

export type StartSessionInput = {
  gameTableId: string;
  durationMinutes: number;
  idempotencyKey?: string;
  customerName?: string;
  customerPhone?: string;
  paymentMethod: PaymentMethod;
  discountAmount?: number;
  transactionReference?: string;
  userId?: string;
  now?: Date;
};

export type ExtendSessionInput = {
  sessionId: string;
  durationMinutes: number;
  idempotencyKey?: string;
  paymentMethod: PaymentMethod;
  amount?: number;
  userId?: string;
  now?: Date;
};

export class PosError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function sessionNumber(now = new Date()) {
  const stamp = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `FGZ-${stamp}-${suffix}`;
}

function normalizedIdempotencyKey(value?: string) {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function isUniqueConstraintError(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

function isPostgresRuntime() {
  return /^postgres(?:ql)?:\/\//i.test(process.env.DATABASE_URL ?? "");
}

function containsText(value: string) {
  const filter: Record<string, unknown> = { contains: value.trim() };
  if (isPostgresRuntime()) filter.mode = "insensitive";
  return filter;
}

async function audit(
  client: Client,
  action: string,
  entityType: string,
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  await client.auditLog.create({
    data: {
      action,
      entityType,
      entityId,
      userId,
      sessionId: entityType === "SESSION" ? entityId : undefined,
      metadata: metadata ? JSON.stringify(metadata) : undefined
    }
  });
}

export async function startSession(input: StartSessionInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const rawCustomerPhone = input.customerPhone?.trim();
  if (!rawCustomerPhone) throw new PosError("Customer phone is required");
  const customerPhone = normalizeCustomerPhone(rawCustomerPhone);
  if (!customerPhone) throw new PosError("Enter a valid Indian mobile number");
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey) {
    const existing = await client.session.findUnique({ where: { idempotencyKey }, include: sessionInclude });
    if (existing) {
      if (existing.gameTableId !== input.gameTableId) throw new PosError("Idempotency key was already used", 409);
      return existing;
    }
  }

  const settings = await getSettings(client);
  const discountAmount = Math.max(0, input.discountAmount ?? 0);

  try {
    return await client.$transaction(async (tx) => {
      const table = await tx.gameTable.findFirst({
        where: { id: input.gameTableId, active: true },
        include: { pricing: { where: { active: true } } }
      });
      if (!table) throw new PosError("Game table not found", 404);

      const price = table.pricing.find((item) => item.durationMinutes === input.durationMinutes);
      if (!price) throw new PosError("No active price is configured for this duration");

      const baseAmount = price.price;
      const taxableAmount = Math.max(0, baseAmount - discountAmount);
      const taxAmount = calculateTax(taxableAmount, settings);
      const finalAmount = Math.max(0, taxableAmount + taxAmount);
      const startedAt = now;
      const endsAt = new Date(startedAt.getTime() + input.durationMinutes * 60 * 1000);

      const session = await tx.session.create({
        data: {
          idempotencyKey,
          sessionNumber: sessionNumber(now),
          gameTableId: table.id,
          customerName: input.customerName?.trim() || null,
          customerPhone,
          startedAt,
          endsAt,
          originalDurationMinutes: input.durationMinutes,
          status: "PLAYING",
          baseAmount,
          discountAmount,
          taxAmount,
          finalAmount,
          paymentStatus: "PAID",
          createdAt: now,
          updatedAt: now,
          payments: {
            create: {
              idempotencyKey,
              amount: finalAmount,
              paymentMethod: input.paymentMethod,
              paymentStatus: "PAID",
              transactionReference: input.transactionReference,
              createdAt: now
            }
          }
        },
        include: sessionInclude
      });

      await tx.activeTableLock.create({
        data: {
          gameTableId: table.id,
          sessionId: session.id
        }
      });

      await tx.gameTable.update({
        where: { id: table.id },
        data: { status: "PLAYING" }
      });

      await audit(tx, "SESSION_STARTED", "SESSION", session.id, input.userId, {
        gameTableId: table.id,
        durationMinutes: input.durationMinutes,
        finalAmount
      });

      return session;
    });
  } catch (error) {
    if (isUniqueConstraintError(error) && idempotencyKey) {
      const existing = await client.session.findUnique({ where: { idempotencyKey }, include: sessionInclude });
      if (existing) return existing;
    }
    if (isUniqueConstraintError(error)) {
      throw new PosError("This table already has an active session", 409);
    }
    throw error;
  }
}

export async function reserveTable(gameTableId: string, userId?: string, client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const table = await tx.gameTable.findUnique({ where: { id: gameTableId } });
    if (!table || !table.active) throw new PosError("Game table not found", 404);
    if (table.status !== "AVAILABLE") throw new PosError("Only available tables can be reserved");
    const updated = await tx.gameTable.update({ where: { id: gameTableId }, data: { status: "RESERVED" } });
    await audit(tx, "TABLE_RESERVED", "GAME_TABLE", gameTableId, userId);
    return updated;
  });
}

export async function extendSession(input: ExtendSessionInput, client: PrismaClient = prisma) {
  const now = input.now ?? new Date();
  const idempotencyKey = normalizedIdempotencyKey(input.idempotencyKey);
  if (idempotencyKey) {
    const existingExtension = await client.sessionExtension.findUnique({
      where: { idempotencyKey },
      select: { sessionId: true }
    });
    if (existingExtension) {
      if (existingExtension.sessionId !== input.sessionId) throw new PosError("Idempotency key was already used", 409);
      return client.session.findUniqueOrThrow({ where: { id: input.sessionId }, include: sessionInclude });
    }
  }

  const settings = await getSettings(client);

  try {
    return await client.$transaction(async (tx) => {
      const session = await tx.session.findUnique({
        where: { id: input.sessionId },
        include: { gameTable: { include: { pricing: { where: { active: true } } } } }
      });
      if (!session) throw new PosError("Session not found", 404);
      if (!["PLAYING", "PAUSED", "TIME_UP"].includes(session.status)) {
        throw new PosError("Only active, paused, or time-up sessions can be extended");
      }

      const configuredPrice = session.gameTable.pricing.find((price) => price.durationMinutes === input.durationMinutes);
      const amount = input.amount ?? configuredPrice?.price;
      if (amount === undefined) throw new PosError("No price configured for this extension duration");

      const taxAmount = calculateTax(amount, settings);
      const extensionSeconds = input.durationMinutes * 60;
      const baseEndMs =
        session.status === "TIME_UP" || session.endsAt.getTime() < now.getTime()
          ? now.getTime()
          : session.endsAt.getTime();
      const endsAt = new Date(baseEndMs + extensionSeconds * 1000);

      const updated = await tx.session.update({
        where: { id: session.id },
        data: {
          endsAt,
          pausedAt: null,
          remainingSecondsAtPause: null,
          status: "PLAYING",
          finalAmount: { increment: amount + taxAmount },
          taxAmount: { increment: taxAmount },
          paymentStatus: "PAID",
          updatedAt: now,
          extensions: {
            create: {
              idempotencyKey,
              durationMinutes: input.durationMinutes,
              amount,
              taxAmount,
              paymentMethod: input.paymentMethod,
              createdAt: now
            }
          },
          payments: {
            create: {
              idempotencyKey,
              amount: amount + taxAmount,
              paymentMethod: input.paymentMethod,
              paymentStatus: "PAID",
              createdAt: now
            }
          }
        },
        include: sessionInclude
      });

      await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "PLAYING" } });
      await tx.activeTableLock.upsert({
        where: { gameTableId: session.gameTableId },
        update: { sessionId: session.id },
        create: { gameTableId: session.gameTableId, sessionId: session.id }
      });
      await audit(tx, "SESSION_EXTENDED", "SESSION", session.id, input.userId, {
        durationMinutes: input.durationMinutes,
        amount,
        restartedFromTimeUp: session.status === "TIME_UP"
      });

      return updated;
    });
  } catch (error) {
    if (isUniqueConstraintError(error) && idempotencyKey) {
      const existingExtension = await client.sessionExtension.findUnique({
        where: { idempotencyKey },
        select: { sessionId: true }
      });
      if (existingExtension?.sessionId === input.sessionId) {
        return client.session.findUniqueOrThrow({ where: { id: input.sessionId }, include: sessionInclude });
      }
    }
    throw error;
  }
}

export async function pauseSession(sessionId: string, userId?: string, now = new Date(), client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== "PLAYING") throw new PosError("Only playing sessions can be paused");
    const remaining = remainingSeconds(session.endsAt, now);
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "PAUSED",
        pausedAt: now,
        remainingSecondsAtPause: remaining
      },
      include: sessionInclude
    });
    await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "PAUSED" } });
    await audit(tx, "SESSION_PAUSED", "SESSION", session.id, userId, { remainingSeconds: remaining });
    return updated;
  });
}

export async function resumeSession(sessionId: string, userId?: string, now = new Date(), client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session || session.status !== "PAUSED") throw new PosError("Only paused sessions can be resumed");
    const remaining = session.remainingSecondsAtPause ?? remainingSeconds(session.endsAt, now);
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        status: "PLAYING",
        endsAt: new Date(now.getTime() + remaining * 1000),
        pausedAt: null,
        remainingSecondsAtPause: null
      },
      include: sessionInclude
    });
    await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "PLAYING" } });
    await audit(tx, "SESSION_RESUMED", "SESSION", session.id, userId, { remainingSeconds: remaining });
    return updated;
  });
}

export async function markTimeUp(sessionId: string, userId?: string, now = new Date(), client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new PosError("Session not found", 404);
    if (!["PLAYING", "PAUSED", "TIME_UP"].includes(session.status)) return session;
    if (session.status === "PLAYING" && remainingSeconds(session.endsAt, now) > 0) return session;
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { status: "TIME_UP", endsAt: session.status === "PAUSED" ? now : session.endsAt },
      include: sessionInclude
    });
    await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "TIME_UP" } });
    await audit(tx, "SESSION_TIME_UP", "SESSION", session.id, userId);
    return updated;
  });
}

export async function endSession(sessionId: string, userId?: string, now = new Date(), client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new PosError("Session not found", 404);
    if (["COMPLETED", "CANCELLED"].includes(session.status)) return session;
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { status: "COMPLETED", completedAt: now },
      include: sessionInclude
    });
    await tx.activeTableLock.deleteMany({ where: { sessionId } });
    await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "AVAILABLE" } });
    await audit(tx, "SESSION_COMPLETED", "SESSION", session.id, userId);
    return updated;
  });
}

export async function cancelSession(sessionId: string, userId?: string, now = new Date(), client: PrismaClient = prisma) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new PosError("Session not found", 404);
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: { status: "CANCELLED", paymentStatus: "CANCELLED", cancelledAt: now },
      include: sessionInclude
    });
    await tx.payment.updateMany({ where: { sessionId }, data: { paymentStatus: "CANCELLED" } });
    await tx.activeTableLock.deleteMany({ where: { sessionId } });
    await tx.gameTable.update({ where: { id: session.gameTableId }, data: { status: "AVAILABLE" } });
    await audit(tx, "SESSION_CANCELLED", "SESSION", session.id, userId);
    return updated;
  });
}

export async function refundSession(
  sessionId: string,
  reason: string,
  userId?: string,
  now = new Date(),
  client: PrismaClient = prisma
) {
  return client.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new PosError("Session not found", 404);
    const updated = await tx.session.update({
      where: { id: sessionId },
      data: {
        paymentStatus: "REFUNDED",
        refundAmount: session.finalAmount,
        refundReason: reason,
        refundedAt: now
      },
      include: sessionInclude
    });
    await tx.payment.updateMany({
      where: { sessionId, paymentStatus: "PAID" },
      data: { paymentStatus: "REFUNDED", refundAmount: session.finalAmount, refundedAt: now }
    });
    await audit(tx, "SESSION_REFUNDED", "SESSION", session.id, userId, { reason, amount: session.finalAmount });
    return updated;
  });
}

export async function syncExpiredSessions(client: PrismaClient = prisma, now = new Date()) {
  const expired = await client.session.findMany({
    where: {
      status: "PLAYING",
      endsAt: { lte: now }
    },
    select: { id: true }
  });
  for (const session of expired) {
    await markTimeUp(session.id, undefined, now, client);
  }
}

export const sessionInclude = {
  gameTable: true,
  extensions: { orderBy: { createdAt: "asc" } },
  payments: { orderBy: { createdAt: "asc" } }
} satisfies Prisma.SessionInclude;

export async function getDashboardData(client: PrismaClient = prisma, now = new Date()) {
  await syncExpiredSessions(client, now);
  const settings = await getSettings(client);
  const { start, end } = todayRange(now);
  const [tables, sessions] = await Promise.all([
    client.gameTable.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        pricing: { where: { active: true }, orderBy: { durationMinutes: "asc" } },
        sessions: {
          where: { status: { in: ["PLAYING", "PAUSED", "TIME_UP"] } },
          include: sessionInclude,
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    }),
    client.session.findMany({
      where: {
        createdAt: { gte: start, lt: end },
        paymentStatus: { in: ["PAID", "REFUNDED"] }
      },
      include: sessionInclude
    })
  ]);

  return {
    settings,
    generatedAt: now.toISOString(),
    tables,
    stats: calculateStats(sessions, now)
  };
}

export function calculateStats(sessions: Array<Prisma.SessionGetPayload<{ include: typeof sessionInclude }>>, now = new Date()) {
  const paidSessions = sessions.filter((session) => session.paymentStatus === "PAID" && session.status !== "CANCELLED");
  const revenue = paidSessions.reduce((sum, session) => sum + session.finalAmount, 0);
  const activeSessions = paidSessions.filter((session) => ["PLAYING", "PAUSED", "TIME_UP"].includes(session.status)).length;
  const playingSeconds = paidSessions.reduce((sum, session) => {
    const end = session.completedAt ?? (session.status === "PLAYING" ? now : session.endsAt);
    return sum + Math.max(0, Math.min(end.getTime(), now.getTime()) - session.startedAt.getTime()) / 1000;
  }, 0);
  const byMethod = { CASH: 0, UPI: 0, CARD: 0 };
  const byGame: Record<string, number> = {};
  const byTable: Record<string, number> = {};

  for (const session of paidSessions) {
    byGame[session.gameTable.gameType] = (byGame[session.gameTable.gameType] ?? 0) + session.finalAmount;
    byTable[session.gameTable.name] = (byTable[session.gameTable.name] ?? 0) + session.finalAmount;
    for (const payment of session.payments) {
      if (payment.paymentStatus === "PAID") byMethod[payment.paymentMethod] += payment.amount;
    }
  }

  return {
    revenue,
    sessions: paidSessions.length,
    playingHours: Number((playingSeconds / 3600).toFixed(2)),
    activeSessions,
    cashCollected: byMethod.CASH,
    upiCollected: byMethod.UPI,
    cardCollected: byMethod.CARD,
    revenueByGame: byGame,
    revenueByTable: byTable
  };
}

export async function getHistory(filters: {
  date?: string;
  game?: string;
  paymentMethod?: PaymentMethod;
  customer?: string;
  bill?: string;
  status?: SessionStatus;
}, client: PrismaClient = prisma) {
  const where: Prisma.SessionWhereInput = {};
  if (filters.date) {
    const { start, end } = rangeForBusinessDate(filters.date);
    where.createdAt = { gte: start, lt: end };
  }
  if (filters.customer) {
    where.OR = [
      { customerName: containsText(filters.customer) as Prisma.StringNullableFilter<"Session"> },
      { customerPhone: containsText(filters.customer) as Prisma.StringNullableFilter<"Session"> }
    ];
  }
  if (filters.bill) where.sessionNumber = containsText(filters.bill) as Prisma.StringFilter<"Session">;
  if (filters.status) where.status = filters.status;
  if (filters.game) where.gameTable = { gameType: filters.game };
  if (filters.paymentMethod) where.payments = { some: { paymentMethod: filters.paymentMethod } };

  return client.session.findMany({
    where,
    include: sessionInclude,
    orderBy: { createdAt: "desc" },
    take: 200
  });
}

export async function getReport(period: "daily" | "monthly", now = new Date(), client: PrismaClient = prisma) {
  const range = period === "daily" ? todayRange(now) : monthRange(now);
  const sessions = await client.session.findMany({
    where: { createdAt: { gte: range.start, lt: range.end } },
    include: sessionInclude
  });
  const stats = calculateStats(sessions, now);
  const cancelled = sessions.filter((session) => session.status === "CANCELLED").length;
  const refunded = sessions.filter((session) => session.paymentStatus === "REFUNDED").length;
  const totalMinutesSold = sessions.reduce((sum, session) => {
    const extensionMinutes = session.extensions.reduce((extensionSum, extension) => extensionSum + extension.durationMinutes, 0);
    return sum + session.originalDurationMinutes + extensionMinutes;
  }, 0);
  const totalExtensions = sessions.reduce((sum, session) => sum + session.extensions.length, 0);

  return {
    period,
    range,
    stats,
    totalMinutesSold,
    totalExtensions,
    cancelled,
    refunded,
    sessions
  };
}
