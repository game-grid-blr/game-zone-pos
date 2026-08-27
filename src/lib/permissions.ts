import type { Role } from "@prisma/client";

export function hasRole(role: Role, allowed?: Role[]) {
  return !allowed || allowed.includes(role);
}
