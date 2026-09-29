/**
 * Redact credentials, wallet identifiers, and raw private payloads from probe
 * artifacts. Values are dropped, never forwarded.
 */

const SENSITIVE_KEY =
  /^(authorization|api[_-]?key|apikey|secret|password|private[_-]?key|seed|mnemonic|cookie|token|raw|wallet|credential)$/i;

const WALLET_LIKE = /^(G[A-Z0-9]{55}|0x[a-fA-F0-9]{40})$/;

export type RedactionResult = {
  value: unknown;
  droppedKeys: string[];
  droppedWalletLike: number;
};

export function redactValue(input: unknown, options: { scrubWallets?: boolean } = {}): RedactionResult {
  const scrubWallets = options.scrubWallets ?? true;
  const droppedKeys: string[] = [];
  let droppedWalletLike = 0;

  function walk(value: unknown, current: string): unknown {
    if (Array.isArray(value)) {
      return value.map((entry, index) => walk(entry, `${current}[${index}]`));
    }

    if (value && typeof value === "object") {
      const output: Record<string, unknown> = {};
      for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        const next = current ? `${current}.${key}` : key;
        if (SENSITIVE_KEY.test(key)) {
          droppedKeys.push(next);
          continue;
        }
        output[key] = walk(child, next);
      }
      return output;
    }

    if (scrubWallets && typeof value === "string" && WALLET_LIKE.test(value.trim())) {
      droppedWalletLike += 1;
      return "[redacted-wallet]";
    }

    return value;
  }

  return {
    value: walk(input, ""),
    droppedKeys,
    droppedWalletLike,
  };
}
