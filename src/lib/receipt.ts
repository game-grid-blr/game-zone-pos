import type { AppSettings } from "@/lib/settings";
import type { SessionDTO } from "@/types/pos";

export function receiptSummary(session: SessionDTO, settings: AppSettings) {
  return {
    businessName: settings.businessName,
    billNumber: session.sessionNumber,
    tableName: session.gameTable.name,
    gameType: session.gameTable.gameType,
    customerName: session.customerName || "Walk-in",
    baseAmount: session.baseAmount,
    discountAmount: session.discountAmount,
    taxAmount: session.taxAmount,
    finalAmount: session.finalAmount,
    refundAmount: session.refundAmount,
    paymentStatus: session.paymentStatus,
    paymentMethods: Array.from(new Set(session.payments.map((payment) => payment.paymentMethod))).join(", "),
    extensionTotal: session.extensions.reduce((sum, extension) => sum + extension.amount + extension.taxAmount, 0)
  };
}
