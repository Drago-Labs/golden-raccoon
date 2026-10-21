import type { StateEvidence } from "./schema";

/** Protocol base reserve: 0.5 XLM, before sponsorship and liabilities. */
const BASE_RESERVE_STROOPS = 5_000_000n;

export type AccountSnapshot = {
  id: string;
  sequence: string;
  subentry_count: number;
  observed_ledger: number | null;
  balances: Array<{ asset_type: string; balance: string }>;
};

export type LedgerContext = {
  ledger: number;
  envelopeSequence: string | null;
  failingAmountStroops: string | null;
  failingCode: string | null;
};

function nativeBalance(snapshot: AccountSnapshot): string | null {
  const native = snapshot.balances.find((balance) => balance.asset_type === "native");
  return native?.balance ?? null;
}

function stroopsFromDecimal(value: string): bigint | null {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10_000_000n + BigInt(fraction.padEnd(7, "0"));
}

function xlmFromStroops(value: bigint): string {
  const negative = value < 0n;
  const absolute = negative ? -value : value;
  const whole = absolute / 10_000_000n;
  const fraction = (absolute % 10_000_000n).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

function baseReserveXlm(subentryCount: number): string {
  const entries = BigInt(Math.max(0, subentryCount));
  return xlmFromStroops((2n + entries) * BASE_RESERVE_STROOPS);
}

/**
 * Describe recorded account state. A missing or non-historical snapshot is an
 * evidence gap. It is never replaced with a guessed balance or sequence.
 */
export function interpretLedgerState(account: string, snapshot: AccountSnapshot | null, context: LedgerContext): StateEvidence {
  if (!snapshot) {
    return {
      account,
      status: "missing",
      sequence: null,
      nativeBalance: null,
      baseReserveXlm: null,
      note: "Historical account state was not available. No balance or sequence was guessed.",
    };
  }

  const balance = nativeBalance(snapshot);
  const reserve = baseReserveXlm(snapshot.subentry_count);
  const historical = snapshot.observed_ledger === context.ledger;

  if (!historical) {
    return {
      account,
      status: "not_historical",
      sequence: snapshot.sequence,
      nativeBalance: balance,
      baseReserveXlm: reserve,
      note: "This snapshot is not from the failure ledger. It was not used to explain the result code.",
    };
  }

  const notes: string[] = [];
  if (context.envelopeSequence && snapshot.sequence) {
    let expected = snapshot.sequence;
    try {
      expected = (BigInt(snapshot.sequence) + 1n).toString();
    } catch {
      expected = snapshot.sequence;
    }
    if (expected === context.envelopeSequence) {
      notes.push(`Recorded sequence ${snapshot.sequence} matches the envelope sequence ${context.envelopeSequence}.`);
    } else {
      notes.push(
        `Recorded sequence ${snapshot.sequence} does not match the envelope. The next accepted sequence would be ${expected}; the envelope uses ${context.envelopeSequence}.`,
      );
    }
  }

  if (context.failingCode === "op_underfunded" && balance && context.failingAmountStroops) {
    const held = stroopsFromDecimal(balance);
    const reserveStroops = (2n + BigInt(Math.max(0, snapshot.subentry_count))) * BASE_RESERVE_STROOPS;
    let payment: bigint | null = null;
    try {
      payment = BigInt(context.failingAmountStroops);
    } catch {
      payment = null;
    }
    if (held !== null && payment !== null) {
      const spendable = held - reserveStroops;
      notes.push(
        `Recorded native balance ${balance} XLM, base reserve ${reserve} XLM, payment ${xlmFromStroops(payment)} XLM. Spendable above the base reserve is ${xlmFromStroops(spendable)} XLM. Sponsorship and liabilities are not included.`,
      );
    }
  }

  if (notes.length === 0) {
    notes.push("Historical account state was recorded. It does not add a result code beyond the transaction result.");
  }

  return {
    account,
    status: "historical",
    sequence: snapshot.sequence,
    nativeBalance: balance,
    baseReserveXlm: reserve,
    note: notes.join(" "),
  };
}
