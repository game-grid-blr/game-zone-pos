"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, RefreshCw, WifiOff, Volume2 } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { DashboardStats } from "@/components/DashboardStats";
import { GameTableCard } from "@/components/GameTableCard";
import { StartSessionModal } from "@/components/StartSessionModal";
import { useAlarm } from "@/hooks/useAlarm";
import type { DashboardData, GameTableDTO, SessionDTO, UserSummary } from "@/types/pos";

const CACHE_KEY = "fort-game-zone-dashboard-cache";

export function DashboardClient({ user }: { user: UserSummary }) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [startTable, setStartTable] = useState<GameTableDTO | null>(null);
  const [alertSession, setAlertSession] = useState<SessionDTO | null>(null);
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const settings = data?.settings ?? {
    businessName: "Fort Game Zone",
    businessAddress: "",
    businessPhone: "",
    currency: "INR",
    taxEnabled: false,
    taxRatePercent: 0,
    durationOptions: [15, 30, 45, 60],
    warningTimeMinutes: 5,
    paymentMethods: ["CASH", "UPI", "CARD"],
    receiptFooter: "Thanks for playing at Fort Game Zone",
    warningSound: "soft-beep",
    expiryAlarm: "loud-alarm",
    alarmFrequency: 880,
    warningFrequency: 520
  };
  const alarm = useAlarm(settings);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) throw new Error("Dashboard fetch failed");
      const next = (await response.json()) as DashboardData;
      setData(next);
      setOffline(false);
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
    } catch {
      setOffline(true);
      const cached = window.localStorage.getItem(CACHE_KEY);
      if (cached) setData(JSON.parse(cached));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 5000);
    window.addEventListener("online", load);
    window.addEventListener("focus", load);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("online", load);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const timeUpSessions = useMemo(
    () =>
      data?.tables
        .flatMap((table) => table.sessions ?? [])
        .filter((session) => session.status === "TIME_UP" && !acknowledged[session.id]) ?? [],
    [acknowledged, data?.tables]
  );

  useEffect(() => {
    if (!timeUpSessions.length) return;
    const session = timeUpSessions[0];
    setAlertSession(session);
    alarm.play("expiry");
  }, [alarm, timeUpSessions]);

  async function handleExpired(session: SessionDTO) {
    setAlertSession(session);
    alarm.play("expiry");
    alarm.notify("Time up", `${session.gameTable.name} session is over`);
    await fetch(`/api/sessions/${session.id}/time-up`, { method: "POST" });
    await load();
  }

  function handleWarning(session: SessionDTO) {
    alarm.play("warning");
    alarm.notify("Session ending soon", `${session.gameTable.name} has ${settings.warningTimeMinutes} minutes or less remaining`);
  }

  function acknowledge() {
    if (alertSession) setAcknowledged((current) => ({ ...current, [alertSession.id]: true }));
    setAlertSession(null);
    alarm.stop();
  }

  return (
    <AppShell user={user}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black lg:text-4xl">Game Dashboard</h1>
          <p className="mt-1 text-sm font-semibold text-black/55 dark:text-white/55">
            {offline ? "Using saved session data until connection returns" : "Live POS session control"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {offline ? (
            <span className="inline-flex h-11 items-center gap-2 rounded-md bg-amber/15 px-3 text-sm font-black text-[#9a6500] ring-1 ring-amber/40">
              <WifiOff size={18} />
              Offline
            </span>
          ) : null}
          <Button tone="quiet" icon={<Volume2 size={18} />} onClick={alarm.unlock}>
            {alarm.audioReady ? "Audio Ready" : "Enable Audio"}
          </Button>
          <Button tone="warning" icon={<Bell size={18} />} onClick={() => alarm.play("expiry")}>
            Test Alarm
          </Button>
          <Button tone="quiet" icon={<RefreshCw size={18} />} onClick={load}>
            Refresh
          </Button>
        </div>
      </div>

      {data ? <DashboardStats stats={data.stats} currency={settings.currency} /> : null}

      {loading && !data ? (
        <div className="mt-6 rounded-md bg-white p-8 text-center text-xl font-black shadow-sm dark:bg-white/10">Loading POS...</div>
      ) : (
        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data?.tables.map((table) => (
            <GameTableCard
              key={table.id}
              table={table}
              settings={settings}
              onStart={setStartTable}
              onChanged={load}
              onExpired={handleExpired}
              onWarning={handleWarning}
            />
          ))}
        </section>
      )}

      {alertSession ? (
        <div className="fixed bottom-4 left-4 right-4 z-[60] rounded-md bg-fire p-4 text-white shadow-pos lg:left-auto lg:w-[440px]">
          <div className="mb-3 flex items-center gap-3">
            <Bell size={28} />
            <div>
              <div className="text-2xl font-black">TIME UP</div>
              <div className="font-bold">{alertSession.gameTable.name} needs attention</div>
            </div>
          </div>
          <Button className="w-full" tone="dark" onClick={acknowledge}>
            Acknowledge Alarm
          </Button>
        </div>
      ) : null}

      {startTable ? (
        <StartSessionModal
          table={startTable}
          settings={settings}
          onClose={() => setStartTable(null)}
          onDone={() => {
            setStartTable(null);
            load();
          }}
        />
      ) : null}
    </AppShell>
  );
}
