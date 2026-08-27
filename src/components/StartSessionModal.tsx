"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/Button";
import { PaymentModal } from "@/components/PaymentModal";
import { formatMoney, rupeesToPaise } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";
import type { GameTableDTO } from "@/types/pos";

function makeIdempotencyKey() {
  return `start-session:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function StartSessionModal({
  table,
  settings,
  onClose,
  onDone
}: {
  table: GameTableDTO;
  settings: AppSettings;
  onClose: () => void;
  onDone: () => void;
}) {
  const firstDuration = table.pricing[0]?.durationMinutes ?? settings.durationOptions[0] ?? 15;
  const [durationMinutes, setDurationMinutes] = useState(firstDuration);
  const [customDuration, setCustomDuration] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [discountRupees, setDiscountRupees] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = makeIdempotencyKey();

  const pricing = useMemo(
    () => table.pricing.find((price) => price.durationMinutes === durationMinutes && price.active),
    [durationMinutes, table.pricing]
  );
  const discountAmount = rupeesToPaise(Number(discountRupees || 0));
  const taxBase = Math.max(0, (pricing?.price ?? 0) - discountAmount);
  const taxAmount = settings.taxEnabled ? Math.round((taxBase * settings.taxRatePercent) / 100) : 0;
  const finalAmount = Math.max(0, taxBase + taxAmount);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!pricing) {
      setError("Configure a price for this duration first.");
      return;
    }
    setLoading(true);
    const response = await fetch("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        gameTableId: table.id,
        durationMinutes,
        idempotencyKey: idempotencyKeyRef.current,
        customerName,
        customerPhone,
        paymentMethod,
        discountAmount
      })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not start session");
      return;
    }
    onDone();
  }

  function applyCustom() {
    const minutes = Number(customDuration);
    if (Number.isFinite(minutes) && minutes > 0) setDurationMinutes(Math.round(minutes));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-md bg-paper p-5 text-ink shadow-pos dark:bg-[#171a1d] dark:text-white">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Start Session</h2>
            <p className="text-sm font-bold text-black/55 dark:text-white/55">{table.name}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-md bg-white ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10" title="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {table.pricing.map((price) => (
            <button
              type="button"
              key={price.id}
              onClick={() => setDurationMinutes(price.durationMinutes)}
              className={`h-20 rounded-md text-left font-black ring-1 transition ${
                durationMinutes === price.durationMinutes
                  ? "bg-pool p-3 text-white ring-pool"
                  : "bg-white p-3 ring-black/10 dark:bg-white/10 dark:ring-white/10"
              }`}
            >
              <span className="block text-xl">{price.durationMinutes} min</span>
              <span className="text-sm">{formatMoney(price.price, settings.currency)}</span>
            </button>
          ))}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="h-12 rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            placeholder="Custom duration minutes"
            inputMode="numeric"
            value={customDuration}
            onChange={(event) => setCustomDuration(event.target.value)}
          />
          <Button type="button" tone="quiet" onClick={applyCustom}>
            Use Custom
          </Button>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <input
            className="h-12 rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            placeholder="Customer name optional"
            value={customerName}
            onChange={(event) => setCustomerName(event.target.value)}
          />
          <input
            className="h-12 rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            placeholder="Phone optional"
            value={customerPhone}
            onChange={(event) => setCustomerPhone(event.target.value)}
          />
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-black">Payment Method</label>
          <PaymentModal value={paymentMethod} onChange={setPaymentMethod} enabledMethods={settings.paymentMethods} />
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-2 block text-sm font-black">Discount</span>
            <input
              className="h-12 w-full rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
              inputMode="decimal"
              value={discountRupees}
              onChange={(event) => setDiscountRupees(event.target.value)}
              placeholder="0"
            />
          </label>
          <div className="rounded-md bg-white p-3 ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10">
            <div className="flex justify-between text-sm font-bold"><span>Base</span><span>{formatMoney(pricing?.price ?? 0, settings.currency)}</span></div>
            <div className="flex justify-between text-sm font-bold"><span>Tax</span><span>{formatMoney(taxAmount, settings.currency)}</span></div>
            <div className="mt-2 flex justify-between text-2xl font-black"><span>Total</span><span>{formatMoney(finalAmount, settings.currency)}</span></div>
          </div>
        </div>

        {error ? <div className="mb-4 rounded-md bg-fire/10 p-3 text-sm font-bold text-fire">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" tone="quiet" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="success" size="lg" disabled={loading || !pricing}>
            {loading ? "Starting..." : "Confirm Payment & Start"}
          </Button>
        </div>
      </form>
    </div>
  );
}
