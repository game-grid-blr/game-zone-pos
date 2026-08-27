import { apiUser, jsonError, ok } from "@/lib/api";
import { cancelSession } from "@/lib/session-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser(["ADMIN"]);
    const { id } = await context.params;
    const session = await cancelSession(id, user.id);
    return ok({ session });
  } catch (error) {
    return jsonError(error);
  }
}
