import "server-only";

import bcrypt from "bcryptjs";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role } from "@prisma/client";
import { prisma } from "./prisma";
import { hasRole } from "./permissions";

const COOKIE_NAME = "fgz_session";
const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

type LoginContext = {
  ip?: string;
  userAgent?: string;
};

type LoginAttempt = {
  count: number;
  firstFailedAt: number;
  lockedUntil?: number;
};

const globalForAuth = globalThis as unknown as {
  fgzLoginAttempts?: Map<string, LoginAttempt>;
};

const loginAttempts = globalForAuth.fgzLoginAttempts ?? new Map<string, LoginAttempt>();
globalForAuth.fgzLoginAttempts = loginAttempts;

export class AuthError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

function secret() {
  const value = process.env.AUTH_SECRET?.trim();
  if (!value) throw new AuthError("AUTH_SECRET is required", 500);
  if (process.env.NODE_ENV === "production" && value.length < 32) {
    throw new AuthError("AUTH_SECRET must be at least 32 characters in production", 500);
  }
  return value;
}

async function hmac(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function cookieOptions(maxAge = SESSION_MAX_AGE_SECONDS) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge,
    path: "/"
  };
}

function loginRateKey(username: string, context?: LoginContext) {
  return `${context?.ip ?? "unknown"}:${username.trim().toLowerCase()}`;
}

function checkLoginRateLimit(key: string) {
  const attempt = loginAttempts.get(key);
  if (!attempt) return;
  const now = Date.now();
  if (attempt.lockedUntil && attempt.lockedUntil > now) {
    throw new AuthError("Too many login attempts. Try again later.", 429);
  }
  if (now - attempt.firstFailedAt > LOGIN_WINDOW_MS) loginAttempts.delete(key);
}

function recordLoginFailure(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  const attempt =
    current && now - current.firstFailedAt <= LOGIN_WINDOW_MS
      ? { ...current, count: current.count + 1 }
      : { count: 1, firstFailedAt: now };

  if (attempt.count >= MAX_LOGIN_ATTEMPTS) attempt.lockedUntil = now + LOGIN_LOCK_MS;
  loginAttempts.set(key, attempt);
}

function clearLoginFailures(key: string) {
  loginAttempts.delete(key);
}

async function auditAuth(
  action: string,
  entityId: string,
  userId?: string,
  metadata?: Record<string, unknown>
) {
  await prisma.auditLog.create({
    data: {
      action,
      entityType: "AUTH",
      entityId,
      userId,
      metadata: metadata ? JSON.stringify(metadata) : undefined
    }
  });
}

export async function createSessionCookie(userId: string) {
  const issuedAt = Date.now();
  const payload = `${userId}.${issuedAt}`;
  const signature = await hmac(payload);
  return `${payload}.${signature}`;
}

export async function verifySessionCookie(token?: string) {
  if (!token) return null;
  const [userId, issuedAt, signature] = token.split(".");
  if (!userId || !issuedAt || !signature) return null;
  const expected = await hmac(`${userId}.${issuedAt}`);
  if (!safeEqual(expected, signature)) return null;
  const age = Date.now() - Number(issuedAt);
  if (!Number.isFinite(age) || age > SESSION_MAX_AGE_SECONDS * 1000) return null;
  return prisma.user.findFirst({
    where: { id: userId, active: true },
    select: { id: true, name: true, username: true, role: true }
  });
}

export async function login(username: string, password: string, context?: LoginContext) {
  const normalizedUsername = username.trim();
  const rateKey = loginRateKey(normalizedUsername, context);
  checkLoginRateLimit(rateKey);

  const user = await prisma.user.findFirst({ where: { username: normalizedUsername, active: true } });
  if (!user) {
    recordLoginFailure(rateKey);
    await auditAuth("LOGIN_FAILED", normalizedUsername || "unknown", undefined, {
      reason: "UNKNOWN_USER",
      ip: context?.ip,
      userAgent: context?.userAgent
    });
    return null;
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    recordLoginFailure(rateKey);
    await auditAuth("LOGIN_FAILED", user.id, user.id, {
      reason: "INVALID_PASSWORD",
      username: user.username,
      ip: context?.ip,
      userAgent: context?.userAgent
    });
    return null;
  }

  clearLoginFailures(rateKey);
  const token = await createSessionCookie(user.id);
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, cookieOptions());
  await auditAuth("LOGIN_SUCCESS", user.id, user.id, {
    username: user.username,
    ip: context?.ip,
    userAgent: context?.userAgent
  });
  return { id: user.id, name: user.name, username: user.username, role: user.role };
}

export async function logout() {
  const cookieStore = await cookies();
  const user = await verifySessionCookie(cookieStore.get(COOKIE_NAME)?.value).catch(() => null);
  cookieStore.set(COOKIE_NAME, "", { ...cookieOptions(0), expires: new Date(0) });
  if (user) await auditAuth("LOGOUT", user.id, user.id, { username: user.username });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string) {
  if (newPassword.length < 8) throw new AuthError("New password must be at least 8 characters", 400);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.active) throw new AuthError("User not found", 404);

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) {
    await auditAuth("PASSWORD_CHANGE_FAILED", user.id, user.id, { reason: "INVALID_CURRENT_PASSWORD" });
    throw new AuthError("Current password is incorrect", 400);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await bcrypt.hash(newPassword, 12) }
  });
  await auditAuth("PASSWORD_CHANGED", user.id, user.id, { username: user.username });
}

export async function currentUser() {
  const cookieStore = await cookies();
  return verifySessionCookie(cookieStore.get(COOKIE_NAME)?.value);
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireRole(roles: Role[]) {
  const user = await requireUser();
  if (!hasRole(user.role, roles)) redirect("/dashboard");
  return user;
}
