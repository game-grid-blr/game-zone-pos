"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, RefreshCw } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { DashboardStats } from "@/components/DashboardStats";
import { formatMoney } from "@/lib/money";
import type { DashboardStatsDTO, SessionDTO, UserSummary } from "@/types/pos";

type ReportData = {
  period: "daily" | "monthly";
  stats: DashboardStatsDTO;
  totalMinutesSold: number;
  totalExtensions: number;
  cancelled: number;
  refunded: number;
  sessions: SessionDTO[];
};

export function ReportsPanel({ user }: { user: UserSummary }) {
  const [period, setPeriod] = useState<"daily" | "monthly">("daily");
  const [report, setReport] = useState<ReportData | null>(null);
  const [currency, setCurrency] = useState("INR");
  const [businessName, setBusinessName] = useState<string>();

  const load = useCallback(async () => {
    const [reportResponse, settingsResponse] = await Promise.all([
      fetch(`/api/reports?period=${period}`),
      fetch("/api/settings")
    ]);
    if (reportResponse.ok) setReport(await reportResponse.json());
    if (settingsResponse.ok) {
      const data = await settingsResponse.json();
      setCurrency(data.settings.currency);
      setBusinessName(data.settings.businessName);
    }
  }, [period]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <AppShell user={user} businessName={businessName}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black lg:text-4xl">Reports</h1>
          <p className="mt-1 text-sm font-semibold text-black/55 dark:text-white/55">Sales, minutes sold, extensions, refunds, and payment mix</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="grid h-11 grid-cols-2 overflow-hidden rounded-md bg-white ring-1 ring-black/10 dark:bg-white/10 dark:ring-white/10">
            {(["daily", "monthly"] as const).map((item) => (
              <button
                key={item}
                className={`px-4 text-sm font-black ${period === item ? "bg-ink text-white dark:bg-white dark:text-ink" : ""}`}
                onClick={() => setPeriod(item)}
              >
                {item === "daily" ? "Daily" : "Monthly"}
              </button>
            ))}
          </div>
          <Button tone="quiet" icon={<RefreshCw size={18} />} onClick={load}>
            Refresh
          </Button>
          <a
            href={`/api/reports/csv?period=${period}`}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-pool px-4 text-sm font-bold text-white transition hover:bg-[#136b7a]"
          >
            <Download size={18} />
            CSV
          </a>
        </div>
      </div>

      {report ? (
        <>
          <DashboardStats stats={report.stats} currency={currency} />

          <section className="mt-5 grid gap-4 lg:grid-cols-4">
            {[
              ["Minutes Sold", report.totalMinutesSold],
              ["Extensions", report.totalExtensions],
              ["Cancelled", report.cancelled],
              ["Refunded", report.refunded]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
                <div className="text-sm font-bold text-black/55 dark:text-white/55">{label}</div>
                <div className="mt-2 text-4xl font-black">{value}</div>
              </div>
            ))}
          </section>

          <section className="mt-5 grid gap-4 lg:grid-cols-2">
            <Breakdown title="Revenue by Game" values={report.stats.revenueByGame} currency={currency} />
            <Breakdown title="Revenue by Table" values={report.stats.revenueByTable} currency={currency} />
          </section>
        </>
      ) : (
        <div className="rounded-md bg-white p-8 text-center text-xl font-black shadow-sm dark:bg-white/10">Loading reports...</div>
      )}
    </AppShell>
  );
}

function Breakdown({ title, values, currency }: { title: string; values: Record<string, number>; currency: string }) {
  const max = Math.max(...Object.values(values), 1);
  return (
    <div className="rounded-md bg-white p-5 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
      <h2 className="mb-4 text-xl font-black">{title}</h2>
      <div className="space-y-3">
        {Object.entries(values).map(([label, value]) => (
          <div key={label}>
            <div className="mb-1 flex justify-between text-sm font-bold">
              <span>{label}</span>
              <span>{formatMoney(value, currency)}</span>
            </div>
            <div className="h-3 overflow-hidden rounded-md bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-md bg-pool" style={{ width: `${Math.max(8, (value / max) * 100)}%` }} />
            </div>
          </div>
        ))}
        {!Object.keys(values).length ? <div className="text-sm font-bold text-black/55 dark:text-white/55">No revenue yet</div> : null}
      </div>
    </div>
  );
}
