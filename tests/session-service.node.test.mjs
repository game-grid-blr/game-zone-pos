import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { shouldTriggerExpiry, shouldTriggerWarning } from "../src/lib/alarm.ts";
import { hasRole } from "../src/lib/permissions.ts";
import { receiptSummary } from "../src/lib/receipt.ts";
import { getSettings } from "../src/lib/settings.ts";
import {
  cancelSession,
  extendSession,
  getDashboardData,
  getHistory,
  getReport,
  markTimeUp,
  refundSession,
  startSession
} from "../src/lib/session-service.ts";
import { remainingSeconds } from "../src/lib/time.ts";

process.env.BUSINESS_TIMEZONE = "Asia/Kolkata";

const prisma = new PrismaClient();
const databaseUrl = process.env.DATABASE_URL ?? "";

if (/^postgres(?:ql)?:\/\//i.test(databaseUrl) && process.env.FGZ_ALLOW_DB_RESET !== "true") {
  throw new Error("Refusing to reset a PostgreSQL database unless FGZ_ALLOW_DB_RESET=true is set.");
}

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

  const staff = await prisma.user.create({
    data: {
      name: "Staff",
      username: "staff",
      passwordHash: await bcrypt.hash("<TEST_STAFF_PASSWORD>", 4),
      role: "STAFF"
    }
  });

  await prisma.appSetting.createMany({
    data: [
      { key: "businessName", value: "Fort Game Zone" },
      { key: "businessAddress", value: "Indoor Games, Main Road" },
      { key: "businessPhone", value: "+91 98765 43210" },
      { key: "currency", value: "INR" },
      { key: "taxEnabled", value: "false" },
      { key: "taxRatePercent", value: "0" },
      { key: "durationOptions", value: JSON.stringify([15, 30, 45, 60]) },
      { key: "warningTimeMinutes", value: "5" },
      { key: "paymentMethods", value: JSON.stringify(["CASH", "UPI", "CARD"]) },
      { key: "receiptFooter", value: "Thanks for playing at Fort Game Zone" }
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

  return { admin, staff, pool, carrom };
}

test.before(async () => {
  await prisma.$connect();
});

test.after(async () => {
  await prisma.$disconnect();
});

test.beforeEach(async () => {
  await resetDb();
});

for (const [minutes, amount] of [
  [15, 10000],
  [30, 18000],
  [60, 32000]
]) {
  test(`creates a ${minutes}-minute session`, async () => {
    const { admin, pool } = await seedBase();
    const now = new Date("2026-08-27T10:00:00.000Z");
    const session = await startSession(
      {
        gameTableId: pool.id,
        durationMinutes: minutes,
        paymentMethod: "CASH",
        customerName: "Aarav",
        idempotencyKey: `start-${minutes}`,
        userId: admin.id,
        now
      },
      prisma
    );

    assert.equal(session.status, "PLAYING");
    assert.equal(session.baseAmount, amount);
    assert.equal(session.finalAmount, amount);
    assert.equal(session.payments.length, 1);
    assert.equal(session.payments[0].paymentMethod, "CASH");
    assert.equal(session.endsAt.getTime() - session.startedAt.getTime(), minutes * 60 * 1000);
  });
}

test("reconstructs timer after page refresh from persisted endsAt", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const session = await startSession({ gameTableId: pool.id, durationMinutes: 60, paymentMethod: "UPI", now }, prisma);
  const afterRefresh = await prisma.session.findUniqueOrThrow({ where: { id: session.id } });

  assert.equal(remainingSeconds(afterRefresh.endsAt, new Date("2026-08-27T10:20:00.000Z")), 40 * 60);
});

test("reopens dashboard with the active session still attached to its table", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const session = await startSession({ gameTableId: pool.id, durationMinutes: 30, paymentMethod: "CARD", now }, prisma);
  const dashboard = await getDashboardData(prisma, new Date("2026-08-27T10:05:00.000Z"));
  const table = dashboard.tables.find((item) => item.id === pool.id);

  assert.equal(table?.sessions?.[0]?.id, session.id);
  assert.equal(table?.sessions?.[0]?.status, "PLAYING");
});

test("marks a timer as TIME_UP at zero and keeps the table locked", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const session = await startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CARD", now }, prisma);
  const expired = await markTimeUp(session.id, undefined, new Date("2026-08-27T10:15:01.000Z"), prisma);
  const lock = await prisma.activeTableLock.findUnique({ where: { gameTableId: pool.id } });

  assert.equal(expired.status, "TIME_UP");
  assert.equal(lock?.sessionId, session.id);
});

test("identifies warning and expiry alarm conditions", () => {
  assert.equal(shouldTriggerWarning(300, 300, false), true);
  assert.equal(shouldTriggerWarning(299, 300, true), false);
  assert.equal(shouldTriggerExpiry(0, false), true);
});

test("extends an active session by 15 minutes", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const session = await startSession({ gameTableId: pool.id, durationMinutes: 30, paymentMethod: "CASH", now }, prisma);
  const extended = await extendSession(
    {
      sessionId: session.id,
      durationMinutes: 15,
      paymentMethod: "UPI",
      idempotencyKey: "extend-active-15",
      now: new Date("2026-08-27T10:20:00.000Z")
    },
    prisma
  );

  assert.equal(remainingSeconds(extended.endsAt, new Date("2026-08-27T10:20:00.000Z")), 25 * 60);
  assert.equal(extended.extensions.length, 1);
  assert.equal(extended.payments.length, 2);
  assert.equal(extended.finalAmount, 28000);
});

test("extends a TIME_UP session from the current time", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const session = await startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CASH", now }, prisma);
  await markTimeUp(session.id, undefined, new Date("2026-08-27T10:16:00.000Z"), prisma);
  const extended = await extendSession(
    {
      sessionId: session.id,
      durationMinutes: 15,
      paymentMethod: "CASH",
      idempotencyKey: "extend-time-up-15",
      now: new Date("2026-08-27T10:20:00.000Z")
    },
    prisma
  );

  assert.equal(extended.status, "PLAYING");
  assert.equal(remainingSeconds(extended.endsAt, new Date("2026-08-27T10:20:00.000Z")), 15 * 60);
});

test("allows only one simultaneous start request for the same table", async () => {
  const { pool } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const results = await Promise.allSettled([
    startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CASH", idempotencyKey: "same-table-a", now }, prisma),
    startSession({ gameTableId: pool.id, durationMinutes: 15, paymentMethod: "UPI", idempotencyKey: "same-table-b", now }, prisma)
  ]);

  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await prisma.session.count(), 1);
  assert.equal(await prisma.activeTableLock.count(), 1);
});

test("reuses the original session and payment for duplicate start submissions", async () => {
  const { pool } = await seedBase();
  const input = {
    gameTableId: pool.id,
    durationMinutes: 15,
    paymentMethod: "CASH",
    idempotencyKey: "duplicate-start-key",
    now: new Date("2026-08-27T10:00:00.000Z")
  };

  const first = await startSession(input, prisma);
  const second = await startSession(input, prisma);

  assert.equal(second.id, first.id);
  assert.equal(await prisma.session.count(), 1);
  assert.equal(await prisma.payment.count(), 1);
});

test("reuses the original extension and payment for duplicate extension submissions", async () => {
  const { pool } = await seedBase();
  const session = await startSession(
    { gameTableId: pool.id, durationMinutes: 15, paymentMethod: "CASH", idempotencyKey: "duplicate-extension-start" },
    prisma
  );
  const input = {
    sessionId: session.id,
    durationMinutes: 15,
    paymentMethod: "UPI",
    idempotencyKey: "duplicate-extension-key",
    now: new Date("2026-08-27T10:10:00.000Z")
  };

  const first = await extendSession(input, prisma);
  const second = await extendSession(input, prisma);

  assert.equal(second.id, first.id);
  assert.equal(await prisma.sessionExtension.count(), 1);
  assert.equal(await prisma.payment.count(), 2);
});

test("calculates daily revenue in the Asia/Kolkata business timezone", async () => {
  const { pool, carrom } = await seedBase();
  await startSession(
    {
      gameTableId: pool.id,
      durationMinutes: 15,
      paymentMethod: "CASH",
      now: new Date("2026-08-26T18:31:00.000Z")
    },
    prisma
  );
  await startSession(
    {
      gameTableId: carrom.id,
      durationMinutes: 15,
      paymentMethod: "CARD",
      now: new Date("2026-08-26T18:29:00.000Z")
    },
    prisma
  );

  const report = await getReport("daily", new Date("2026-08-27T06:00:00.000Z"), prisma);

  assert.equal(report.stats.sessions, 1);
  assert.equal(report.stats.revenue, 10000);
});

test("searches history by date, customer, phone, bill, game, status, and payment method", async () => {
  const { pool } = await seedBase();
  const session = await startSession(
    {
      gameTableId: pool.id,
      durationMinutes: 30,
      paymentMethod: "UPI",
      customerName: "Aarav Mehta",
      customerPhone: "98765",
      now: new Date("2026-08-27T10:00:00.000Z")
    },
    prisma
  );

  const byCustomer = await getHistory({ date: "2026-08-27", customer: "Aarav" }, prisma);
  const byPhone = await getHistory({ date: "2026-08-27", customer: "98765" }, prisma);
  const byBill = await getHistory({ date: "2026-08-27", bill: session.sessionNumber.slice(-5) }, prisma);
  const byGameStatusAndMethod = await getHistory({
    date: "2026-08-27",
    game: "Pool",
    status: "PLAYING",
    paymentMethod: "UPI"
  }, prisma);

  assert.equal(byCustomer[0]?.id, session.id);
  assert.equal(byPhone[0]?.id, session.id);
  assert.equal(byBill[0]?.id, session.id);
  assert.equal(byGameStatusAndMethod[0]?.id, session.id);
});

test("generates receipt summary data from a billed session", async () => {
  const { pool } = await seedBase();
  const session = await startSession(
    {
      gameTableId: pool.id,
      durationMinutes: 15,
      paymentMethod: "CASH",
      customerName: "Walk-in",
      idempotencyKey: "receipt-session",
      now: new Date("2026-08-27T10:00:00.000Z")
    },
    prisma
  );
  const extended = await extendSession(
    {
      sessionId: session.id,
      durationMinutes: 15,
      paymentMethod: "UPI",
      idempotencyKey: "receipt-extension",
      now: new Date("2026-08-27T10:10:00.000Z")
    },
    prisma
  );
  const settings = await getSettings(prisma);
  const summary = receiptSummary(extended, settings);

  assert.equal(summary.businessName, "Fort Game Zone");
  assert.equal(summary.billNumber, session.sessionNumber);
  assert.equal(summary.paymentMethods, "CASH, UPI");
  assert.equal(summary.extensionTotal, 10000);
  assert.equal(summary.finalAmount, 20000);
});

test("supports refund and cancellation accounting", async () => {
  const { pool, carrom } = await seedBase();
  const now = new Date("2026-08-27T10:00:00.000Z");
  const paid = await startSession({ gameTableId: pool.id, durationMinutes: 60, paymentMethod: "CASH", now }, prisma);
  const cancelled = await startSession({ gameTableId: carrom.id, durationMinutes: 60, paymentMethod: "CARD", now }, prisma);

  await refundSession(paid.id, "Customer left", undefined, now, prisma);
  await cancelSession(cancelled.id, undefined, now, prisma);
  const report = await getReport("daily", now, prisma);

  assert.equal(report.refunded, 1);
  assert.equal(report.cancelled, 1);
  assert.equal(report.stats.revenue, 0);
});

test("distinguishes admin and staff permissions", () => {
  assert.equal(hasRole("ADMIN", ["ADMIN"]), true);
  assert.equal(hasRole("STAFF", ["ADMIN"]), false);
  assert.equal(hasRole("STAFF", ["ADMIN", "STAFF"]), true);
  assert.equal(hasRole("STAFF"), true);
});
