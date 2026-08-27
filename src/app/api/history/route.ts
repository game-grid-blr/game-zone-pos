import { PaymentMethod, SessionStatus } from "@prisma/client";
import { apiUser, jsonError, ok } from "@/lib/api";
import { getHistory } from "@/lib/session-service";

export async function GET(request: Request) {
  try {
    await apiUser();
    const url = new URL(request.url);
    const paymentMethod = url.searchParams.get("paymentMethod");
    const status = url.searchParams.get("status");
    const sessions = await getHistory({
      date: url.searchParams.get("date") || undefined,
      game: url.searchParams.get("game") || undefined,
      paymentMethod: paymentMethod && paymentMethod !== "ALL" ? (paymentMethod as PaymentMethod) : undefined,
      customer: url.searchParams.get("customer") || undefined,
      bill: url.searchParams.get("bill") || undefined,
      status: status && status !== "ALL" ? (status as SessionStatus) : undefined
    });
    return ok({ sessions });
  } catch (error) {
    return jsonError(error);
  }
}
