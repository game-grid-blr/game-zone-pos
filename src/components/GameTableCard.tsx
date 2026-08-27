"use client";

import { useState } from "react";
import { BellRing, CirclePause, Clock, Play, ReceiptText, Square, TimerReset } from "lucide-react";
import { clsx } from "clsx";
import { Button } from "@/components/Button";
import { CountdownTimer } from "@/components/CountdownTimer";
import { ExtendSessionModal } from "@/components/ExtendSessionModal";
import { Receipt } from "@/components/Receipt";
import { formatMoney } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";
import type { GameTableDTO, SessionDTO } from "@/types/pos";

const statusStyles: Record<string, string> = {
  AVAILABLE: "bg-mint/12 text-mint ring-mint/30",
  RESERVED: "bg-amber/15 text-[#9a6500] ring-amber/40",
  PLAYING: "bg-pool/12 text-pool ring-pool/30",
  PAUSED: "bg-violet/12 text-violet ring-violet/30",
  TIME_UP: "bg-fire/15 text-fire ring-fire/30"
};

export function GameTableCard({
  table,
  settings,
  onStart,
  onChanged,
  onExpired,
  onWarning
}: {
  table: GameTableDTO;
  settings: AppSettings;
  onStart: (table: GameTableDTO) => void;
  onChanged: () => void;
  onExpired: (session: SessionDTO) => void;
  onWarning: (session: SessionDTO) => void;
}) {
  const session = table.sessions?.[0];
  const status = session?.status ?? table.status;
  const [extendMinutes, setExtendMinutes] = useState<number | null>(null);
  const [receipt, setReceipt] = useState<SessionDTO | null>(null);
  const [busy, setBusy] = useState("");

  async function call(path: string, method = "POST", body?: unknown) {
    setBusy(path);
    await fetch(path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined
    });
    setBusy("");
    onChanged();
  }

  async function reserve() {
    await call("/api/sessions", "PATCH", { gameTableId: table.id });
  }

  const warningSeconds = settings.warningTimeMinutes * 60;
  const canPlay = status === "AVAILABLE" || status === "RESERVED";
  const urgent = status === "TIME_UP";

  return (
    <article
      className={clsx(
        "relative flex min-h-[340px] flex-col rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10",
        urgent && "animate-pulse ring-2 ring-fire"
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-black">{table.name}</h2>
          <p className="text-sm font-bold text-black/55 dark:text-white/55">{table.gameType}</p>
        </div>
        <span className={clsx("rounded-md px-3 py-2 text-sm font-black ring-1", statusStyles[status] ?? statusStyles.AVAILABLE)}>
          {status.replace("_", " ")}
        </span>
      </div>

      {session ? (
        <div className="flex flex-1 flex-col">
          {urgent ? (
            <div className="mb-4 rounded-md bg-fire p-4 text-center text-white">
              <BellRing className="mx-auto mb-2" size={32} />
              <div className="text-4xl font-black">TIME UP</div>
            </div>
          ) : null}

          <div className="mb-5 rounded-md bg-paper p-4 text-center ring-1 ring-black/5 dark:bg-black/25 dark:ring-white/10">
            <CountdownTimer
              sessionId={session.id}
              status={session.status}
              endsAt={session.endsAt}
              pausedRemaining={session.remainingSecondsAtPause}
              warningSeconds={warningSeconds}
              size="large"
              onWarning={() => onWarning(session)}
              onExpired={() => onExpired(session)}
            />
          </div>

          <div className="mb-4 grid grid-cols-2 gap-2 text-sm font-bold">
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Customer</span>
              <span>{session.customerName || "Walk-in"}</span>
            </div>
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Bill</span>
              <span>{session.sessionNumber}</span>
            </div>
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Started</span>
              <span>{new Date(session.startedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Ends</span>
              <span>{new Date(session.endsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
            </div>
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Amount</span>
              <span>{formatMoney(session.finalAmount, settings.currency)}</span>
            </div>
            <div className="rounded-md bg-paper p-3 dark:bg-black/25">
              <span className="block text-black/50 dark:text-white/50">Payment</span>
              <span>{session.paymentStatus}</span>
            </div>
          </div>

          <div className="mt-auto grid grid-cols-2 gap-2">
            <Button tone="success" icon={<TimerReset size={19} />} onClick={() => setExtendMinutes(15)}>
              +15 Min
            </Button>
            <Button tone="success" icon={<TimerReset size={19} />} onClick={() => setExtendMinutes(30)}>
              +30 Min
            </Button>
            {session.status === "PAUSED" ? (
              <Button tone="primary" icon={<Play size={19} />} onClick={() => call(`/api/sessions/${session.id}/resume`)} disabled={!!busy}>
                Resume
              </Button>
            ) : (
              <Button tone="warning" icon={<CirclePause size={19} />} onClick={() => call(`/api/sessions/${session.id}/pause`)} disabled={session.status === "TIME_UP" || !!busy}>
                Pause
              </Button>
            )}
            <Button tone="danger" icon={<Square size={19} />} onClick={() => call(`/api/sessions/${session.id}/end`)} disabled={!!busy}>
              End
            </Button>
            <Button className="col-span-2" tone="quiet" icon={<ReceiptText size={19} />} onClick={() => setReceipt(session)}>
              View Receipt
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col">
          <div className="mb-5 grid flex-1 place-items-center rounded-md bg-paper p-6 text-center ring-1 ring-black/5 dark:bg-black/25 dark:ring-white/10">
            <div>
              <Clock className="mx-auto mb-3 text-pool" size={52} />
              <div className="text-3xl font-black">Available</div>
              <div className="mt-2 text-sm font-semibold text-black/55 dark:text-white/55">
                Ready for the next session
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button tone="success" size="lg" icon={<Play size={21} />} onClick={() => onStart(table)} disabled={!canPlay}>
              Start
            </Button>
            <Button tone="warning" size="lg" onClick={reserve} disabled={status !== "AVAILABLE" || !!busy}>
              Reserve
            </Button>
          </div>
        </div>
      )}

      {session && extendMinutes ? (
        <ExtendSessionModal
          session={session}
          pricing={table.pricing}
          settings={settings}
          defaultMinutes={extendMinutes}
          onClose={() => setExtendMinutes(null)}
          onDone={() => {
            setExtendMinutes(null);
            onChanged();
          }}
        />
      ) : null}

      {receipt ? <Receipt session={receipt} settings={settings} onClose={() => setReceipt(null)} /> : null}
    </article>
  );
}
