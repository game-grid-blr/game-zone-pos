export const PRODUCT_NAME = "StoreSync POS";
export const PRODUCT_TAGLINE = "Smart Billing. Smooth Business.";
export const PRODUCT_SLUG = "storesync-pos";
export const DEFAULT_BUSINESS_NAME = "Your Business";
export const DEFAULT_RECEIPT_FOOTER = "Thank you for your business.";

export function normalizeBusinessName(businessName?: string | null) {
  return businessName?.trim() || DEFAULT_BUSINESS_NAME;
}

function initialsForName(name: string) {
  const words = name.match(/[A-Za-z0-9]+/g) ?? [];
  const letters =
    words.length > 1
      ? words.slice(0, 2).map((word) => word[0])
      : [words[0]?.[0], words[0]?.[1]].filter(Boolean);

  return letters.join("").toUpperCase() || "SP";
}

export function businessInitials(businessName?: string | null) {
  return initialsForName(normalizeBusinessName(businessName));
}

export function productInitials() {
  return initialsForName(PRODUCT_NAME);
}

export function posTitle(businessName?: string | null) {
  const name = businessName?.trim();
  return name ? `${name} POS` : PRODUCT_NAME;
}
