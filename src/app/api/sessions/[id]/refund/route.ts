import { z } from "zod";
import { apiUser, jsonError, ok } from "@/lib/api";
import { refundSession } from "@/lib/session-service";

const schema = z.object({
  reason: z.string().min(2).default("Customer refund")
});

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser(["ADMIN"]);
    const { id } = await context.params;
    const data = schema.parse(await request.json());
    const session = await refundSession(id, data.reason, user.id);
    return ok({ session });
  } catch (error) {
    return jsonError(error);
  }
}
