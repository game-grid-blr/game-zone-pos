export const DEFAULT_BUSINESS_NAME = "Fort Game Zone";

export function normalizeBusinessName(businessName?: string | null) {
  return businessName?.trim() || DEFAULT_BUSINESS_NAME;
}

export function businessInitials(businessName?: string | null) {
  const name = normalizeBusinessName(businessName);
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const letters =
    words.length > 1
      ? words.slice(0, 2).map((word) => word[0])
      : [words[0]?.[0], words[0]?.[1]].filter(Boolean);

  return letters.join("").toUpperCase() || "FG";
}

export function posTitle(businessName?: string | null) {
  return `${normalizeBusinessName(businessName)} POS`;
}
