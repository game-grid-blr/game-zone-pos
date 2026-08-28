import { NextResponse } from "next/server";
import { apiUser, jsonError } from "@/lib/api";
import { PRODUCT_SLUG } from "@/lib/branding";
import { formatMoney } from "@/lib/money";
import { getReport } from "@/lib/session-service";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  try {
    await apiUser(["ADMIN"]);
    const url = new URL(request.url);
    const period = url.searchParams.get("period") === "monthly" ? "monthly" : "daily";
    const report = await getReport(period);
    const rows = [
      ["Bill", "Date", "Game", "Table", "Customer", "Minutes", "Extensions", "Payment", "Status", "Total"],
      ...report.sessions.map((session) => [
        session.sessionNumber,
        session.createdAt.toISOString(),
        session.gameTable.gameType,
        session.gameTable.name,
        session.customerName ?? "",
        session.originalDurationMinutes,
        session.extensions.reduce((sum, extension) => sum + extension.durationMinutes, 0),
        session.payments.map((payment) => payment.paymentMethod).join(" + "),
        session.paymentStatus,
        formatMoney(session.finalAmount)
      ])
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${PRODUCT_SLUG}-${period}-report.csv"`
      }
    });
  } catch (error) {
    return jsonError(error);
  }
}
