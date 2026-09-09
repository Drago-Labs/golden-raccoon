import type { AgentResult } from "@/server/types";

/**
 * Lifecycle states of an agent circuit breaker.
 */
export type CircuitBreakerState = "closed" | "open" | "half-open";

/**
 * Configuration options for circuit breaker thresholds and timeouts.
 */
export interface CircuitBreakerOptions {
  failureThreshold?: number;
  openDurationMs?: number;
  cooldownMs?: number;
  clock?: () => number;
}

/**
 * Resolved circuit breaker settings.
 */
export interface CircuitBreakerSettings {
  failureThreshold: number;
  openDurationMs: number;
}

/**
 * Default circuit breaker settings for agent execution.
 */
export const DEFAULT_BREAKER_SETTINGS: CircuitBreakerSettings = {
  failureThreshold: 3,
  openDurationMs: 30_000,
};

/**
 * Snapshot representation of an agent's circuit breaker state.
 */
export interface AgentBreakerSnapshot {
  agent: AgentResult["agent"];
  state: CircuitBreakerState;
  consecutiveFailures: number;
  consecutiveSuccesses: number;
  lastFailureTime?: number;
  nextProbeTime?: number;
  lastStateChange: number;
}
