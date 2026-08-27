"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Printer, RefreshCw, Search, Undo2, XCircle } from "lucide-react";
import type { PaymentMethod, SessionStatus } from "@prisma/client";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { Receipt } from "@/components/Receipt";
import { formatMoney } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";
import type { SessionDTO, UserSummary } from "@/types/pos";

const statuses: Array<"ALL" | SessionStatus> = ["ALL", "PLAYING", "TIME_UP", "COMPLETED", "CANCELLED"];
const methods: Array<"ALL" | PaymentMethod> = ["ALL", "CASH", "UPI", "CARD"];

export function TransactionTable({ user }: { user: UserSummary }) {
  const [sessions, setSessions] = useState<SessionDTO[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [filters, setFilters] = useState({
    date: new Date().toISOString().slice(0, 10),
    game: "",
    paymentMethod: "ALL",
    customer: "",
    bill: "",
    status: "ALL"
  });
  const [selected, setSelected] = useState<SessionDTO | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value) params.set(key, value);
    });
    const [historyResponse, settingsResponse] = await Promise.all([
      fetch(`/api/history?${params.toString()}`),
      fetch("/api/settings")
    ]);
    if (historyResponse.ok) {
      const data = await historyResponse.json();
      setSessions(data.sessions);
    }
    if (settingsResponse.ok) {
      const data = await settingsResponse.json();
      setSettings(data.settings);
    }
    setLoading(false);
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  const games = useMemo(
    () => Array.from(new Set(sessions.map((session) => session.gameTable.gameType))).sort(),
    [sessions]
  );

  async function action(sessionId: string, path: string, body?: unknown) {
    await fetch(`/api/sessions/${sessionId}/${path}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    await load();
  }

  return (
    <AppShell user={user} businessName={settings?.businessName}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black lg:text-4xl">Transaction History</h1>
          <p className="mt-1 text-sm font-semibold text-black/55 dark:text-white/55">Find bills, reprint receipts, and audit cancellations or refunds</p>
        </div>
        <Button tone="quiet" icon={<RefreshCw size={18} />} onClick={load}>
          Refresh
        </Button>
      </div>

      <section className="mb-5 grid gap-3 rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10 md:grid-cols-3 xl:grid-cols-6">
        <input className="h-12 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} />
        <select className="h-12 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" value={filters.game} onChange={(event) => setFilters({ ...filters, game: event.target.value })}>
          <option value="">All games</option>
          {games.map((game) => <option key={game} value={game}>{game}</option>)}
        </select>
        <select className="h-12 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" value={filters.paymentMethod} onChange={(event) => setFilters({ ...filters, paymentMethod: event.target.value })}>
          {methods.map((method) => <option key={method}>{method}</option>)}
        </select>
        <select className="h-12 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
        <input className="h-12 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" placeholder="Customer or phone" value={filters.customer} onChange={(event) => setFilters({ ...filters, customer: event.target.value })} />
        <div className="flex gap-2">
          <input className="h-12 min-w-0 flex-1 rounded-md border border-black/15 bg-white px-3 dark:border-white/15 dark:bg-black/20" placeholder="Bill no." value={filters.bill} onChange={(event) => setFilters({ ...filters, bill: event.target.value })} />
          <Button tone="primary" icon={<Search size={18} />} onClick={load} title="Search" />
        </div>
      </section>

      <section className="overflow-hidden rounded-md bg-white shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-black/5 text-xs uppercase dark:bg-white/10">
              <tr>
                <th className="p-3">Bill</th>
                <th className="p-3">Date</th>
                <th className="p-3">Table</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Total</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <tr key={session.id} className="border-t border-black/5 dark:border-white/10">
                  <td className="p-3 font-black">{session.sessionNumber}</td>
                  <td className="p-3">{new Date(session.createdAt).toLocaleString()}</td>
                  <td className="p-3">{session.gameTable.name}</td>
                  <td className="p-3">{session.customerName || "Walk-in"}</td>
                  <td className="p-3">{session.payments.map((payment) => payment.paymentMethod).join(", ")}</td>
                  <td className="p-3 font-bold">{session.paymentStatus} / {session.status}</td>
                  <td className="p-3 text-right font-black">{formatMoney(session.finalAmount, settings?.currency)}</td>
                  <td className="p-3">
                    <div className="flex min-w-[250px] flex-wrap gap-2">
                      <Button tone="quiet" size="sm" icon={<Printer size={16} />} onClick={() => setSelected(session)}>Receipt</Button>
                      {user.role === "ADMIN" ? (
                        <>
                          <Button tone="warning" size="sm" icon={<XCircle size={16} />} onClick={() => action(session.id, "cancel")}>Cancel</Button>
                          <Button tone="danger" size="sm" icon={<Undo2 size={16} />} onClick={() => action(session.id, "refund", { reason: "Refunded by admin" })}>Refund</Button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!sessions.length ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-lg font-black text-black/55 dark:text-white/55">
                    {loading ? "Loading..." : "No transactions found"}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {selected && settings ? <Receipt session={selected} settings={settings} onClose={() => setSelected(null)} /> : null}
    </AppShell>
  );
}
