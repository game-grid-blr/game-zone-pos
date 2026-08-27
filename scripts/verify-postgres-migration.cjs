const { existsSync } = require("node:fs");
const { resolve } = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { PrismaClient } = require("@prisma/client");

const sqlitePath = resolve(process.cwd(), process.env.SQLITE_SOURCE_PATH || "prisma/dev.db");
const databaseUrl = process.env.DATABASE_URL || "";

if (!existsSync(sqlitePath)) {
  console.error(`SQLite source database not found: ${sqlitePath}`);
  process.exit(1);
}

if (!/^postgres(?:ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must point to PostgreSQL before verifying migration.");
  process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });
const failures = [];

const specs = [
  {
    table: "User",
    delegate: "user",
    key: "id",
    fields: ["id", "name", "username", "passwordHash", "role", "active", "createdAt", "updatedAt"],
    dates: ["createdAt", "updatedAt"],
    booleans: ["active"]
  },
  {
    table: "GameTable",
    delegate: "gameTable",
    key: "id",
    fields: ["id", "name", "gameType", "status", "active", "sortOrder", "createdAt", "updatedAt"],
    dates: ["createdAt", "updatedAt"],
    booleans: ["active"]
  },
  {
    table: "Pricing",
    delegate: "pricing",
    key: "id",
    fields: ["id", "gameTableId", "durationMinutes", "price", "active", "createdAt", "updatedAt"],
    dates: ["createdAt", "updatedAt"],
    booleans: ["active"]
  },
  {
    table: "Session",
    delegate: "session",
    key: "id",
    fields: [
      "id",
      "idempotencyKey",
      "sessionNumber",
      "gameTableId",
      "customerName",
      "customerPhone",
      "startedAt",
      "endsAt",
      "pausedAt",
      "remainingSecondsAtPause",
      "originalDurationMinutes",
      "status",
      "baseAmount",
      "discountAmount",
      "taxAmount",
      "finalAmount",
      "paymentStatus",
      "createdAt",
      "updatedAt",
      "completedAt",
      "cancelledAt",
      "refundAmount",
      "refundReason",
      "refundedAt"
    ],
    dates: ["startedAt", "endsAt", "pausedAt", "createdAt", "updatedAt", "completedAt", "cancelledAt", "refundedAt"]
  },
  {
    table: "ActiveTableLock",
    delegate: "activeTableLock",
    key: "id",
    fields: ["id", "gameTableId", "sessionId", "createdAt"],
    dates: ["createdAt"]
  },
  {
    table: "SessionExtension",
    delegate: "sessionExtension",
    key: "id",
    fields: ["id", "idempotencyKey", "sessionId", "durationMinutes", "amount", "taxAmount", "paymentMethod", "createdAt"],
    dates: ["createdAt"]
  },
  {
    table: "Payment",
    delegate: "payment",
    key: "id",
    fields: [
      "id",
      "idempotencyKey",
      "sessionId",
      "amount",
      "paymentMethod",
      "paymentStatus",
      "transactionReference",
      "createdAt",
      "refundedAt",
      "refundAmount"
    ],
    dates: ["createdAt", "refundedAt"]
  },
  {
    table: "AppSetting",
    delegate: "appSetting",
    key: "key",
    fields: ["key", "value", "updatedAt"],
    dates: ["updatedAt"]
  },
  {
    table: "AuditLog",
    delegate: "auditLog",
    key: "id",
    fields: ["id", "userId", "action", "entityType", "entityId", "sessionId", "metadata", "createdAt"],
    dates: ["createdAt"]
  }
];

function quote(value) {
  return `"${value.replaceAll('"', '""')}"`;
}

function tableColumns(table) {
  return new Set(sqlite.prepare(`PRAGMA table_info(${quote(table)})`).all().map((column) => column.name));
}

function sqliteRows(spec) {
  const available = tableColumns(spec.table);
  const select = spec.fields
    .map((field) => (available.has(field) ? quote(field) : `NULL AS ${quote(field)}`))
    .join(", ");
  return sqlite.prepare(`SELECT ${select} FROM ${quote(spec.table)} ORDER BY ${quote(spec.key)}`).all();
}

function dateMillis(value) {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (/^\d+$/.test(String(value))) return Number(value);
  return new Date(value).getTime();
}

function normalize(spec, field, value) {
  if (spec.dates?.includes(field)) return dateMillis(value);
  if (spec.booleans?.includes(field)) return Boolean(value);
  return value ?? null;
}

function addFailure(message) {
  failures.push(message);
}

async function compareCounts() {
  const counts = {};
  for (const spec of specs) {
    const sqliteCount = sqlite.prepare(`SELECT COUNT(*) AS count FROM ${quote(spec.table)}`).get().count;
    const postgresCount = await prisma[spec.delegate].count();
    counts[spec.table] = { sqlite: sqliteCount, postgres: postgresCount };
    if (sqliteCount !== postgresCount) addFailure(`${spec.table} count mismatch: SQLite ${sqliteCount}, PostgreSQL ${postgresCount}`);
  }
  console.table(counts);
}

async function compareRows() {
  for (const spec of specs) {
    const sourceRows = sqliteRows(spec);
    const destinationRows = await prisma[spec.delegate].findMany();
    const destinationByKey = new Map(destinationRows.map((row) => [row[spec.key], row]));

    for (const sourceRow of sourceRows) {
      const destinationRow = destinationByKey.get(sourceRow[spec.key]);
      if (!destinationRow) {
        addFailure(`${spec.table} missing row ${sourceRow[spec.key]} in PostgreSQL`);
        continue;
      }

      for (const field of spec.fields) {
        const sourceValue = normalize(spec, field, sourceRow[field]);
        const destinationValue = normalize(spec, field, destinationRow[field]);
        if (sourceValue !== destinationValue) {
          addFailure(`${spec.table}.${field} mismatch for ${sourceRow[spec.key]}: SQLite ${sourceValue}, PostgreSQL ${destinationValue}`);
        }
      }
    }
  }
}

async function verifyRelationships() {
  const [users, gameTables, sessions, pricing, locks, extensions, payments, audits] = await Promise.all([
    prisma.user.findMany({ select: { id: true } }),
    prisma.gameTable.findMany({ select: { id: true } }),
    prisma.session.findMany({ select: { id: true, gameTableId: true } }),
    prisma.pricing.findMany({ select: { id: true, gameTableId: true } }),
    prisma.activeTableLock.findMany({ select: { id: true, gameTableId: true, sessionId: true } }),
    prisma.sessionExtension.findMany({ select: { id: true, sessionId: true } }),
    prisma.payment.findMany({ select: { id: true, sessionId: true } }),
    prisma.auditLog.findMany({ select: { id: true, userId: true, sessionId: true } })
  ]);

  const userIds = new Set(users.map((row) => row.id));
  const gameTableIds = new Set(gameTables.map((row) => row.id));
  const sessionIds = new Set(sessions.map((row) => row.id));

  for (const row of sessions) {
    if (!gameTableIds.has(row.gameTableId)) addFailure(`Session ${row.id} references missing GameTable ${row.gameTableId}`);
  }
  for (const row of pricing) {
    if (!gameTableIds.has(row.gameTableId)) addFailure(`Pricing ${row.id} references missing GameTable ${row.gameTableId}`);
  }
  for (const row of locks) {
    if (!gameTableIds.has(row.gameTableId)) addFailure(`ActiveTableLock ${row.id} references missing GameTable ${row.gameTableId}`);
    if (!sessionIds.has(row.sessionId)) addFailure(`ActiveTableLock ${row.id} references missing Session ${row.sessionId}`);
  }
  for (const row of extensions) {
    if (!sessionIds.has(row.sessionId)) addFailure(`SessionExtension ${row.id} references missing Session ${row.sessionId}`);
  }
  for (const row of payments) {
    if (!sessionIds.has(row.sessionId)) addFailure(`Payment ${row.id} references missing Session ${row.sessionId}`);
  }
  for (const row of audits) {
    if (row.userId && !userIds.has(row.userId)) addFailure(`AuditLog ${row.id} references missing User ${row.userId}`);
    if (row.sessionId && !sessionIds.has(row.sessionId)) addFailure(`AuditLog ${row.id} references missing Session ${row.sessionId}`);
  }
}

async function verifyExpectedCurrentData() {
  const completedSessions = sqliteRows(specs.find((spec) => spec.table === "Session")).filter((row) => row.status === "COMPLETED");
  const payments = sqliteRows(specs.find((spec) => spec.table === "Payment"));

  if (completedSessions.length !== 2) addFailure(`Expected 2 completed source sessions, found ${completedSessions.length}`);
  if (payments.length !== 2) addFailure(`Expected 2 source payments, found ${payments.length}`);

  for (const session of completedSessions) {
    const destination = await prisma.session.findUnique({ where: { id: session.id } });
    if (!destination) addFailure(`Completed session ${session.id} missing in PostgreSQL`);
    else if (destination.status !== "COMPLETED" || destination.paymentStatus !== session.paymentStatus) {
      addFailure(`Completed session ${session.id} status mismatch`);
    }
  }

  for (const payment of payments) {
    const destination = await prisma.payment.findUnique({ where: { id: payment.id } });
    if (!destination) addFailure(`Payment ${payment.id} missing in PostgreSQL`);
    else if (destination.sessionId !== payment.sessionId || destination.amount !== payment.amount) {
      addFailure(`Payment ${payment.id} details mismatch`);
    }
  }
}

async function main() {
  await compareCounts();
  await compareRows();
  await verifyRelationships();
  await verifyExpectedCurrentData();

  if (failures.length) {
    console.error("Migration verification failed:");
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
    return;
  }

  console.log("Migration verification passed.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
