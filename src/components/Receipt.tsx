"use client";

import { Printer, X } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/Button";
import { formatMoney } from "@/lib/money";
import { receiptSummary } from "@/lib/receipt";
import type { AppSettings } from "@/lib/settings";
import type { SessionDTO } from "@/types/pos";

export function Receipt({
  session,
  settings,
  onClose
}: {
  session: SessionDTO;
  settings: AppSettings;
  onClose?: () => void;
}) {
  const summary = receiptSummary(session, settings);

  return (
    <div className={onClose ? "fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" : ""}>
      <article className="receipt-print w-full max-w-md rounded-md bg-white p-5 text-sm text-black shadow-pos">
        <div className="no-print mb-4 flex justify-end gap-2">
          <Button type="button" tone="quiet" size="sm" icon={<Printer size={18} />} onClick={() => window.print()}>
            Print
          </Button>
          {onClose ? (
            <Button type="button" tone="quiet" size="sm" icon={<X size={18} />} onClick={onClose}>
              Close
            </Button>
          ) : null}
        </div>

        <header className="border-b border-dashed border-black pb-3 text-center">
          <h2 className="text-xl font-black">{settings.businessName}</h2>
          {settings.businessAddress ? <p>{settings.businessAddress}</p> : null}
          {settings.businessPhone ? <p>{settings.businessPhone}</p> : null}
        </header>

        <section className="border-b border-dashed border-black py-3">
          <div className="flex justify-between"><span>Bill</span><strong>{session.sessionNumber}</strong></div>
          <div className="flex justify-between"><span>Date</span><strong>{format(new Date(session.createdAt), "dd MMM yyyy, h:mm a")}</strong></div>
          <div className="flex justify-between"><span>Table</span><strong>{session.gameTable.name}</strong></div>
          <div className="flex justify-between"><span>Game</span><strong>{session.gameTable.gameType}</strong></div>
          {session.customerName ? <div className="flex justify-between"><span>Customer</span><strong>{session.customerName}</strong></div> : null}
          {session.customerPhone ? <div className="flex justify-between"><span>Phone</span><strong>{session.customerPhone}</strong></div> : null}
        </section>

        <section className="border-b border-dashed border-black py-3">
          <div className="flex justify-between"><span>Base {session.originalDurationMinutes} min</span><strong>{formatMoney(session.baseAmount, settings.currency)}</strong></div>
          {session.extensions.map((extension) => (
            <div className="flex justify-between" key={extension.id}>
              <span>Extension {extension.durationMinutes} min</span>
              <strong>{formatMoney(extension.amount + extension.taxAmount, settings.currency)}</strong>
            </div>
          ))}
          {session.discountAmount ? <div className="flex justify-between"><span>Discount</span><strong>-{formatMoney(session.discountAmount, settings.currency)}</strong></div> : null}
          {session.taxAmount ? <div className="flex justify-between"><span>Tax</span><strong>{formatMoney(session.taxAmount, settings.currency)}</strong></div> : null}
        </section>

        <section className="py-3">
          <div className="flex justify-between text-lg font-black"><span>Total</span><span>{formatMoney(session.finalAmount, settings.currency)}</span></div>
          <div className="flex justify-between"><span>Paid By</span><strong>{summary.paymentMethods}</strong></div>
          <div className="flex justify-between"><span>Status</span><strong>{session.paymentStatus}</strong></div>
          {session.refundAmount ? <div className="flex justify-between"><span>Refunded</span><strong>{formatMoney(session.refundAmount, settings.currency)}</strong></div> : null}
        </section>

        <footer className="border-t border-dashed border-black pt-3 text-center font-bold">
          <p>{settings.receiptFooter}</p>
          <p className="mt-2 text-xs">Extensions total: {formatMoney(summary.extensionTotal, settings.currency)}</p>
        </footer>
      </article>
    </div>
  );
}
