import type { AgentResult } from "@/server/types";

const secretPatterns = [
  /Bearer\s+[A-Za-z0-9._-]+/g,
  /sk-[A-Za-z0-9._-]+/g,
  /cqt_[A-Za-z0-9._-]+/g,
  /(api[_-]?key=)[^&\s]+/gi,
  /(authorization["']?\s*:\s*["'])[^"']+(["'])/gi,
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

export function redactSecrets(value: unknown): string {
  let serialized = typeof value === "string" ? value : JSON.stringify(value);

  for (const pattern of secretPatterns) {
    serialized = serialized.replace(pattern, (match, prefix, suffix) => {
      if (prefix && suffix) return `${prefix}[REDACTED]${suffix}`;
      if (match.startsWith("Bearer ")) return "Bearer [REDACTED]";
      if (match.startsWith("api_key=")) return "api_key=[REDACTED]";
      return "[REDACTED]";
    });
  }

  return serialized;
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
