/**
 * Code reads, normalized into evidence.
 *
 * A code read answers exactly one question — did this address hold code at the
 * checked block — and the answer has three states, not two. "No code" and "the
 * read failed" are different facts, and conflating them is how an inspector
 * ends up calling an unreachable contract an EOA.
 */
import { PROXY_LIMITS, type ChainReader, type CodeObservation, type ScopedAddress } from "./schema";

export async function readCode(
  reader: ChainReader,
  target: ScopedAddress,
  block: string,
): Promise<CodeObservation> {
  try {
    const code = await reader.getCode(target.address, block);
    const body = typeof code === "string" && code.startsWith("0x") ? code.slice(2) : "";

    if (typeof code !== "string" || !code.startsWith("0x")) {
      return {
        target,
        hasCode: false,
        codeSizeBytes: null,
        codePreview: null,
        unavailableReason: "The code read returned a value that was not hex.",
      };
    }

    const hasCode = body.length > 0 && /[1-9a-fA-F]/.test(body);

    return {
      target,
      hasCode,
      codeSizeBytes: Math.floor(body.length / 2),
      codePreview: hasCode ? `0x${body.slice(0, PROXY_LIMITS.maxCodePreviewBytes * 2)}` : "0x",
      unavailableReason: null,
    };
  } catch (error) {
    return {
      target,
      hasCode: false,
      codeSizeBytes: null,
      codePreview: null,
      unavailableReason: readerMessage(error, "The code read did not complete."),
    };
  }
}

export function readerMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    // Provider messages are surfaced because "it failed" is not evidence, but
    // they are bounded: a provider cannot push an essay into the report.
    return error.message.trim().slice(0, 200);
  }

  return fallback;
}
