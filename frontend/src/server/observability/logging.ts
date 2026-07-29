import type { AgentResult } from "@/server/types";

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/g,
  /sk-[A-Za-z0-9._-]+/g,
  /cqt_[A-Za-z0-9._-]+/g,
  /(api[_-]?key=)[^&\s]+/gi,
  /(authorization["']?\s*:\s*["'])[^"']+(["'])/gi,
  /(x-402-payment-signature["']?\s*:\s*["'])[^"']+(["'])/gi,
  /(payment[-_]?signature["']?\s*:\s*["'])[^"']+(["'])/gi,
  /\b0x[a-fA-F0-9]{40}\b/g,
  /\bG[A-Z2-7]{55}\b/g,
];

export type StructuredAgentLog = {
  runId?: string;
  agent: AgentResult["agent"];
  provider?: string;
  latencyMs?: number;
  status: AgentResult["status"];
  errorCode?: string;
  sourceCount: number;
  message: string;
};

export function redactWalletAddress(wallet: string): string {
  const trimmed = wallet.trim();
  if (trimmed.length < 8) return "[REDACTED_WALLET]";
  const start = trimmed.slice(0, 4);
  const end = trimmed.slice(-4);
  return `${start}…${end}`;
}

export function redactSecrets(value: unknown): string {
  let serialized = typeof value === "string" ? value : JSON.stringify(value);

  // EVM wallets: 0x followed by 40 hex chars
  serialized = serialized.replace(/\b0x[a-fA-F0-9]{40}\b/g, (match) => `${match.slice(0, 6)}…${match.slice(-4)}`);

  // Stellar wallets: G followed by 55 base32 chars
  serialized = serialized.replace(/\bG[A-Z2-7]{55}\b/g, (match) => `${match.slice(0, 4)}…${match.slice(-4)}`);

  // Bearer tokens
  serialized = serialized.replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]");

  // API keys
  serialized = serialized.replace(/(api[_-]?key=)[^&\s]+/gi, "$1[REDACTED]");

  // Secret keys and tokens
  serialized = serialized.replace(/sk-[A-Za-z0-9._-]+/g, "[REDACTED]");
  serialized = serialized.replace(/cqt_[A-Za-z0-9._-]+/g, "[REDACTED]");

  // Header secrets
  serialized = serialized.replace(/(authorization["']?\s*:\s*["'])[^"']+(["'])/gi, "$1[REDACTED]$2");
  serialized = serialized.replace(/(x-402-payment-signature["']?\s*:\s*["'])[^"']+(["'])/gi, "$1[REDACTED]$2");
  serialized = serialized.replace(/(payment[-_]?signature["']?\s*:\s*["'])[^"']+(["'])/gi, "$1[REDACTED]$2");

  return serialized;
}

export function redactSensitiveObject<T>(data: T): T {
  if (typeof data === "string") {
    return redactSecrets(data) as unknown as T;
  }
  if (data && typeof data === "object") {
    if (Array.isArray(data)) {
      return data.map((item) => redactSensitiveObject(item)) as unknown as T;
    }
    const sanitized: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(data as Record<string, unknown>)) {
      const lowerKey = key.toLowerCase();
      if (
        lowerKey.includes("password") ||
        lowerKey.includes("privatekey") ||
        lowerKey.includes("secret") ||
        lowerKey.includes("auth") ||
        lowerKey.includes("payload") && lowerKey.includes("raw")
      ) {
        sanitized[key] = "[REDACTED_PAYLOAD]";
      } else {
        sanitized[key] = redactSensitiveObject(val);
      }
    }
    return sanitized as T;
  }
  return data;
}

export function createAgentLog(result: AgentResult, message = "agent_result"): StructuredAgentLog {
  const firstSource = result.sources[0];
  const orchestration = result.rawSignals?.orchestration as { runId?: string } | undefined;

  return {
    runId: orchestration?.runId,
    agent: result.agent,
    provider: firstSource?.provider ?? firstSource?.label,
    latencyMs: firstSource?.latencyMs,
    status: result.status,
    errorCode: firstSource?.errorCode,
    sourceCount: result.sources.length,
    message: redactSecrets(message),
  };
}
