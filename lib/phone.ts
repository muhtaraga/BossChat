/**
 * Telefon numarasını E.164 benzeri bir formata normalize eder.
 * "0555 123 45 67" -> "+905551234567" (TR varsayılanı ile)
 */
export function normalizePhone(input: string): string | null {
  let digits = input.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  digits = digits.replace(/\D/g, "");

  // TR kolaylıkları: 05xx... -> 905xx..., 5xx... (10 hane) -> 905xx...
  if (digits.length === 11 && digits.startsWith("0")) digits = "9" + digits;
  if (digits.length === 10 && digits.startsWith("5")) digits = "90" + digits;

  if (digits.length < 10 || digits.length > 15) return null;
  return "+" + digits;
}
