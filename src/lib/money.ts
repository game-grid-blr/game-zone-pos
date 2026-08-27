export function formatMoney(amountInPaise: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2
  }).format(amountInPaise / 100);
}

export function rupeesToPaise(value: number) {
  return Math.round(Number(value || 0) * 100);
}

export function paiseToRupees(value: number) {
  return Number((value / 100).toFixed(2));
}
