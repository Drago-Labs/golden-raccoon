import { StrKey } from "@stellar/stellar-sdk";
import type { DetectedFormat } from "./schema";
import type { DecodedDataValue } from "./valueDecoder";

/**
 * Classify the raw bytes. A 32-byte value is a hash only when it is not text;
 * an account or contract id is recognised from its strkey text, not from the raw length.
 */
export function detectFormat(decoded: DecodedDataValue): DetectedFormat {
  const text = decoded.utf8;
  if (text && StrKey.isValidEd25519PublicKey(text)) return "account_id";
  if (text && StrKey.isValidContract(text)) return "contract_id";
  if (text && /^https?:\/\/\S+$/.test(text)) return "url";
  if (text && /^[a-fA-F0-9]{64}$/.test(text)) return "hash";
  if (!decoded.text && decoded.byteLength === 32) return "hash";
  if (decoded.text) return "text";
  return "binary";
}
