import { z } from "zod";
import { PaymentMethod } from "@prisma/client";
import { apiUser, jsonError, ok } from "@/lib/api";
import { normalizeCustomerPhone } from "@/lib/phone";
import { prisma } from "@/lib/prisma";
import { PosError, reserveTable, startSession } from "@/lib/session-service";

const customerPhoneSchema = z
  .string({ required_error: "Customer phone is required" })
  .trim()
  .min(1, "Customer phone is required")
  .transform((value, context) => {
    const normalized = normalizeCustomerPhone(value);
    if (!normalized) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Enter a valid Indian mobile number"
      });
      return z.NEVER;
    }
    return normalized;
  });

const startSchema = z.object({
  gameTableId: z.string().min(1),
  durationMinutes: z.coerce.number().int().positive(),
  idempotencyKey: z.string().min(12).max(128),
  customerName: z.string().optional(),
  customerPhone: customerPhoneSchema,
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
    const parsed = startSchema.safeParse(await request.json());
    if (!parsed.success) {
      throw new PosError(parsed.error.issues[0]?.message ?? "Invalid session request");
    }
    const data = parsed.data;
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
