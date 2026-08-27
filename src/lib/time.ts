export function remainingSeconds(endsAt: Date | string, now = new Date()) {
  const endMs = typeof endsAt === "string" ? new Date(endsAt).getTime() : endsAt.getTime();
  return Math.max(0, Math.ceil((endMs - now.getTime()) / 1000));
}

export function durationSeconds(startedAt: Date | string, endsAt: Date | string) {
  const startMs = typeof startedAt === "string" ? new Date(startedAt).getTime() : startedAt.getTime();
  const endMs = typeof endsAt === "string" ? new Date(endsAt).getTime() : endsAt.getTime();
  return Math.max(0, Math.round((endMs - startMs) / 1000));
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(remainder).padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";

export function businessTimeZone() {
  const configured = process.env.BUSINESS_TIMEZONE?.trim() || DEFAULT_BUSINESS_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: configured }).format(new Date());
    return configured;
  } catch {
    return DEFAULT_BUSINESS_TIMEZONE;
  }
}

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour?: number;
  minute?: number;
  second?: number;
};

function datePartsInZone(date: Date, timeZone: string): Required<DateParts> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);

  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour") % 24,
    minute: value("minute"),
    second: value("second")
  };
}

function timeZoneOffsetMs(date: Date, timeZone: string) {
  const parts = datePartsInZone(date, timeZone);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(parts: DateParts, timeZone: string) {
  const utcSource = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour ?? 0,
    parts.minute ?? 0,
    parts.second ?? 0
  );
  let utcMs = utcSource - timeZoneOffsetMs(new Date(utcSource), timeZone);
  utcMs = utcSource - timeZoneOffsetMs(new Date(utcMs), timeZone);
  return new Date(utcMs);
}

function addDays(parts: Pick<DateParts, "year" | "month" | "day">, days: number) {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + days));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function addMonths(parts: Pick<DateParts, "year" | "month">, months: number) {
  const monthIndex = parts.year * 12 + (parts.month - 1) + months;
  return { year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1, day: 1 };
}

export function rangeForBusinessDate(dateText: string, timeZone = businessTimeZone()) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateText);
  if (!match) throw new Error("Business date must use YYYY-MM-DD format");
  const startParts = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const endParts = addDays(startParts, 1);
  return {
    start: zonedDateTimeToUtc(startParts, timeZone),
    end: zonedDateTimeToUtc(endParts, timeZone)
  };
}

export function businessDateString(now = new Date(), timeZone = businessTimeZone()) {
  const parts = datePartsInZone(now, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function todayRange(now = new Date(), timeZone = businessTimeZone()) {
  return rangeForBusinessDate(businessDateString(now, timeZone), timeZone);
}

export function monthRange(now = new Date(), timeZone = businessTimeZone()) {
  const parts = datePartsInZone(now, timeZone);
  const startParts = { year: parts.year, month: parts.month, day: 1 };
  const endParts = addMonths(startParts, 1);
  return {
    start: zonedDateTimeToUtc(startParts, timeZone),
    end: zonedDateTimeToUtc(endParts, timeZone)
  };
}
