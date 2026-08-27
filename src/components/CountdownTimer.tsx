"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { clsx } from "clsx";
import { formatClock, remainingSeconds } from "@/lib/time";

type CountdownTimerProps = {
  sessionId: string;
  endsAt: string;
  status: string;
  pausedRemaining?: number | null;
  warningSeconds: number;
  onWarning?: () => void;
  onExpired?: () => void;
  size?: "normal" | "large";
};

export function CountdownTimer({
  sessionId,
  endsAt,
  status,
  pausedRemaining,
  warningSeconds,
  onWarning,
  onExpired,
  size = "normal"
}: CountdownTimerProps) {
  const [now, setNow] = useState(() => new Date());
  const expiredRef = useRef(false);
  const warnedRef = useRef(false);

  useEffect(() => {
    expiredRef.current = false;
    warnedRef.current = false;
  }, [sessionId, endsAt]);

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const interval = window.setInterval(tick, 1000);
    window.addEventListener("focus", tick);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", tick);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const remaining = useMemo(() => {
    if (status === "PAUSED") return Math.max(0, pausedRemaining ?? remainingSeconds(endsAt, now));
    if (status === "TIME_UP") return 0;
    return remainingSeconds(endsAt, now);
  }, [endsAt, now, pausedRemaining, status]);

  useEffect(() => {
    if (status !== "PLAYING") return;
    if (remaining > 0 && remaining <= warningSeconds && !warnedRef.current) {
      warnedRef.current = true;
      onWarning?.();
    }
    if (remaining === 0 && !expiredRef.current) {
      expiredRef.current = true;
      onExpired?.();
    }
  }, [onExpired, onWarning, remaining, status, warningSeconds]);

  const urgent = status === "TIME_UP" || remaining === 0;
  const warning = remaining > 0 && remaining <= warningSeconds;

  return (
    <div
      className={clsx(
        "tabular-nums font-black leading-none",
        size === "large" ? "text-[clamp(2.5rem,7vw,5.5rem)]" : "text-4xl",
        urgent ? "text-fire" : warning ? "text-amber" : "text-ink dark:text-white"
      )}
    >
      {urgent ? "00:00" : formatClock(remaining)}
    </div>
  );
}
