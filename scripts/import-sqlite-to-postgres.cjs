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
  console.error("DATABASE_URL must point to PostgreSQL before importing SQLite data.");
  process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(sqlitePath, { readOnly: true });

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

function rowsFor(spec) {
  const available = tableColumns(spec.table);
  const select = spec.fields
    .map((field) => (available.has(field) ? quote(field) : `NULL AS ${quote(field)}`))
    .join(", ");
  return sqlite.prepare(`SELECT ${select} FROM ${quote(spec.table)} ORDER BY ${quote(spec.key)}`).all();
}

function toDate(value) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return new Date(value);
  if (/^\d+$/.test(String(value))) return new Date(Number(value));
  return new Date(value);
}

function normalize(spec, row) {
  const data = {};
  for (const field of spec.fields) {
    const value = row[field];
    if (spec.dates?.includes(field)) data[field] = toDate(value);
    else if (spec.booleans?.includes(field)) data[field] = Boolean(value);
    else data[field] = value ?? null;
  }
  return data;
}

async function upsertRows(spec) {
  const rows = rowsFor(spec);
  const delegate = prisma[spec.delegate];
  for (const row of rows) {
    const data = normalize(spec, row);
    await delegate.upsert({
      where: { [spec.key]: row[spec.key] },
      create: data,
      update: data
    });
  }
  return rows.length;
}

async function main() {
  const imported = {};
  for (const spec of specs) {
    imported[spec.table] = await upsertRows(spec);
  }
  console.log("SQLite to PostgreSQL import complete.");
  console.table(imported);
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
