const STROOPS_PER_UNIT = 10_000_000n;

export function stroopsToDecimal(stroops: string): string {
  const value = BigInt(stroops);
  const whole = value / STROOPS_PER_UNIT;
  const fractional = value % STROOPS_PER_UNIT;
  
  if (fractional === 0n) return whole.toString();
  
  const fractionalStr = fractional.toString().padStart(7, "0");
  return `${whole}.${fractionalStr}`.replace(/\.?0+$/, "");
}

export function decimalToStroops(decimal: string): string {
  const [whole = "0", fractional = "0"] = decimal.split(".");
  const wholeBig = BigInt(whole) * STROOPS_PER_UNIT;
  const fractionalPadded = fractional.padEnd(7, "0").slice(0, 7);
  const fractionalBig = BigInt(fractionalPadded);
  
  return (wholeBig + fractionalBig).toString();
}

export function decimalAdd(a: string, b: string): string {
  const aStroops = BigInt(decimalToStroops(a));
  const bStroops = BigInt(decimalToStroops(b));
  return stroopsToDecimal((aStroops + bStroops).toString());
}

export function decimalSubtract(a: string, b: string): string {
  const aStroops = BigInt(decimalToStroops(a));
  const bStroops = BigInt(decimalToStroops(b));
  return stroopsToDecimal((aStroops - bStroops).toString());
}

export function decimalMultiply(a: string, b: string): string {
  const aStroops = BigInt(decimalToStroops(a));
  const bStroops = BigInt(decimalToStroops(b));
  const result = (aStroops * bStroops) / STROOPS_PER_UNIT;
  return stroopsToDecimal(result.toString());
}

export function decimalDivide(a: string, b: string): string {
  const aStroops = BigInt(decimalToStroops(a));
  const bStroops = BigInt(decimalToStroops(b));
  const result = (aStroops * STROOPS_PER_UNIT) / bStroops;
  return stroopsToDecimal(result.toString());
}
