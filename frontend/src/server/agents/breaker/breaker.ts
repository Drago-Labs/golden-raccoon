import type { AgentResult } from "@/server/types";
import {
  type AgentBreakerSnapshot,
  type CircuitBreakerOptions,
  type CircuitBreakerState,
  DEFAULT_BREAKER_SETTINGS,
} from "./state";

/**
 * Error raised when an execution attempt is rejected due to an open circuit breaker.
 */
export class CircuitBreakerOpenError extends Error {
  constructor(
    readonly agent: AgentResult["agent"],
    readonly remainingCooldownMs: number,
  ) {
    super(`Circuit breaker is open for agent '${agent}'. Next probe in ${remainingCooldownMs}ms.`);
    this.name = "CircuitBreakerOpenError";
  }
}

/**
 * Callback signature for circuit breaker state transitions.
 */
export type BreakerTransitionListener = (
  agent: AgentResult["agent"],
  from: CircuitBreakerState,
  to: CircuitBreakerState,
  reason: string,
) => void;

const transitionListeners: BreakerTransitionListener[] = [];

/**
 * Registers a listener for circuit breaker state changes across all agents.
 *
 * @param listener Function to invoke when a state transition occurs.
 * @returns Deregistration callback.
 */
export function onCircuitBreakerTransition(listener: BreakerTransitionListener): () => void {
  transitionListeners.push(listener);
  return () => {
    const index = transitionListeners.indexOf(listener);
    if (index >= 0) {
      transitionListeners.splice(index, 1);
    }
  };
}

import { logInfo, logWarn } from "@/server/observability/logger/logger";

function notifyTransition(
  agent: AgentResult["agent"],
  from: CircuitBreakerState,
  to: CircuitBreakerState,
  reason: string,
): void {
  try {
    if (to === "open") {
      logWarn("agents.breaker", `Circuit breaker opened for ${agent}: ${reason}`, { agent, from, to, reason });
    } else {
      logInfo("agents.breaker", `Circuit breaker transitioned for ${agent} from ${from} to ${to}: ${reason}`, { agent, from, to, reason });
    }
  } catch {
    // Logging must never interrupt execution
  }

  for (const listener of transitionListeners) {
    try {
      listener(agent, from, to, reason);
    } catch {
      // Listeners must never fail the execution flow.
    }
  }
}

/**
 * Manages fault detection and circuit state per agent.
 */
export class CircuitBreaker {
  private state: CircuitBreakerState = "closed";
  private consecutiveFailures = 0;
  private consecutiveSuccesses = 0;
  private lastFailureTime?: number;
  private nextProbeTime?: number;
  private lastStateChange: number;
  private activeProbeRunning = false;
  private failureThreshold: number;
  private openDurationMs: number;
  private clock: () => number;

  constructor(
    readonly agent: AgentResult["agent"],
    options?: CircuitBreakerOptions,
  ) {
    this.failureThreshold = options?.failureThreshold ?? DEFAULT_BREAKER_SETTINGS.failureThreshold;
    this.openDurationMs = options?.cooldownMs ?? options?.openDurationMs ?? DEFAULT_BREAKER_SETTINGS.openDurationMs;
    this.clock = options?.clock ?? Date.now;
    this.lastStateChange = this.clock();
  }

  /**
   * Returns the agent associated with this circuit breaker.
   */
  getAgent(): AgentResult["agent"] {
    return this.agent;
  }

  /**
   * Returns the number of consecutive failures currently observed.
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Current lifecycle state of the breaker.
   */
  getState(): CircuitBreakerState {
    this.checkStateTransition();
    return this.state;
  }

  /**
   * Determines if an execution attempt is allowed.
   */
  canExecute(): { allowed: boolean; reason?: string } {
    this.checkStateTransition();

    if (this.state === "closed") {
      return { allowed: true };
    }

    if (this.state === "half-open") {
      if (this.activeProbeRunning) {
        return {
          allowed: false,
          reason: `Breaker is half-open with an active probe running for agent '${this.agent}'.`,
        };
      }
      return { allowed: true };
    }

    const remaining = Math.max(0, (this.nextProbeTime ?? 0) - this.clock());
    return {
      allowed: false,
      reason: `Breaker is open for agent '${this.agent}' (cooldown remaining: ${remaining}ms).`,
    };
  }

  /**
   * Executes an action under the protection of this circuit breaker.
   *
   * @param action Async operation to execute.
   * @returns Result of the action.
   */
  async execute<T>(action: () => Promise<T>): Promise<T> {
    const check = this.canExecute();
    if (!check.allowed) {
      const remaining = Math.max(0, (this.nextProbeTime ?? 0) - this.clock());
      throw new CircuitBreakerOpenError(this.agent, remaining);
    }

    if (this.state === "half-open") {
      this.activeProbeRunning = true;
    }

    try {
      const result = await action();
      this.recordSuccess();
      return result;
    } catch (error) {
      this.recordFailure(error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      this.activeProbeRunning = false;
    }
  }

  /**
   * Records a successful execution.
   */
  recordSuccess(): void {
    const previousState = this.state;
    this.consecutiveSuccesses += 1;
    this.consecutiveFailures = 0;

    if (this.state === "half-open") {
      this.transitionTo("closed", "Half-open probe succeeded; closing circuit breaker.");
    }
  }

  /**
   * Records a failed execution.
   *
   * @param reason Failure explanation.
   */
  recordFailure(reason: string): void {
    const now = this.clock();
    this.lastFailureTime = now;
    this.consecutiveFailures += 1;
    this.consecutiveSuccesses = 0;

    if (this.state === "half-open") {
      this.nextProbeTime = now + this.openDurationMs;
      this.transitionTo("open", `Half-open probe failed: ${reason}. Reopening breaker.`);
      return;
    }

    if (this.state === "closed" && this.consecutiveFailures >= this.failureThreshold) {
      this.nextProbeTime = now + this.openDurationMs;
      this.transitionTo("open", `Failure threshold (${this.failureThreshold}) breached: ${reason}.`);
    }
  }

  /**
   * Resets the breaker to its clean, closed state.
   */
  reset(): void {
    const previous = this.state;
    this.state = "closed";
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = undefined;
    this.nextProbeTime = undefined;
    this.activeProbeRunning = false;
    this.lastStateChange = this.clock();

    if (previous !== "closed") {
      notifyTransition(this.agent, previous, "closed", "Manual reset to closed state.");
    }
  }

  /**
   * Captures an immutable snapshot of this breaker's state.
   */
  getSnapshot(): AgentBreakerSnapshot {
    this.checkStateTransition();
    return {
      agent: this.agent,
      state: this.state,
      consecutiveFailures: this.consecutiveFailures,
      consecutiveSuccesses: this.consecutiveSuccesses,
      lastFailureTime: this.lastFailureTime,
      nextProbeTime: this.nextProbeTime,
      lastStateChange: this.lastStateChange,
    };
  }

  private checkStateTransition(): void {
    if (this.state === "open" && typeof this.nextProbeTime === "number") {
      if (this.clock() >= this.nextProbeTime) {
        this.transitionTo("half-open", "Cooldown elapsed; transitioning to half-open probe.");
      }
    }
  }

  private transitionTo(nextState: CircuitBreakerState, reason: string): void {
    const previous = this.state;
    if (previous === nextState) {
      return;
    }
    this.state = nextState;
    this.lastStateChange = this.clock();
    notifyTransition(this.agent, previous, nextState, reason);
  }
}

const registry = new Map<AgentResult["agent"], CircuitBreaker>();

/**
 * Retrieves or initializes the singleton CircuitBreaker for an agent.
 *
 * @param agent Target agent name.
 * @param options Configuration overrides for newly instantiated breakers.
 * @returns Agent's CircuitBreaker instance.
 */
export function getAgentCircuitBreaker(
  agent: AgentResult["agent"],
  options?: CircuitBreakerOptions,
): CircuitBreaker {
  const existing = registry.get(agent);
  if (existing) {
    return existing;
  }
  const breaker = new CircuitBreaker(agent, options);
  registry.set(agent, breaker);
  return breaker;
}

/**
 * Resets all registered agent circuit breakers back to closed status.
 */
export function resetAgentCircuitBreakers(): void {
  for (const breaker of registry.values()) {
    breaker.reset();
  }
  registry.clear();
}
