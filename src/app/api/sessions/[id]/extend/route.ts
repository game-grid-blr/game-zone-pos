import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { apiUser, jsonError, ok } from "@/lib/api";
import { extendSession } from "@/lib/session-service";

const schema = z.object({
  durationMinutes: z.coerce.number().int().positive(),
  idempotencyKey: z.string().min(12).max(128),
  paymentMethod: z.nativeEnum(PaymentMethod),
  amount: z.coerce.number().int().min(0).optional()
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    const { id } = await context.params;
    const data = schema.parse(await request.json());
    const session = await extendSession({ ...data, sessionId: id, userId: user.id });
    return ok({ session });
  } catch (error) {
    return jsonError(error);
  }
}
