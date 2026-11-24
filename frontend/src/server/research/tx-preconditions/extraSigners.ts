import { StrKey, type Transaction } from "@stellar/stellar-sdk";
import { TX_PRECONDITIONS_LIMITS } from "./limits";
import type { SignerRequirement } from "./schema";

function hintBytes(signature: { hint?: { value?: Uint8Array } | Uint8Array }): string | null {
  const hint = signature.hint;
  if (!hint) return null;
  const value = "value" in hint && hint.value ? hint.value : (hint as Uint8Array);
  try {
    return Buffer.from(value).toString("hex");
  } catch {
    return null;
  }
}

function encodeSigner(entry: unknown): { key: string; kind: string; hintHex: string | null } {
  const record = entry as {
    type?: string;
    ed25519?: { value?: Uint8Array };
    toXdrObject?: () => { switch?: () => { name: string }; ed25519?: () => Buffer | Uint8Array };
  };

  if (record?.ed25519?.value) {
    const bytes = Buffer.from(record.ed25519.value);
    return {
      key: StrKey.encodeEd25519PublicKey(bytes),
      kind: record.type ?? "ed25519",
      hintHex: bytes.subarray(bytes.length - 4).toString("hex"),
    };
  }

  try {
    const xdrObject = record.toXdrObject?.();
    const arm = xdrObject?.switch?.()?.name ?? "unknown";
    if (xdrObject?.ed25519) {
      const bytes = Buffer.from(xdrObject.ed25519());
      return {
        key: StrKey.encodeEd25519PublicKey(bytes),
        kind: arm,
        hintHex: bytes.subarray(bytes.length - 4).toString("hex"),
      };
    }
  } catch {
    // Fall through to an opaque label.
  }

  return { key: String(entry), kind: "unknown", hintHex: null };
}

/**
 * List CAP-21 extra signers and whether a matching signature hint is already on the envelope.
 * Cryptographic verification of signature payloads is out of scope; presence of a matching hint
 * is reported as the best read-only signal that the requirement can be satisfied as pasted.
 */
export function evaluateExtraSigners(inner: Transaction, rawSigners: unknown[]): SignerRequirement[] {
  const presentHints = new Set(
    inner.signatures
      .map((signature) => hintBytes(signature as { hint?: { value?: Uint8Array } | Uint8Array }))
      .filter((value): value is string => Boolean(value)),
  );

  return rawSigners.slice(0, TX_PRECONDITIONS_LIMITS.maxExtraSigners).map((entry) => {
    const encoded = encodeSigner(entry);
    const signaturePresent = encoded.hintHex !== null && presentHints.has(encoded.hintHex);

    return {
      key: encoded.key,
      kind: encoded.kind,
      signaturePresent,
      canBeSatisfied: signaturePresent,
      note: signaturePresent
        ? "A signature with a matching hint is already on the inner envelope."
        : "No matching signature hint is present. The envelope still needs a signature from this key before submission.",
    };
  });
}
