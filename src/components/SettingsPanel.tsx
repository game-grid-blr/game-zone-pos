"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Plus, Save } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { Button } from "@/components/Button";
import { useAlarm } from "@/hooks/useAlarm";
import { paiseToRupees, rupeesToPaise } from "@/lib/money";
import type { AppSettings } from "@/lib/settings";
import type { GameTableDTO, UserSummary } from "@/types/pos";

type SettingsPayload = {
  settings: AppSettings;
  tables: GameTableDTO[];
};

const emptySettings: AppSettings = {
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

export function SettingsPanel({ user }: { user: UserSummary }) {
  const [settings, setSettings] = useState<AppSettings>(emptySettings);
  const [tables, setTables] = useState<GameTableDTO[]>([]);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const alarm = useAlarm(settings);

  const durationText = useMemo(() => settings.durationOptions.join(", "), [settings.durationOptions]);

  const load = useCallback(async () => {
    const response = await fetch("/api/settings");
    if (response.ok) {
      const data = (await response.json()) as SettingsPayload;
      setSettings(data.settings);
      setTables(data.tables);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function updateTable(id: string, patch: Partial<GameTableDTO>) {
    setTables((current) => current.map((table) => (table.id === id ? { ...table, ...patch } : table)));
  }

  function updatePrice(tableId: string, durationMinutes: number, rupees: string) {
    setTables((current) =>
      current.map((table) => {
        if (table.id !== tableId) return table;
        const pricing = [...table.pricing];
        const index = pricing.findIndex((price) => price.durationMinutes === durationMinutes);
        const next = {
          id: pricing[index]?.id ?? `${tableId}-${durationMinutes}`,
          gameTableId: tableId,
          durationMinutes,
          price: rupeesToPaise(Number(rupees || 0)),
          active: true
        };
        if (index >= 0) pricing[index] = next;
        else pricing.push(next);
        return { ...table, pricing: pricing.sort((a, b) => a.durationMinutes - b.durationMinutes) };
      })
    );
  }

  function addTable() {
    const id = `new-${Date.now()}`;
    setTables((current) => [
      ...current,
      {
        id,
        name: "New Table",
        gameType: "Game",
        status: "AVAILABLE",
        active: true,
        sortOrder: current.length + 1,
        pricing: settings.durationOptions.map((durationMinutes) => ({
          id: `${id}-${durationMinutes}`,
          gameTableId: id,
          durationMinutes,
          price: 0,
          active: true
        }))
      }
    ]);
  }

  async function save() {
    setSaving(true);
    setMessage("");
    const response = await fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...settings,
        tables: tables.map((table) => ({
          ...table,
          id: table.id.startsWith("new-") ? undefined : table.id
        }))
      })
    });
    setSaving(false);
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setMessage(data.error ?? "Could not save settings");
      return;
    }
    setMessage("Settings saved");
    await load();
  }

  return (
    <AppShell user={user} businessName={settings.businessName}>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-3xl font-black lg:text-4xl">Settings</h1>
          <p className="mt-1 text-sm font-semibold text-black/55 dark:text-white/55">Configure POS tables, pricing, tax, receipts, alarms, and warning time</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button tone="warning" icon={<Bell size={18} />} onClick={() => alarm.play("expiry")}>
            Test Alarm
          </Button>
          <Button tone="success" icon={<Save size={18} />} onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {message ? <div className="mb-5 rounded-md bg-pool/10 p-3 text-sm font-black text-pool">{message}</div> : null}

      <section className="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div className="space-y-4">
          <Panel title="Business">
            <Input label="Business Name" value={settings.businessName} onChange={(value) => setSettings({ ...settings, businessName: value })} />
            <Input label="Address" value={settings.businessAddress} onChange={(value) => setSettings({ ...settings, businessAddress: value })} />
            <Input label="Phone" value={settings.businessPhone} onChange={(value) => setSettings({ ...settings, businessPhone: value })} />
            <Input label="Currency" value={settings.currency} onChange={(value) => setSettings({ ...settings, currency: value.toUpperCase().slice(0, 3) })} />
            <Input label="Receipt Footer" value={settings.receiptFooter} onChange={(value) => setSettings({ ...settings, receiptFooter: value })} />
          </Panel>

          <Panel title="Billing">
            <label className="flex min-h-12 items-center justify-between rounded-md bg-paper px-3 font-bold dark:bg-black/25">
              Tax Enabled
              <input type="checkbox" checked={settings.taxEnabled} onChange={(event) => setSettings({ ...settings, taxEnabled: event.target.checked })} />
            </label>
            <Input label="Tax Rate %" type="number" value={String(settings.taxRatePercent)} onChange={(value) => setSettings({ ...settings, taxRatePercent: Number(value) })} />
            <Input
              label="Duration Options"
              value={durationText}
              onChange={(value) =>
                setSettings({
                  ...settings,
                  durationOptions: value
                    .split(",")
                    .map((item) => Number(item.trim()))
                    .filter((item) => Number.isFinite(item) && item > 0)
                })
              }
            />
            <Input label="Warning Minutes" type="number" value={String(settings.warningTimeMinutes)} onChange={(value) => setSettings({ ...settings, warningTimeMinutes: Number(value) })} />
          </Panel>

          <Panel title="Payment Methods">
            {["CASH", "UPI", "CARD"].map((method) => (
              <label key={method} className="flex min-h-12 items-center justify-between rounded-md bg-paper px-3 font-bold dark:bg-black/25">
                {method}
                <input
                  type="checkbox"
                  checked={settings.paymentMethods.includes(method)}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      paymentMethods: event.target.checked
                        ? Array.from(new Set([...settings.paymentMethods, method]))
                        : settings.paymentMethods.filter((item) => item !== method)
                    })
                  }
                />
              </label>
            ))}
          </Panel>

          <Panel title="Audio">
            <Input label="Warning Frequency" type="number" value={String(settings.warningFrequency)} onChange={(value) => setSettings({ ...settings, warningFrequency: Number(value) })} />
            <Input label="Alarm Frequency" type="number" value={String(settings.alarmFrequency)} onChange={(value) => setSettings({ ...settings, alarmFrequency: Number(value) })} />
          </Panel>
        </div>

        <Panel title="Games and Pricing" action={<Button tone="quiet" icon={<Plus size={18} />} onClick={addTable}>Add Table</Button>}>
          <div className="space-y-4">
            {tables.map((table) => (
              <div key={table.id} className="rounded-md bg-paper p-4 ring-1 ring-black/5 dark:bg-black/25 dark:ring-white/10">
                <div className="mb-3 grid gap-3 md:grid-cols-[1.2fr_1fr_90px_90px]">
                  <Input label="Name" value={table.name} onChange={(value) => updateTable(table.id, { name: value })} />
                  <Input label="Game Type" value={table.gameType} onChange={(value) => updateTable(table.id, { gameType: value })} />
                  <Input label="Order" type="number" value={String(table.sortOrder)} onChange={(value) => updateTable(table.id, { sortOrder: Number(value) })} />
                  <label className="flex flex-col gap-2 text-sm font-black">
                    Active
                    <span className="flex h-12 items-center rounded-md bg-white px-3 dark:bg-black/30">
                      <input type="checkbox" checked={table.active} onChange={(event) => updateTable(table.id, { active: event.target.checked })} />
                    </span>
                  </label>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {settings.durationOptions.map((duration) => {
                    const price = table.pricing.find((item) => item.durationMinutes === duration);
                    return (
                      <Input
                        key={duration}
                        label={`${duration} min`}
                        type="number"
                        value={String(paiseToRupees(price?.price ?? 0))}
                        onChange={(value) => updatePrice(table.id, duration, value)}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </section>
    </AppShell>
  );
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-md bg-white p-4 shadow-sm ring-1 ring-black/5 dark:bg-white/10 dark:ring-white/10">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-xl font-black">{title}</h2>
        {action}
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Input({
  label,
  value,
  onChange,
  type = "text"
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <label className="block text-sm font-black">
      <span className="mb-2 block">{label}</span>
      <input
        className="h-12 w-full rounded-md border border-black/15 bg-white px-3 font-semibold outline-none focus:border-pool dark:border-white/15 dark:bg-black/30"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
