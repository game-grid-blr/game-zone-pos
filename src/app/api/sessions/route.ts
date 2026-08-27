import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { apiUser, jsonError, ok } from "@/lib/api";
import { prisma } from "@/lib/prisma";
import { reserveTable, startSession } from "@/lib/session-service";

const startSchema = z.object({
  gameTableId: z.string().min(1),
  durationMinutes: z.coerce.number().int().positive(),
  idempotencyKey: z.string().min(12).max(128),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  paymentMethod: z.nativeEnum(PaymentMethod),
  discountAmount: z.coerce.number().int().min(0).default(0),
  transactionReference: z.string().optional()
});

const reserveSchema = z.object({
  gameTableId: z.string().min(1)
});

export async function POST(request: Request) {
  try {
    const user = await apiUser();
    const data = startSchema.parse(await request.json());
    const session = await startSession({ ...data, userId: user.id });
    return ok({ session });
  } catch (error) {
    return jsonError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await apiUser();
    const data = reserveSchema.parse(await request.json());
    const table = await reserveTable(data.gameTableId, user.id);
    return ok({ table });
  } catch (error) {
    return jsonError(error);
  }
}

export async function GET() {
  try {
    await apiUser();
    const sessions = await prisma.session.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        gameTable: true,
        extensions: true,
        payments: true
      }
    });
    return ok({ sessions });
  } catch (error) {
    return jsonError(error);
  }
}
