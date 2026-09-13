import { CompatibilityError, ReadClientError, httpError } from "./errors.js";
import type { ClientOptions, Query, ReadOptions } from "./types.js";
import type { Validator } from "./validation.js";

function wait(ms: number, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => { clearTimeout(timer); signal?.removeEventListener("abort", abort); reject(signal?.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener("abort", abort); resolve(); }, ms);
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
  });
}
function retryDelay(header: string | null, attempt: number): number {
  if (!header) return 250 * 2 ** attempt;
  if (/^\d+(?:\.\d+)?$/.test(header)) return Number(header) * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 250 * 2 ** attempt;
}
export function createTransport(options: ClientOptions) {
  let base: URL;
  try { base = new URL(options.baseUrl); } catch { throw new ReadClientError("configuration", "Provide an absolute HTTP(S) base URL."); }
  if (!["https:", "http:"].includes(base.protocol) || base.username || base.password || base.search || base.hash) {
    throw new ReadClientError("configuration", "Base URL must use HTTP(S) without credentials, query or fragment.");
  }
  const retries = options.retries ?? 1;
  const maxDelay = options.maxRetryDelayMs ?? 5000;
  if (!Number.isInteger(retries) || retries < 0 || retries > 3 || !Number.isFinite(maxDelay) || maxDelay < 0 || maxDelay > 30000) {
    throw new ReadClientError("configuration", "Invalid bounded retry configuration.");
  }
  const fetcher = options.fetch ?? globalThis.fetch;
  if (!fetcher) throw new ReadClientError("configuration", "Provide a fetch implementation.");
  const root = base.href.replace(/\/$/, "");
  return async function get<T>(path: string, query: Query, validate: Validator<T>, request: ReadOptions = {}): Promise<T> {
    const signals = [options.signal, request.signal].filter((v): v is AbortSignal => !!v);
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    const url = new URL(root + path);
    for (const [key, value] of Object.entries(query)) if (value !== undefined) url.searchParams.set(key, String(value));
    const headers = new Headers(options.headers);
    new Headers(request.headers).forEach((v, k) => headers.set(k, v));
    headers.set("Accept", "application/json");
    for (let attempt = 0; ; attempt++) {
      signal?.throwIfAborted();
      let response: Response;
      try {
        response = await fetcher(url, { method: "GET", headers, signal,
          credentials: request.credentials ?? options.credentials ?? "omit", redirect: "error", cache: "no-store" });
      } catch {
        signal?.throwIfAborted();
        // Network failures are not retried: no server Retry-After contract is available.
        throw new ReadClientError("transport", "Read API could not be reached.");
      }
      signal?.throwIfAborted();
      const delay = retryDelay(response.headers.get("Retry-After"), attempt);
      if ([429, 502, 503, 504].includes(response.status) && attempt < retries && delay <= maxDelay) {
        await response.body?.cancel();
        await wait(delay, signal);
        continue;
      }
      let value: unknown;
      try { value = await response.json(); }
      catch {
        signal?.throwIfAborted();
        if (!response.ok) throw httpError(response.status, undefined);
        throw new CompatibilityError("response.json");
      }
      signal?.throwIfAborted();
      if (!response.ok) throw httpError(response.status, value);
      return validate(value);
    }
  };
}
export type Transport = ReturnType<typeof createTransport>;
