/**
 * Turn the two observations into one list of comparable fields.
 *
 * Horizon prints amounts in decimal XLM. RPC prints stroops. Both become
 * integer stroops here, with no floating point, so a trailing-zero difference
 * is not a conflict. A value with more than seven decimal places is refused
 * rather than rounded.
 */
import type {
  ContractDataEntry,
  FieldSide,
  HorizonAccount,
  HorizonObservation,
  HorizonTrustline,
  NormalizedField,
  RpcAccount,
  RpcObservation,
  RpcTrustline,
} from "./schema";

const STROOPS_SCALE = 10_000_000n;

export function decimalToStroops(value: string | null | undefined): string | null {
  if (value == null) return null;

  const trimmed = value.trim();

  if (trimmed === "" || trimmed.startsWith("-")) return null;

  const [whole, fraction = ""] = trimmed.split(".");

  if (!/^\d+$/.test(whole) || (fraction !== "" && !/^\d+$/.test(fraction)) || fraction.length > 7) {
    return null;
  }

  const padded = (fraction + "0000000").slice(0, 7);

  return (BigInt(whole) * STROOPS_SCALE + BigInt(padded)).toString();
}

export function canonicalInteger(value: string | null | undefined): string | null {
  if (value == null) return null;

  const trimmed = value.trim();

  if (!/^\d+$/.test(trimmed)) return null;

  return BigInt(trimmed).toString();
}

function side(ledger: number | null, value: string | null, raw: unknown): FieldSide | null {
  if (value == null && ledger == null && raw == null) return null;

  return { ledger, value, raw };
}

function trustlineId(code: string, issuer: string): string {
  return `trustline:${code}:${issuer}`;
}

function horizonTrustlineValue(trustline: HorizonTrustline): string | null {
  const balance = decimalToStroops(trustline.balance);
  const limit = decimalToStroops(trustline.limit);

  if (balance == null && limit == null) return null;

  return `${balance ?? ""}/${limit ?? ""}`;
}

function rpcTrustlineValue(trustline: RpcTrustline): string | null {
  const balance = canonicalInteger(trustline.balanceStroops);
  const limit = canonicalInteger(trustline.limitStroops);

  if (balance == null && limit == null) return null;

  return `${balance ?? ""}/${limit ?? ""}`;
}

function pushAccountFields(
  fields: NormalizedField[],
  horizon: HorizonAccount | null,
  rpc: RpcAccount | null,
): void {
  const horizonNative = horizon
    ? side(horizon.ledger, decimalToStroops(horizon.nativeBalance), horizon.nativeRaw ?? horizon.raw)
    : null;
  const rpcNative = rpc
    ? side(rpc.ledger, canonicalInteger(rpc.nativeBalanceStroops), rpc.raw)
    : null;

  if (horizonNative?.value != null || rpcNative?.value != null) {
    fields.push({
      fieldId: "native_balance",
      kind: "native_balance",
      label: "Native balance",
      horizon: horizonNative?.value != null ? horizonNative : null,
      rpc: rpcNative?.value != null ? rpcNative : null,
    });
  }

  const horizonSequence = horizon ? side(horizon.ledger, canonicalInteger(horizon.sequence), horizon.raw) : null;
  const rpcSequence = rpc ? side(rpc.ledger, canonicalInteger(rpc.sequence), rpc.raw) : null;

  if (horizonSequence?.value != null || rpcSequence?.value != null) {
    fields.push({
      fieldId: "sequence",
      kind: "sequence",
      label: "Sequence number",
      horizon: horizonSequence?.value != null ? horizonSequence : null,
      rpc: rpcSequence?.value != null ? rpcSequence : null,
    });
  }

  const horizonLines = new Map((horizon?.trustlines ?? []).map((line) => [trustlineId(line.code, line.issuer), line]));
  const rpcLines = new Map((rpc?.trustlines ?? []).map((line) => [trustlineId(line.code, line.issuer), line]));
  const ids = [...new Set([...horizonLines.keys(), ...rpcLines.keys()])].sort();

  for (const id of ids) {
    const left = horizonLines.get(id);
    const right = rpcLines.get(id);
    const leftSide = left ? side(horizon?.ledger ?? null, horizonTrustlineValue(left), left.raw) : null;
    const rightSide = right ? side(right.ledger, rpcTrustlineValue(right), right.raw) : null;

    if (leftSide?.value == null && rightSide?.value == null) continue;

    const code = left?.code ?? right?.code ?? id;
    const issuer = left?.issuer ?? right?.issuer ?? "";

    fields.push({
      fieldId: id,
      kind: "trustline",
      label: `Trustline ${code} (${issuer})`,
      horizon: leftSide?.value != null ? leftSide : null,
      rpc: rightSide?.value != null ? rightSide : null,
    });
  }
}

function pushContractFields(
  fields: NormalizedField[],
  horizonEntries: ContractDataEntry[],
  rpcEntries: ContractDataEntry[],
): void {
  const left = new Map(horizonEntries.map((entry) => [entry.key, entry]));
  const right = new Map(rpcEntries.map((entry) => [entry.key, entry]));
  const keys = [...new Set([...left.keys(), ...right.keys()])].sort();

  for (const key of keys) {
    const horizonEntry = left.get(key);
    const rpcEntry = right.get(key);
    const horizonSide = horizonEntry ? side(horizonEntry.ledger, horizonEntry.value, horizonEntry.raw) : null;
    const rpcSide = rpcEntry ? side(rpcEntry.ledger, rpcEntry.value, rpcEntry.raw) : null;

    if (horizonSide?.value == null && rpcSide?.value == null) continue;

    fields.push({
      fieldId: `contract_data:${key}`,
      kind: "contract_data",
      label: `Contract data ${key}`,
      horizon: horizonSide?.value != null ? horizonSide : null,
      rpc: rpcSide?.value != null ? rpcSide : null,
    });
  }
}

export function normalizeObservations(input: {
  horizon: HorizonObservation | null;
  rpc: RpcObservation | null;
}): NormalizedField[] {
  const fields: NormalizedField[] = [];
  const horizonAccount = input.horizon?.account ?? null;
  const rpcAccount = input.rpc?.account ?? null;

  if (input.horizon?.account || input.rpc?.account) {
    pushAccountFields(fields, horizonAccount, rpcAccount);
  }

  pushContractFields(fields, input.horizon?.contractEntries ?? [], input.rpc?.contractEntries ?? []);

  return fields;
}
