const CENTS_PER_UNIT = 100;

export function formatMoney(cents: number, currency: string): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / CENTS_PER_UNIT);
}

/** Parses a human price like "9.99" into integer cents; null when not a valid non-negative amount. */
export function parsePriceToCents(input: string): number | null {
  const normalized = input.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return null;
  }
  return Math.round(Number.parseFloat(normalized) * CENTS_PER_UNIT);
}

export function centsToPriceInput(cents: number): string {
  return (cents / CENTS_PER_UNIT).toFixed(2);
}
