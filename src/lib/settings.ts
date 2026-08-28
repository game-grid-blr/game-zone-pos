import type { Prisma, PrismaClient } from "@prisma/client";
import { DEFAULT_BUSINESS_NAME, DEFAULT_RECEIPT_FOOTER } from "./branding";
import { prisma } from "./prisma";

export type AppSettings = {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  currency: string;
  taxEnabled: boolean;
  taxRatePercent: number;
  durationOptions: number[];
  warningTimeMinutes: number;
  paymentMethods: string[];
  receiptFooter: string;
  warningSound: string;
  expiryAlarm: string;
  alarmFrequency: number;
  warningFrequency: number;
};

const defaults: AppSettings = {
  businessName: DEFAULT_BUSINESS_NAME,
  businessAddress: "",
  businessPhone: "",
  currency: "INR",
  taxEnabled: false,
  taxRatePercent: 0,
  durationOptions: [15, 30, 45, 60],
  warningTimeMinutes: 5,
  paymentMethods: ["CASH", "UPI", "CARD"],
  receiptFooter: DEFAULT_RECEIPT_FOOTER,
  warningSound: "soft-beep",
  expiryAlarm: "loud-alarm",
  alarmFrequency: 880,
  warningFrequency: 520
};

function parseBoolean(value: string | undefined, fallback: boolean) {
  if (value === undefined) return fallback;
  return value === "true";
}

function parseNumber(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseJson<T>(value: string | undefined, fallback: T) {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

type Client = PrismaClient | Prisma.TransactionClient;

export async function getSettings(client: Client = prisma): Promise<AppSettings> {
  const rows = await client.appSetting.findMany();
  const map = Object.fromEntries(rows.map((row) => [row.key, row.value]));

  return {
    businessName: map.businessName ?? defaults.businessName,
    businessAddress: map.businessAddress ?? defaults.businessAddress,
    businessPhone: map.businessPhone ?? defaults.businessPhone,
    currency: map.currency ?? defaults.currency,
    taxEnabled: parseBoolean(map.taxEnabled, defaults.taxEnabled),
    taxRatePercent: parseNumber(map.taxRatePercent, defaults.taxRatePercent),
    durationOptions: parseJson<number[]>(map.durationOptions, defaults.durationOptions),
    warningTimeMinutes: parseNumber(map.warningTimeMinutes, defaults.warningTimeMinutes),
    paymentMethods: parseJson<string[]>(map.paymentMethods, defaults.paymentMethods),
    receiptFooter: map.receiptFooter ?? defaults.receiptFooter,
    warningSound: map.warningSound ?? defaults.warningSound,
    expiryAlarm: map.expiryAlarm ?? defaults.expiryAlarm,
    alarmFrequency: parseNumber(map.alarmFrequency, defaults.alarmFrequency),
    warningFrequency: parseNumber(map.warningFrequency, defaults.warningFrequency)
  };
}

export async function updateSettings(values: Partial<AppSettings>, client: Client = prisma) {
  const serialized = Object.entries(values).map(([key, value]) => ({
    key,
    value: Array.isArray(value) ? JSON.stringify(value) : String(value)
  }));

  const currentRows = await client.appSetting.findMany({
    where: { key: { in: serialized.map((setting) => setting.key) } },
    select: { key: true, value: true }
  });
  const currentValues = new Map(currentRows.map((row) => [row.key, row.value]));

  for (const setting of serialized) {
    if (currentValues.get(setting.key) === setting.value) continue;

    await client.appSetting.upsert({
      where: { key: setting.key },
      create: setting,
      update: { value: setting.value }
    });
  }

  return getSettings(client);
}

export function calculateTax(amount: number, settings: Pick<AppSettings, "taxEnabled" | "taxRatePercent">) {
  if (!settings.taxEnabled || settings.taxRatePercent <= 0) return 0;
  return Math.round((amount * settings.taxRatePercent) / 100);
}
