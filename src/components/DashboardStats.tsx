import { CreditCard, Gamepad2, IndianRupee, Timer, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/money";
import type { DashboardStatsDTO } from "@/types/pos";

const icons = [IndianRupee, Gamepad2, Timer, Wallet, CreditCard];

export function DashboardStats({
  stats,
  currency
}: {
  stats: DashboardStatsDTO;
  currency: string;
}) {
  const items = [
    { label: "Today's Revenue", value: formatMoney(stats.revenue, currency) },
    { label: "Sessions", value: stats.sessions },
    { label: "Playing Hours", value: stats.playingHours },
    { label: "Active Now", value: stats.activeSessions },
    {
      label: "Cash / UPI / Card",
      value: `${formatMoney(stats.cashCollected, currency)} / ${formatMoney(stats.upiCollected, currency)} / ${formatMoney(
        stats.cardCollected,
        currency
      )}`
    }
  ];

  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {items.map((item, index) => {
        const Icon = icons[index];
        return (
          <div key={item.label} className="rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold text-black/55 dark:text-white/55">
              <Icon size={18} />
              {item.label}
            </div>
            <div className="min-h-8 text-2xl font-black leading-tight">{item.value}</div>
          </div>
        );
      })}
    </section>
  );
}
