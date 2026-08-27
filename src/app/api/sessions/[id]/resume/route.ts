import { apiUser, jsonError, ok } from "@/lib/api";
import { resumeSession } from "@/lib/session-service";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await apiUser();
    const { id } = await context.params;
    const session = await resumeSession(id, user.id);
    return ok({ session });
  } catch (error) {
    return jsonError(error);
  }
}
