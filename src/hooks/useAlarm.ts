"use client";

import { useCallback, useRef, useState } from "react";

type AlarmMode = "warning" | "expiry";

export function useAlarm(settings: { alarmFrequency?: number; warningFrequency?: number }) {
  const contextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const [audioReady, setAudioReady] = useState(false);

  const unlock = useCallback(async () => {
    const AudioCtor = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return false;
    const context = contextRef.current ?? new AudioCtor();
    contextRef.current = context;
    if (context.state === "suspended") await context.resume();
    setAudioReady(true);
    return true;
  }, []);

  const stop = useCallback(() => {
    oscillatorRef.current?.stop();
    oscillatorRef.current?.disconnect();
    gainRef.current?.disconnect();
    oscillatorRef.current = null;
    gainRef.current = null;
  }, []);

  const play = useCallback(
    async (mode: AlarmMode) => {
      const ready = await unlock();
      if (!ready || !contextRef.current) return;
      stop();
      const oscillator = contextRef.current.createOscillator();
      const gain = contextRef.current.createGain();
      oscillator.type = mode === "expiry" ? "square" : "sine";
      oscillator.frequency.value = mode === "expiry" ? settings.alarmFrequency ?? 880 : settings.warningFrequency ?? 520;
      gain.gain.value = mode === "expiry" ? 0.16 : 0.08;
      oscillator.connect(gain);
      gain.connect(contextRef.current.destination);
      oscillator.start();
      oscillatorRef.current = oscillator;
      gainRef.current = gain;
      if (mode === "warning") window.setTimeout(stop, 900);
    },
    [settings.alarmFrequency, settings.warningFrequency, stop, unlock]
  );

  const notify = useCallback(async (title: string, body: string) => {
    if (!("Notification" in window)) return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission === "granted") new Notification(title, { body, icon: "/icon.svg" });
  }, []);

  return { audioReady, unlock, play, stop, notify };
}
