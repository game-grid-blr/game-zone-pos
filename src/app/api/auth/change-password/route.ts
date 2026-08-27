import { z } from "zod";
import { changePassword } from "@/lib/auth";
import { apiUser, jsonError, ok } from "@/lib/api";

const schema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8),
    confirmPassword: z.string().min(8)
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: "New passwords do not match",
    path: ["confirmPassword"]
  });

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const data = schema.parse(await request.json());
    await changePassword(user.id, data.currentPassword, data.newPassword);
    return ok({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
