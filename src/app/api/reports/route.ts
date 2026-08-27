import { apiUser, jsonError, ok } from "@/lib/api";
import { getReport } from "@/lib/session-service";

export async function GET(request: Request) {
  try {
    await apiUser(["ADMIN"]);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") === "monthly" ? "monthly" : "daily";
    const report = await getReport(period);
    return ok(report);
  } catch (error) {
    return jsonError(error);
  }
}
