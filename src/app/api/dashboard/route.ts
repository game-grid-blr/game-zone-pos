import { apiUser, jsonError, ok } from "@/lib/api";
import { getDashboardData } from "@/lib/session-service";

export async function GET() {
  try {
    await apiUser();
    return ok(await getDashboardData());
  } catch (error) {
    return jsonError(error);
  }
}
