import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { shouldTriggerExpiry, shouldTriggerWarning } from "../src/lib/alarm";
import { getSettings } from "../src/lib/settings";
import {
  cancelSession,
  extendSession,
  getReport,
  markTimeUp,
  refundSession,
  startSession
} from "../src/lib/session-service";
import { remainingSeconds } from "../src/lib/time";

const prisma = new PrismaClient();

async function resetDb() {
  await prisma.auditLog.deleteMany();
  await prisma.activeTableLock.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.sessionExtension.deleteMany();
  await prisma.session.deleteMany();
  await prisma.pricing.deleteMany();
  await prisma.gameTable.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.user.deleteMany();
}

async function seedBase() {
  const admin = await prisma.user.create({
    data: {
      name: "Admin",
      username: "admin",
      passwordHash: await bcrypt.hash("<TEST_ADMIN_PASSWORD>", 4),
      role: "ADMIN"
    }
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "businessName", value: "Fort Game Zone" },
      { key: "currency", value: "INR" },
      { key: "taxEnabled", value: "false" },
      { key: "taxRatePercent", value: "0" },
      { key: "durationOptions", value: JSON.stringify([15, 30, 45, 60]) },
      { key: "warningTimeMinutes", value: "5" },
      { key: "paymentMethods", value: JSON.stringify(["CASH", "UPI", "CARD"]) }
    ]
  });

  const pool = await prisma.gameTable.create({
    data: {
      name: "Pool Table 1",
      gameType: "Pool",
      sortOrder: 1,
      pricing: {
        createMany: {
          data: [
            { durationMinutes: 15, price: 10000 },
            { durationMinutes: 30, price: 18000 },
            { durationMinutes: 45, price: 25000 },
            { durationMinutes: 60, price: 32000 }
          ]
        }
      }
    }
  });

  const carrom = await prisma.gameTable.create({
    data: {
      name: "Carrom",
      gameType: "Carrom",
      sortOrder: 2,
      pricing: {
        createMany: {
          data: [
            { durationMinutes: 15, price: 5000 },
            { durationMinutes: 30, price: 9000 },
            { durationMinutes: 60, price: 16000 }
          ]
        }
      }
    }
  });

  return { admin, pool, carrom };
}

beforeAll(async () => {
  await prisma.$connect();
});

beforeEach(async () => {
  await resetDb();
});

describe("session service", () => {
  it("starts a 60-minute session and creates bill/payment", async () => {
    const { admin, pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession(
      {
        gameTableId: pool.id,
        durationMinutes: 60,
        paymentMethod: "CASH",
        customerName: "Aarav",
        userId: admin.id,
        now
      },
      prisma
    );

    expect(session.status).toBe("PLAYING");
    expect(session.baseAmount).toBe(32000);
    expect(session.finalAmount).toBe(32000);
    expect(session.payments[0].paymentMethod).toBe("CASH");
    expect(session.endsAt.getTime() - session.startedAt.getTime()).toBe(60 * 60 * 1000);
  });

  it("reconstructs timer after refresh or reopen from persisted endsAt", async () => {
    const { pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession({ gameTableId: pool.id, durationMinutes: 60, paymentMethod: "UPI", now }, prisma);
    const afterRefresh = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });
    const reopenedAt = new Date("2026-08-27T10:20:00.000Z");

    expect(remainingSeconds(afterRefresh.endsAt, reopenedAt)).toBe(40 * 60);
  });

  it("marks an expired session as TIME_UP and keeps table locked", async () => {
    const { pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CARD", now }, prisma);
    const expired = await markTimeUp(session.id, undefined, new Date("2026-08-27T10:15:01.000Z"), prisma);
    const lock = await prisma.activeTableLock.findUnique({ where: { gameTableId: pool.id } });

    expect(expired.status).toBe("TIME_UP");
    expect(lock?.sessionId).toBe(session.id);
  });

  it("identifies warning and expiry alarm conditions", () => {
    expect(shouldTriggerWarning(300, 300, false)).toBe(true);
    expect(shouldTriggerWarning(299, 300, true)).toBe(false);
    expect(shouldTriggerExpiry(0, false)).toBe(true);
  });

  it("extends an active session by 15 minutes", async () => {
    const { pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession({ gameTableId: pool.id, durationMinutes: 30, paymentMethod: "CASH", now }, prisma);
    const extended = await extendSession(
      { sessionId: session.id, durationMinutes: 15, paymentMethod: "UPI", now: new Date("2026-08-27T10:20:00.000Z") },
      prisma
    );

    expect(remainingSeconds(extended.endsAt, new Date("2026-08-27T10:20:00.000Z"))).toBe(25 * 60);
    expect(extended.extensions).toHaveLength(1);
    expect(extended.finalAmount).toBe(28000);
  });

  it("extends a TIME_UP session from the current time", async () => {
    const { pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CASH", now }, prisma);
    await markTimeUp(session.id, undefined, new Date("2026-08-27T10:16:00.000Z"), prisma);
    const extended = await extendSession(
      { sessionId: session.id, durationMinutes: 15, paymentMethod: "CASH", now: new Date("2026-08-27T10:20:00.000Z") },
      prisma
    );

    expect(extended.status).toBe("PLAYING");
    expect(remainingSeconds(extended.endsAt, new Date("2026-08-27T10:20:00.000Z"))).toBe(15 * 60);
  });

  it("prevents two simultaneous sessions on the same table", async () => {
    const { pool } = await seedBase();
    await startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CASH" }, prisma);

    await expect(startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "UPI" }, prisma)).rejects.toThrow(
      "This table already has an active session"
    );
  });

  it("supports cancel, refund, and daily revenue totals", async () => {
    const { pool, carrom } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const paid = await startSession({ gameTableId: pool.id, durationMinutes: 60, paymentMethod: "CASH", now }, prisma);
    await startSession({ gameTableId: carrom.id, durationMinutes: 60, paymentMethod: "CARD", now }, prisma);

    await refundSession(paid.id, "Customer left", undefined, now, prisma);
    const report = await getReport("daily", now, prisma);

    expect(report.refunded).toBe(1);
    expect(report.stats.revenue).toBe(16000);
    expect(report.stats.cardCollected).toBe(16000);
  });

  it("uses different pricing for different games and reports cash vs UPI vs card", async () => {
    const { pool, carrom } = await seedBase();
    const now = new Date("2026-08-27T11:00:00.000Z");
    await startSession({ gameTableId: pool.id, durationMinutes: 30, paymentMethod: "CASH", now }, prisma);
    await startSession({ gameTableId: carrom.id, durationMinutes: 30, paymentMethod: "UPI", now }, prisma);
    await cancelSession((await prisma.session.findFirstOrThrow({ where: { gameTableId: carrom.id } })).id, undefined, now, prisma);

    const report = await getReport("daily", now, prisma);
    const settings = await getSettings(prisma);

    expect(settings.durationOptions).toContain(60);
    expect(report.stats.cashCollected).toBe(18000);
    expect(report.stats.upiCollected).toBe(0);
    expect(report.cancelled).toBe(1);
    expect(report.stats.revenueByGame.Pool).toBe(18000);
  });
});
