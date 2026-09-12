import type { AgentResult } from "@/server/types";

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

export function redactSecrets(value: unknown): string {
  let serialized = typeof value === "string" ? value : (JSON.stringify(value) ?? String(value));
  serialized = serialized
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer [REDACTED]")
    .replace(/sk-[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/cqt_[A-Za-z0-9._-]+/g, "[REDACTED]")
    .replace(/(api[_-]?key=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/(authorization["']?\s*:\s*["'])[^"']+(["'])/gi, "$1[REDACTED]$2")
    .replace(/AAAAA[gG].{20,}/g, "[REDACTED]")
    .replace(/0x02[fF][0-9a-fA-F]{20,}/g, "[REDACTED]")
    .replace(/(x-payment-header:\s*)([^,\n]+)/gi, "$1[REDACTED]")
    .replace(/S[A-Z0-9]{55}/g, "[REDACTED]")
    .replace(/(https?:\/\/)[^/@\s]+@/gi, "$1[REDACTED]@")
    .replace(/([?&](?:token|key|api[_-]?key|secret|authorization)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/gr_wallet_session=[^;\s]+/gi, "gr_wallet_session=[REDACTED]")
    .replace(/\bv[23]:[a-zA-Z0-9_.-]+:[a-zA-Z0-9_.-]+(?::[a-zA-Z0-9_.-]+)?(?::[a-zA-Z0-9_.-]+)?\b/g, "[SESSION_TOKEN_REDACTED]")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[UUID_REDACTED]")
    .replace(/\bG[A-Z2-7]{55}\b/g, "[WALLET_REDACTED]")
    .replace(/\b0x[a-fA-F0-9]{40}\b/g, "[WALLET_REDACTED]");
  return serialized;
}

/**
 * Truncates and redacts a wallet address to produce an opaque hint.
 *
 * @param address The raw EVM or Stellar wallet address.
 * @returns A safe, non-identifying hint showing only initial and trailing characters.
 */
export function redactWalletAddress(address: string): string {
  if (!address || typeof address !== "string") return "";
  const trimmed = address.trim();
  if (trimmed.length < 10) return "[WALLET_REDACTED]";
  return `${trimmed.slice(0, 6)}…${trimmed.slice(-4)}`;
}

/**
 * Recursively redacts sensitive keys and payload contents from arbitrary data structures.
 *
 * @param value The arbitrary object, array, or scalar to sanitize.
 * @returns A sanitized deep copy safe for logging or telemetry.
 */
export function redactSensitiveObject(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") {
    if (typeof value === "string") {
      return redactSecrets(value);
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveObject(item));
  }
  const result: Record<string, unknown> = {};
  const sensitiveKeyPatterns = /^(secret|secretkey|privatekey|password|seed|auth|authorization|token|apikey|api_key|sessionid|session_id|devicefingerprint|device_fingerprint|cookie)$/i;
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (sensitiveKeyPatterns.test(k)) {
      result[k] = "[REDACTED_PAYLOAD]";
    } else {
      result[k] = redactSensitiveObject(v);
    }
  }
  return result;
}

/**
 * Constructs a structured log entry for an agent execution outcome.
 *
 * @param result The agent execution result.
 * @param message An optional log message prefix.
 * @returns The structured agent log with secrets and identifiers redacted.
 */
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
