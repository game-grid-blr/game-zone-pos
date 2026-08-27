-- Fort Game Zone POS production PostgreSQL schema.
-- SQLite local development data is migrated separately by scripts/import-sqlite-to-postgres.cjs.

CREATE TYPE "TableStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'PLAYING', 'PAUSED', 'TIME_UP');
CREATE TYPE "SessionStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'PLAYING', 'PAUSED', 'TIME_UP', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'UPI', 'CARD');
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PAID', 'REFUNDED', 'CANCELLED');
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STAFF');

CREATE TABLE "GameTable" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "gameType" TEXT NOT NULL,
  "status" "TableStatus" NOT NULL DEFAULT 'AVAILABLE',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "GameTable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Pricing" (
  "id" TEXT NOT NULL,
  "gameTableId" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "price" INTEGER NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Pricing_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "sessionNumber" TEXT NOT NULL,
  "gameTableId" TEXT NOT NULL,
  "customerName" TEXT,
  "customerPhone" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "pausedAt" TIMESTAMP(3),
  "remainingSecondsAtPause" INTEGER,
  "originalDurationMinutes" INTEGER NOT NULL,
  "status" "SessionStatus" NOT NULL DEFAULT 'PLAYING',
  "baseAmount" INTEGER NOT NULL,
  "discountAmount" INTEGER NOT NULL DEFAULT 0,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "finalAmount" INTEGER NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "completedAt" TIMESTAMP(3),
  "cancelledAt" TIMESTAMP(3),
  "refundAmount" INTEGER NOT NULL DEFAULT 0,
  "refundReason" TEXT,
  "refundedAt" TIMESTAMP(3),

  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActiveTableLock" (
  "id" TEXT NOT NULL,
  "gameTableId" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ActiveTableLock_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SessionExtension" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "sessionId" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "amount" INTEGER NOT NULL,
  "taxAmount" INTEGER NOT NULL DEFAULT 0,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SessionExtension_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Payment" (
  "id" TEXT NOT NULL,
  "idempotencyKey" TEXT,
  "sessionId" TEXT NOT NULL,
  "amount" INTEGER NOT NULL,
  "paymentMethod" "PaymentMethod" NOT NULL,
  "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
  "transactionReference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "refundedAt" TIMESTAMP(3),
  "refundAmount" INTEGER NOT NULL DEFAULT 0,

  CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
  "id" TEXT NOT NULL,
  "userId" TEXT,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "sessionId" TEXT,
  "metadata" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "username" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'STAFF',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppSetting" (
  "key" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "GameTable_active_sortOrder_idx" ON "GameTable"("active", "sortOrder");
CREATE INDEX "GameTable_gameType_idx" ON "GameTable"("gameType");

CREATE UNIQUE INDEX "Pricing_gameTableId_durationMinutes_key" ON "Pricing"("gameTableId", "durationMinutes");
CREATE INDEX "Pricing_gameTableId_active_idx" ON "Pricing"("gameTableId", "active");

CREATE UNIQUE INDEX "Session_sessionNumber_key" ON "Session"("sessionNumber");
CREATE UNIQUE INDEX "Session_idempotencyKey_key" ON "Session"("idempotencyKey");
CREATE INDEX "Session_gameTableId_status_idx" ON "Session"("gameTableId", "status");
CREATE INDEX "Session_createdAt_idx" ON "Session"("createdAt");
CREATE INDEX "Session_paymentStatus_idx" ON "Session"("paymentStatus");
CREATE INDEX "Session_sessionNumber_idx" ON "Session"("sessionNumber");
CREATE INDEX "Session_customerName_idx" ON "Session"("customerName");
CREATE INDEX "Session_customerPhone_idx" ON "Session"("customerPhone");

CREATE UNIQUE INDEX "ActiveTableLock_gameTableId_key" ON "ActiveTableLock"("gameTableId");
CREATE UNIQUE INDEX "ActiveTableLock_sessionId_key" ON "ActiveTableLock"("sessionId");

CREATE UNIQUE INDEX "SessionExtension_idempotencyKey_key" ON "SessionExtension"("idempotencyKey");
CREATE INDEX "SessionExtension_sessionId_idx" ON "SessionExtension"("sessionId");
CREATE INDEX "SessionExtension_createdAt_idx" ON "SessionExtension"("createdAt");

CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");
CREATE INDEX "Payment_sessionId_idx" ON "Payment"("sessionId");
CREATE INDEX "Payment_paymentMethod_idx" ON "Payment"("paymentMethod");
CREATE INDEX "Payment_paymentStatus_idx" ON "Payment"("paymentStatus");
CREATE INDEX "Payment_createdAt_idx" ON "Payment"("createdAt");

CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_role_active_idx" ON "User"("role", "active");

ALTER TABLE "Pricing"
  ADD CONSTRAINT "Pricing_gameTableId_fkey"
  FOREIGN KEY ("gameTableId") REFERENCES "GameTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Session"
  ADD CONSTRAINT "Session_gameTableId_fkey"
  FOREIGN KEY ("gameTableId") REFERENCES "GameTable"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActiveTableLock"
  ADD CONSTRAINT "ActiveTableLock_gameTableId_fkey"
  FOREIGN KEY ("gameTableId") REFERENCES "GameTable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActiveTableLock"
  ADD CONSTRAINT "ActiveTableLock_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SessionExtension"
  ADD CONSTRAINT "SessionExtension_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "AuditLog"
  ADD CONSTRAINT "AuditLog_sessionId_fkey"
  FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE CASCADE ON UPDATE CASCADE;
