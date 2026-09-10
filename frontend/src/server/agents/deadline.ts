export const DEFAULT_RUN_TIMEOUT_MS = 30_000;
export class AgentDeadlineError extends Error {
  constructor() { super("Agent run deadline exhausted; no complete signal is available."); this.name = "AgentDeadlineError"; }
}
export function createRunDeadline(timeoutMs = DEFAULT_RUN_TIMEOUT_MS): number {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 2_147_483_647) throw new RangeError("Invalid agent run timeout");
  return performance.now() + timeoutMs;
}
export async function withinAgentDeadline<T>(deadline: number, timeoutMs: number, task: (signal: AbortSignal, remainingMs: number) => Promise<T>): Promise<T> {
  const remainingMs = Math.min(timeoutMs, deadline - performance.now());
  if (!Number.isFinite(remainingMs) || remainingMs <= 0) throw new AgentDeadlineError();
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => { reject(new AgentDeadlineError()); controller.abort(); }, remainingMs);
    });
    const result = await Promise.race([task(controller.signal, remainingMs), timeout]);
    if (performance.now() >= deadline) throw new AgentDeadlineError();
    return result;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
