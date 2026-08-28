import { format } from "date-fns";
import { formatMoney } from "@/lib/money";
import { whatsappPhoneNumber } from "@/lib/phone";
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

export function receiptText(session: SessionDTO, settings: AppSettings) {
  const summary = receiptSummary(session, settings);
  const extensionSubtotal = session.extensions.reduce((sum, extension) => sum + extension.amount, 0);
  const subtotal = session.baseAmount + extensionSubtotal;
  const lines = [
    settings.businessName,
    `Bill: ${session.sessionNumber}`,
    `Date: ${format(new Date(session.createdAt), "dd MMM yyyy, h:mm a")}`
  ];

  if (session.customerName?.trim()) lines.push(`Customer: ${session.customerName.trim()}`);
  if (session.customerPhone?.trim()) lines.push(`Phone: ${session.customerPhone.trim()}`);

  lines.push(
    `Game: ${session.gameTable.gameType}`,
    `Table: ${session.gameTable.name}`,
    `Duration: ${session.originalDurationMinutes} min`
  );

  for (const extension of session.extensions) {
    lines.push(`Extension: ${extension.durationMinutes} min - ${formatMoney(extension.amount + extension.taxAmount, settings.currency)}`);
  }

  lines.push(`Subtotal: ${formatMoney(subtotal, settings.currency)}`);
  if (session.discountAmount) lines.push(`Discount: -${formatMoney(session.discountAmount, settings.currency)}`);
  if (session.taxAmount) lines.push(`Tax: ${formatMoney(session.taxAmount, settings.currency)}`);

  lines.push(
    `Total: ${formatMoney(session.finalAmount, settings.currency)}`,
    `Paid by: ${summary.paymentMethods || session.paymentStatus}`,
    settings.receiptFooter || "Thank you."
  );

  return lines.join("\n");
}

export function whatsappReceiptUrl(session: SessionDTO, settings: AppSettings) {
  const phone = whatsappPhoneNumber(session.customerPhone);
  if (!phone) return null;

  return `https://wa.me/${phone}?text=${encodeURIComponent(receiptText(session, settings))}`;
}
