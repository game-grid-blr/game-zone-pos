"use client";

import { useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { PaymentMethod } from "@prisma/client";
import { Button } from "@/components/Button";
import { PaymentModal } from "@/components/PaymentModal";
import { formatMoney, rupeesToPaise } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";
import type { SessionDTO } from "@/types/pos";

function makeIdempotencyKey() {
  return `extend-session:${crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`}`;
}

export function ExtendSessionModal({
  session,
  pricing,
  settings,
  defaultMinutes = 15,
  onClose,
  onDone
}: {
  session: SessionDTO;
  pricing: { durationMinutes: number; price: number; active?: boolean }[];
  settings: AppSettings;
  defaultMinutes?: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const [durationMinutes, setDurationMinutes] = useState(defaultMinutes);
  const [customDuration, setCustomDuration] = useState("");
  const [customAmount, setCustomAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const idempotencyKeyRef = useRef<string | null>(null);
  if (!idempotencyKeyRef.current) idempotencyKeyRef.current = makeIdempotencyKey();

  const tablePricing = useMemo(() => pricing.filter((item) => item.active !== false), [pricing]);
  const price = tablePricing.find((item) => item.durationMinutes === durationMinutes)?.price;
  const amount = customAmount ? rupeesToPaise(Number(customAmount)) : price;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (amount === undefined) {
      setError("Configure a price or enter an extension amount.");
      return;
    }
    setLoading(true);
    const response = await fetch(`/api/sessions/${session.id}/extend`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ durationMinutes, idempotencyKey: idempotencyKeyRef.current, paymentMethod, amount })
    });
    setLoading(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setError(data.error ?? "Could not extend session");
      return;
    }
    onDone();
  }

  function applyCustomDuration() {
    const minutes = Number(customDuration);
    if (Number.isFinite(minutes) && minutes > 0) setDurationMinutes(Math.round(minutes));
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="w-full max-w-xl rounded-md bg-paper p-5 text-ink shadow-pos dark:bg-[#171a1d] dark:text-white">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black">Extend Session</h2>
            <p className="text-sm font-bold text-black/55 dark:text-white/55">
              {session.gameTable.name} - {session.sessionNumber}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid h-11 w-11 place-items-center rounded-md bg-white ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10" title="Close">
            <X size={22} />
          </button>
        </div>

        <div className="mb-5 grid grid-cols-2 gap-3">
          {[15, 30].map((minutes) => (
            <button
              type="button"
              key={minutes}
              onClick={() => setDurationMinutes(minutes)}
              className={`h-20 rounded-md p-3 text-left font-black ring-1 transition ${
                durationMinutes === minutes ? "bg-pool text-white ring-pool" : "bg-white ring-black/10 dark:bg-white/10 dark:ring-white/10"
              }`}
            >
              <span className="block text-xl">+{minutes} min</span>
              <span className="text-sm">{formatMoney(tablePricing.find((item) => item.durationMinutes === minutes)?.price ?? 0, settings.currency)}</span>
            </button>
          ))}
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            className="h-12 rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            placeholder="Custom extension minutes"
            inputMode="numeric"
            value={customDuration}
            onChange={(event) => setCustomDuration(event.target.value)}
          />
          <Button type="button" tone="quiet" onClick={applyCustomDuration}>
            Use Custom
          </Button>
        </div>

        <div className="mb-5">
          <label className="mb-2 block text-sm font-black">Payment Method</label>
          <PaymentModal value={paymentMethod} onChange={setPaymentMethod} enabledMethods={settings.paymentMethods} />
        </div>

        <label className="mb-5 block">
          <span className="mb-2 block text-sm font-black">Amount</span>
          <input
            className="h-12 w-full rounded-md border border-black/15 bg-white px-3 outline-none focus:border-pool dark:border-white/15 dark:bg-black/20"
            inputMode="decimal"
            value={customAmount}
            onChange={(event) => setCustomAmount(event.target.value)}
            placeholder={price !== undefined ? String(price / 100) : "Enter amount"}
          />
        </label>

        <div className="mb-5 rounded-md bg-white p-4 ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10">
          <div className="flex justify-between text-sm font-bold"><span>Extension</span><span>{durationMinutes} min</span></div>
          <div className="mt-2 flex justify-between text-2xl font-black"><span>Amount</span><span>{formatMoney(amount ?? 0, settings.currency)}</span></div>
        </div>

        {error ? <div className="mb-4 rounded-md bg-fire/10 p-3 text-sm font-bold text-fire">{error}</div> : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <Button type="button" tone="quiet" size="lg" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" tone="success" size="lg" disabled={loading}>
            {loading ? "Extending..." : "Confirm Extension"}
          </Button>
        </div>
      </form>
    </div>
  );
}
