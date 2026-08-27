const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const statements = [
  "PRAGMA foreign_keys = ON",
  `CREATE TABLE IF NOT EXISTS GameTable (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    gameType TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'AVAILABLE',
    active BOOLEAN NOT NULL DEFAULT true,
    sortOrder INTEGER NOT NULL DEFAULT 0,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS Pricing (
    id TEXT NOT NULL PRIMARY KEY,
    gameTableId TEXT NOT NULL,
    durationMinutes INTEGER NOT NULL,
    price INTEGER NOT NULL,
    active BOOLEAN NOT NULL DEFAULT true,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    CONSTRAINT Pricing_gameTableId_fkey FOREIGN KEY (gameTableId) REFERENCES GameTable (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS Pricing_gameTableId_durationMinutes_key ON Pricing(gameTableId, durationMinutes)`,
  `CREATE INDEX IF NOT EXISTS GameTable_active_sortOrder_idx ON GameTable(active, sortOrder)`,
  `CREATE INDEX IF NOT EXISTS GameTable_gameType_idx ON GameTable(gameType)`,
  `CREATE INDEX IF NOT EXISTS Pricing_gameTableId_active_idx ON Pricing(gameTableId, active)`,
  `CREATE TABLE IF NOT EXISTS Session (
    id TEXT NOT NULL PRIMARY KEY,
    idempotencyKey TEXT,
    sessionNumber TEXT NOT NULL,
    gameTableId TEXT NOT NULL,
    customerName TEXT,
    customerPhone TEXT,
    startedAt DATETIME NOT NULL,
    endsAt DATETIME NOT NULL,
    pausedAt DATETIME,
    remainingSecondsAtPause INTEGER,
    originalDurationMinutes INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLAYING',
    baseAmount INTEGER NOT NULL,
    discountAmount INTEGER NOT NULL DEFAULT 0,
    taxAmount INTEGER NOT NULL DEFAULT 0,
    finalAmount INTEGER NOT NULL,
    paymentStatus TEXT NOT NULL DEFAULT 'PAID',
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL,
    completedAt DATETIME,
    cancelledAt DATETIME,
    refundAmount INTEGER NOT NULL DEFAULT 0,
    refundReason TEXT,
    refundedAt DATETIME,
    CONSTRAINT Session_gameTableId_fkey FOREIGN KEY (gameTableId) REFERENCES GameTable (id) ON DELETE RESTRICT ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS Session_sessionNumber_key ON Session(sessionNumber)`,
  `CREATE INDEX IF NOT EXISTS Session_gameTableId_status_idx ON Session(gameTableId, status)`,
  `CREATE INDEX IF NOT EXISTS Session_createdAt_idx ON Session(createdAt)`,
  `CREATE INDEX IF NOT EXISTS Session_paymentStatus_idx ON Session(paymentStatus)`,
  `CREATE INDEX IF NOT EXISTS Session_sessionNumber_idx ON Session(sessionNumber)`,
  `CREATE INDEX IF NOT EXISTS Session_customerName_idx ON Session(customerName)`,
  `CREATE INDEX IF NOT EXISTS Session_customerPhone_idx ON Session(customerPhone)`,
  `CREATE TABLE IF NOT EXISTS ActiveTableLock (
    id TEXT NOT NULL PRIMARY KEY,
    gameTableId TEXT NOT NULL,
    sessionId TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ActiveTableLock_gameTableId_fkey FOREIGN KEY (gameTableId) REFERENCES GameTable (id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT ActiveTableLock_sessionId_fkey FOREIGN KEY (sessionId) REFERENCES Session (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ActiveTableLock_gameTableId_key ON ActiveTableLock(gameTableId)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS ActiveTableLock_sessionId_key ON ActiveTableLock(sessionId)`,
  `CREATE TABLE IF NOT EXISTS SessionExtension (
    id TEXT NOT NULL PRIMARY KEY,
    idempotencyKey TEXT,
    sessionId TEXT NOT NULL,
    durationMinutes INTEGER NOT NULL,
    amount INTEGER NOT NULL,
    taxAmount INTEGER NOT NULL DEFAULT 0,
    paymentMethod TEXT NOT NULL,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT SessionExtension_sessionId_fkey FOREIGN KEY (sessionId) REFERENCES Session (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS SessionExtension_sessionId_idx ON SessionExtension(sessionId)`,
  `CREATE INDEX IF NOT EXISTS SessionExtension_createdAt_idx ON SessionExtension(createdAt)`,
  `CREATE TABLE IF NOT EXISTS Payment (
    id TEXT NOT NULL PRIMARY KEY,
    idempotencyKey TEXT,
    sessionId TEXT NOT NULL,
    amount INTEGER NOT NULL,
    paymentMethod TEXT NOT NULL,
    paymentStatus TEXT NOT NULL DEFAULT 'PAID',
    transactionReference TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    refundedAt DATETIME,
    refundAmount INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT Payment_sessionId_fkey FOREIGN KEY (sessionId) REFERENCES Session (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS Payment_sessionId_idx ON Payment(sessionId)`,
  `CREATE INDEX IF NOT EXISTS Payment_paymentMethod_idx ON Payment(paymentMethod)`,
  `CREATE INDEX IF NOT EXISTS Payment_paymentStatus_idx ON Payment(paymentStatus)`,
  `CREATE INDEX IF NOT EXISTS Payment_createdAt_idx ON Payment(createdAt)`,
  `CREATE TABLE IF NOT EXISTS User (
    id TEXT NOT NULL PRIMARY KEY,
    name TEXT NOT NULL,
    username TEXT NOT NULL,
    passwordHash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'STAFF',
    active BOOLEAN NOT NULL DEFAULT true,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updatedAt DATETIME NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS User_username_key ON User(username)`,
  `CREATE INDEX IF NOT EXISTS User_role_active_idx ON User(role, active)`,
  `CREATE TABLE IF NOT EXISTS AuditLog (
    id TEXT NOT NULL PRIMARY KEY,
    userId TEXT,
    action TEXT NOT NULL,
    entityType TEXT NOT NULL,
    entityId TEXT NOT NULL,
    sessionId TEXT,
    metadata TEXT,
    createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT AuditLog_userId_fkey FOREIGN KEY (userId) REFERENCES User (id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT AuditLog_sessionId_fkey FOREIGN KEY (sessionId) REFERENCES Session (id) ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS AuditLog_userId_idx ON AuditLog(userId)`,
  `CREATE INDEX IF NOT EXISTS AuditLog_entityType_entityId_idx ON AuditLog(entityType, entityId)`,
  `CREATE INDEX IF NOT EXISTS AuditLog_createdAt_idx ON AuditLog(createdAt)`,
  `CREATE TABLE IF NOT EXISTS AppSetting (
    key TEXT NOT NULL PRIMARY KEY,
    value TEXT NOT NULL,
    updatedAt DATETIME NOT NULL
  )`
];

const idempotencyColumns = [
  ["Session", "idempotencyKey", "idempotencyKey TEXT"],
  ["SessionExtension", "idempotencyKey", "idempotencyKey TEXT"],
  ["Payment", "idempotencyKey", "idempotencyKey TEXT"]
];

const idempotencyIndexes = [
  `CREATE UNIQUE INDEX IF NOT EXISTS Session_idempotencyKey_key ON Session(idempotencyKey)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS SessionExtension_idempotencyKey_key ON SessionExtension(idempotencyKey)`,
  `CREATE UNIQUE INDEX IF NOT EXISTS Payment_idempotencyKey_key ON Payment(idempotencyKey)`
];

async function addColumnIfMissing(table, column, definition) {
  const columns = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  if (!columns.some((item) => item.name === column)) {
    await prisma.$executeRawUnsafe(`ALTER TABLE ${table} ADD COLUMN ${definition}`);
  }
}

async function main() {
  for (const statement of statements) {
    await prisma.$executeRawUnsafe(statement);
  }
  for (const [table, column, definition] of idempotencyColumns) {
    await addColumnIfMissing(table, column, definition);
  }
  for (const statement of idempotencyIndexes) {
    await prisma.$executeRawUnsafe(statement);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    console.log("SQLite schema is ready.");
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
