import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";
import { currentUser } from "./auth";
import { PosError } from "./session-service";
import { hasRole } from "./permissions";

export async function apiUser(roles?: Role[]) {
  const user = await currentUser();
  if (!user) throw new PosError("Authentication required", 401);
  if (!hasRole(user.role, roles)) throw new PosError("Permission denied", 403);
  return user;
}

export function jsonError(error: unknown) {
  if (error instanceof PosError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    "message" in error &&
    typeof error.status === "number" &&
    typeof error.message === "string"
  ) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
}

export function ok<T>(data: T) {
  return NextResponse.json(data, {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
