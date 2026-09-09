# Agent Run Budgets and Circuit Breaking

This document details the design, defaults, and operational semantics of the agent run budget and circuit breaking subsystem introduced in response to #188.

## Motivation & Architecture

The multi-agent execution pipeline orchestrates specialist agents (`portfolio`, `onchain`, `news`, `social`, `decision`, `execution`) to assess token risk. Unchecked execution risks run-level exhaustion:
1. Slow external RPC or social endpoints stalling user scans indefinitely.
2. Flapping or failing upstream providers consuming rate limits and monetary budgets.
3. Partial agent failures silently injecting empty or default signals that skew composite scores.

To protect uptime and prediction integrity, budgets and breakers are housed directly under the agents surface:
- `frontend/src/server/agents/budget/`: Policy resolution, wall-clock deadline control, and invocation accounting.
- `frontend/src/server/agents/breaker/`: Per-agent circuit breakers tracking faults, cooldown periods, and half-open probing.

## 1. Budget Policies & Defaults

Budget defaults belong under the agent orchestration domain, separate from shared environment variables.

| Dimension | Default Limit | Purpose |
| --- | --- | --- |
| **Wall-clock Deadline** | `10,000 ms` | Maximum elapsed time for an orchestration run before remaining specialists are aborted. |
| **Run Monetary Spend** | `$0.50 USD` | Hard ceiling on total estimated upstream call costs across all specialists in a single run. |
| **Total Call Count** | `20 calls` | Maximum upstream network calls allowed per orchestration run. |

### Per-Agent Defaults

| Agent | Max Calls | Max Spend (USD) | Default Unit Cost |
| --- | --- | --- | --- |
| `portfolio` | 5 | $0.10 | $0.005 |
| `onchain` | 8 | $0.15 | $0.015 |
| `news` | 6 | $0.10 | $0.008 |
| `social` | 6 | $0.10 | $0.008 |
| `decision` | 2 | $0.05 | $0.002 |
| `execution` | 4 | $0.10 | $0.010 |

## 2. Cooperative Deadline Enforcement

`DeadlineController` manages wall-clock deadlines:
- Tracks start time and remaining milliseconds (`deadline.remainingMs`).
- Issues an `AbortSignal` upon timeout or cooperative cancellation.
- If the deadline elapses before or during an agent's execution, the agent yields a `skipped-by-deadline` outcome with zero confidence.

## 3. Circuit Breaker Subsystem

Each agent specialist possesses an isolated `CircuitBreaker` instance managed via `getAgentCircuitBreaker(agent)`. Breakers for different agents never interfere with each other.

### State Transitions

```
 [Closed] --(Failure threshold: 3)--> [Open]
    ^                                   |
    |                                   | (Cooldown: 30s)
    |                                   v
 [Closed] <-- (Probe succeeds) -- [Half-Open]
    |                                   |
    +------- (Probe fails) -------------+
```

1. **Closed**: Normal operations. Successful invocations increment success counts and clear consecutive failure counters.
2. **Open**: Triggered when consecutive failures reach `failureThreshold` (default: 3). Subsequent executions immediately fail with `CircuitBreakerOpenError` without hitting upstream providers or consuming run budget.
3. **Half-Open**: After `openDurationMs` (default: 30,000ms), the breaker enters half-open state and permits a single probe call.
   - If the probe succeeds, the breaker resets to `closed`.
   - If the probe fails, the breaker transitions back to `open` with a renewed cooldown period without exhausting the run budget.

### Structured Logging

State transitions trigger structured observability logs under module `agents.breaker`:
- Transitions to `open` emit `logWarn("agents.breaker", ...)` with failure reasons.
- Transitions to `half-open` and `closed` emit `logInfo("agents.breaker", ...)`.

## 4. No-Evidence Invariants on Skipped Agents

A skipped agent must never contribute a default or zero-valued signal that reads as real evidence.

1. **Outcome Schema**:
   - Explicit outcome statuses: `succeeded`, `degraded`, `skipped-by-breaker`, `skipped-by-deadline`.
   - Populated `executionOutcome: { status, reason }`.
2. **Confidence & Findings**:
   - `confidence: 0`.
   - `findings: []` (empty finding set; no mock findings).
   - `missingData`: Explicit documentation of the omission reason.
3. **Score Calculation**:
   - `runDecisionAgent` excludes skipped agents (`skipped-by-breaker` and `skipped-by-deadline`) from weighted score calculations. They contribute zero weight and do not skew composite risk ratings.

## 5. Degraded Composite Verdicts

When one or more agents are missing or skipped:
- The decision engine marks `outcome: "degraded"`.
- Appends `(degraded: missing <agents>)` to `decision.verdict`.
- Prepends `[Degraded: signals missing from <agents>]` to `decision.summary`.
- Applies a degraded penalty to the decision confidence, ensuring downstream systems and operators recognize reduced certainty.

## 6. Verification & Testing

The subsystem is verified across both unit and integration suites:

```bash
# Run Vitest unit tests for budgets and breakers
npm test

# Run end-to-end fixture check for budgets, breakers, and degraded orchestration
npm run test:agent-budgets

# Run standard agent fixture check
npm run test:agents
```
