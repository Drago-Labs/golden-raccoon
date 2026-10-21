import { xdr } from "@stellar/stellar-sdk";
import { TxFailureDiagnosticsError } from "./errors";

export type DecodedOperationResult = {
  type: string;
  resultCode: string;
};

export type DecodedEnvelopeOperation = {
  index: number;
  type: string;
  sourceAccount: string | null;
  destination: string | null;
  amountStroops: string | null;
  asset: string | null;
};

export type DecodedEnvelope = {
  sourceAccount: string | null;
  feeSource: string | null;
  sequence: string | null;
  operations: DecodedEnvelopeOperation[];
};

export type DecodedFeeBump = {
  outerCode: string;
  innerCode: string;
  innerFeeChargedStroops: string;
  innerHash: string;
  operationResults: DecodedOperationResult[];
};

export type DecodedResult = {
  feeChargedStroops: string;
  code: string;
  operationResults: DecodedOperationResult[];
  feeBump: DecodedFeeBump | null;
};

function toPlain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function soleKey(value: unknown): { key: string; payload: unknown } | null {
  const record = asRecord(value);
  if (!record) return null;
  const key = Object.keys(record)[0];
  if (!key) return null;
  return { key, payload: record[key] };
}

function operationResultCode(entry: unknown): DecodedOperationResult {
  const arm = soleKey(entry);
  if (!arm) return { type: "unknown", resultCode: "unknown" };
  if (arm.key !== "op_inner") return { type: "operation", resultCode: arm.key };

  const inner = soleKey(arm.payload);
  if (!inner) return { type: "operation", resultCode: "op_inner" };
  const code = typeof inner.payload === "string" ? `op_${inner.payload}` : `op_${inner.key}`;
  return { type: inner.key, resultCode: code };
}

function mapOperationResults(payload: unknown): DecodedOperationResult[] {
  if (!Array.isArray(payload)) return [];
  return payload.map(operationResultCode);
}

export function decodeResultXdr(resultXdr: string): DecodedResult {
  let plain: unknown;
  try {
    plain = toPlain(xdr.TransactionResult.fromXDR(resultXdr, "base64"));
  } catch {
    throw new TxFailureDiagnosticsError("invalid_xdr", "Result XDR could not be decoded.");
  }

  const root = asRecord(plain);
  const feeChargedStroops = root ? String(root.fee_charged ?? "") : "";
  const result = root?.result;

  if (typeof result === "string") {
    return { feeChargedStroops, code: result, operationResults: [], feeBump: null };
  }

  const arm = soleKey(result);
  if (!arm) {
    throw new TxFailureDiagnosticsError("invalid_xdr", "Result XDR did not contain a result code.");
  }

  if (arm.key === "tx_fee_bump_inner_failed" || arm.key === "tx_fee_bump_inner_success") {
    const pair = asRecord(arm.payload);
    const inner = asRecord(pair?.result);
    const innerResult = inner?.result;
    const innerCode = typeof innerResult === "string" ? innerResult : soleKey(innerResult)?.key;
    if (!innerCode) {
      throw new TxFailureDiagnosticsError("invalid_xdr", "Fee-bump result did not contain an inner code.");
    }
    const innerPayload = typeof innerResult === "string" ? [] : soleKey(innerResult)?.payload;
    return {
      feeChargedStroops,
      code: arm.key,
      operationResults: mapOperationResults(innerPayload),
      feeBump: {
        outerCode: arm.key,
        innerCode,
        innerFeeChargedStroops: String(inner?.fee_charged ?? ""),
        innerHash: String(pair?.transaction_hash ?? ""),
        operationResults: mapOperationResults(innerPayload),
      },
    };
  }

  return {
    feeChargedStroops,
    code: arm.key,
    operationResults: mapOperationResults(arm.payload),
    feeBump: null,
  };
}

function paymentFields(body: unknown): { destination: string | null; amountStroops: string | null; asset: string | null } {
  const record = asRecord(body);
  const payment = asRecord(record?.payment);
  if (!payment) return { destination: null, amountStroops: null, asset: null };
  return {
    destination: typeof payment.destination === "string" ? payment.destination : null,
    amountStroops: payment.amount === undefined ? null : String(payment.amount),
    asset: payment.asset === undefined ? null : String(payment.asset),
  };
}

function mapOperations(operations: unknown, fallbackSource: string | null): DecodedEnvelopeOperation[] {
  if (!Array.isArray(operations)) return [];
  return operations.map((entry, index) => {
    const operation = asRecord(entry);
    const body = operation?.body;
    const type = soleKey(body)?.key ?? "unknown";
    const source = operation?.source_account;
    const fields = paymentFields(body);
    return {
      index,
      type,
      sourceAccount: typeof source === "string" ? source : fallbackSource,
      destination: fields.destination,
      amountStroops: fields.amountStroops,
      asset: fields.asset,
    };
  });
}

function classicTransaction(value: unknown): { source: string | null; sequence: string | null; operations: unknown } | null {
  const record = asRecord(value);
  if (!record) return null;
  return {
    source: typeof record.source_account === "string" ? record.source_account : null,
    sequence: record.seq_num === undefined ? null : String(record.seq_num),
    operations: record.operations,
  };
}

export function decodeEnvelopeXdr(envelopeXdr: string): DecodedEnvelope {
  let plain: unknown;
  try {
    plain = toPlain(xdr.TransactionEnvelope.fromXDR(envelopeXdr, "base64"));
  } catch {
    throw new TxFailureDiagnosticsError("invalid_xdr", "Envelope XDR could not be decoded.");
  }

  const arm = soleKey(plain);
  if (!arm) {
    throw new TxFailureDiagnosticsError("invalid_xdr", "Envelope XDR did not contain a transaction.");
  }

  if (arm.key === "tx" || arm.key === "tx_v0") {
    const wrapper = asRecord(arm.payload);
    const tx = classicTransaction(wrapper?.tx);
    return {
      sourceAccount: tx?.source ?? null,
      feeSource: null,
      sequence: tx?.sequence ?? null,
      operations: mapOperations(tx?.operations, tx?.source ?? null),
    };
  }

  if (arm.key === "tx_fee_bump") {
    const bump = asRecord(asRecord(arm.payload)?.tx);
    const innerEnvelope = asRecord(bump?.inner_tx);
    const innerWrapper = asRecord(innerEnvelope?.tx);
    const inner = classicTransaction(innerWrapper?.tx);
    return {
      sourceAccount: inner?.source ?? null,
      feeSource: typeof bump?.fee_source === "string" ? bump.fee_source : null,
      sequence: inner?.sequence ?? null,
      operations: mapOperations(inner?.operations, inner?.source ?? null),
    };
  }

  return { sourceAccount: null, feeSource: null, sequence: null, operations: [] };
}
