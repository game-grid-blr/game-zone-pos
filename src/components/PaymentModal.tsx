"use client";

import { Banknote, CreditCard, QrCode } from "lucide-react";
import { clsx } from "clsx";
import type { PaymentMethod } from "@prisma/client";

const options: Array<{ value: PaymentMethod; label: string; icon: React.ElementType }> = [
  { value: "CASH", label: "Cash", icon: Banknote },
  { value: "UPI", label: "UPI", icon: QrCode },
  { value: "CARD", label: "Card", icon: CreditCard }
];

export function PaymentModal({
  value,
  onChange,
  enabledMethods = ["CASH", "UPI", "CARD"]
}: {
  value: PaymentMethod;
  onChange: (value: PaymentMethod) => void;
  enabledMethods?: string[];
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {options
        .filter((option) => enabledMethods.includes(option.value))
        .map((option) => {
          const Icon = option.icon;
          const active = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              className={clsx(
                "flex h-16 flex-col items-center justify-center gap-1 rounded-md text-sm font-black ring-1 transition",
                active
                  ? "bg-ink text-white ring-ink dark:bg-white dark:text-ink dark:ring-white"
                  : "bg-white ring-black/10 hover:bg-black/5 dark:bg-white/10 dark:ring-white/10 dark:hover:bg-white/15"
              )}
            >
              <Icon size={22} />
              {option.label}
            </button>
          );
        })}
    </div>
  );
}
