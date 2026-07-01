type UsdFormatOptions = {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
};

export function formatUsd(value: number, options: UsdFormatOptions = {}): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
    maximumFractionDigits: options.maximumFractionDigits ?? 0,
  }).format(value);
}

export function shortAddress(address?: string): string {
  if (!address) return "Demo wallet";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}
