export function knownBalanceExposure(allowance: bigint, balance: bigint | null): bigint | null {
  if (balance === null) return null;
  return allowance < balance ? allowance : balance;
}

export function formatTokenInteger(value: string | null, decimals: number | null): string {
  if (value === null) return "Unknown";
  if (decimals === null || decimals === 0) return value;
  const negative = value.startsWith("-");
  const digits = negative ? value.slice(1) : value;
  const padded = digits.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");
  return `${negative ? "-" : ""}${whole}${fraction ? `.${fraction}` : ""}`;
}
