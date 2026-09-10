export type ProviderAttempt = {
  url: string;
  ok: boolean;
  error?: string;
};

export type StellarFailoverPolicy<T> = {
  requestId?: string;
  /** Total wall-clock budget across all attempts, default 12 seconds. */
  totalTimeoutMs?: number;
  expectedNetwork?: string;
  expectedPassphrase?: string;
  maxFreshnessMs?: number;
  inspect?: (value: T) => { network?: string; passphrase?: string; freshnessMs?: number };
};

export function redactProviderUrl(value: string) {
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    url.search = "";
    url.hash = "";
    return `${url.protocol}//${url.host}`;
  } catch {
    return "[invalid-provider-url]";
  }
}

export async function executeWithFallback<T>(
  urls: readonly string[],
  operation: (url: string, index: number, requestId?: string, signal?: AbortSignal) => Promise<T>,
  policy: StellarFailoverPolicy<T> = {},
) {
  if (urls.length === 0) throw new Error("At least one provider URL is required.");
  const totalTimeoutMs = policy.totalTimeoutMs ?? 12_000;
  if (!Number.isFinite(totalTimeoutMs) || totalTimeoutMs <= 0 || totalTimeoutMs > 2_147_483_647) {
    throw new RangeError("totalTimeoutMs must be a positive finite timer duration.");
  }
  const deadline = performance.now() + totalTimeoutMs;
  const attempts: ProviderAttempt[] = [];

  for (const [index, url] of urls.entries()) {
    const remainingMs = deadline - performance.now();
    if (remainingMs <= 0) break;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error("provider_timeout: total failover budget exhausted"));
          controller.abort();
        }, remainingMs);
      });
      const value = await Promise.race([operation(url, index, policy.requestId, controller.signal), timeout]);
      if (performance.now() >= deadline) throw new Error("provider_timeout: total failover budget exhausted");
      const identity = policy.inspect?.(value) ?? {};
      if (policy.expectedNetwork && identity.network !== policy.expectedNetwork) {
        throw new Error(`network_mismatch: expected ${policy.expectedNetwork}`);
      }
      if (policy.expectedPassphrase && identity.passphrase !== policy.expectedPassphrase) {
        throw new Error("network_mismatch: provider passphrase does not match requested network");
      }
      if (policy.maxFreshnessMs !== undefined && (!Number.isFinite(identity.freshnessMs) || identity.freshnessMs! < 0 || identity.freshnessMs! > policy.maxFreshnessMs)) {
        throw new Error(`provider_lag: response exceeds ${policy.maxFreshnessMs}ms freshness budget`);
      }
      attempts.push({ url: redactProviderUrl(url), ok: true });
      return { value, providerUrl: redactProviderUrl(url), providerIndex: index, fallbackUsed: index > 0, requestId: policy.requestId, attempts };
    } catch (cause) {
      attempts.push({ url: redactProviderUrl(url), ok: false, error: cause instanceof Error ? cause.message : "Unknown provider error" });
    } finally {
      clearTimeout(timer);
      controller.abort();
    }
  }

  throw new AggregateError(attempts.map((attempt) => new Error(`${attempt.url}: ${attempt.error}`)), "All Stellar providers failed.");
}
