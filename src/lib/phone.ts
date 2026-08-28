const INDIAN_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export function normalizeCustomerPhone(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, "");
  const mobile = digits.length === 12 && digits.startsWith("91") ? digits.slice(2) : digits;
  if (!INDIAN_MOBILE_PATTERN.test(mobile)) return null;

  return `+91${mobile}`;
}

export function whatsappPhoneNumber(value?: string | null) {
  const normalized = normalizeCustomerPhone(value);
  return normalized ? normalized.replace(/\D/g, "") : null;
}
