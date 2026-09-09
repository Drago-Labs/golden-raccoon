import { redactProviderUrl } from "@/lib/stellar/failover";
import type { StellarRpcTransport } from "@/server/stellar/dataLayer";
import { evaluateFreshness, findHighestLedger } from "./freshness";
import { probeEndpoint, type EndpointProbeResult, type ProbeOptions } from "./prober";
import {
  computeEndpointScore,
  type EndpointHealthState,
  type ProbeSample,
  type ScoreBreakdown,
} from "./score";

export type ScheduledEndpointState = {
  endpointUrl: string;
  safeUrl: string;
  score: number;
  state: EndpointHealthState;
  lastProbe?: EndpointProbeResult;
  lastProbeAt?: number;
  ledgerHeight?: number;
  highestObservedLedger?: number;
  lag?: number;
  isStale: boolean;
  scoreBreakdown: ScoreBreakdown;
  samples: ProbeSample[];
};

export type ProbeSchedulerOptions = ProbeOptions & {
  endpoints: readonly string[];
  transportFactory: (url: string) => StellarRpcTransport;
  intervalMs?: number;
  minIntervalMs?: number;
  maxLag?: number;
  sampleHistoryLimit?: number;
  autoStart?: boolean;
};

export class ProbeScheduler {
  private readonly endpoints: readonly string[];
  private readonly transportFactory: (url: string) => StellarRpcTransport;
  private readonly intervalMs: number;
  private readonly minIntervalMs: number;
  private readonly maxLag: number;
  private readonly sampleHistoryLimit: number;
  private readonly now: () => number;
  private readonly probeOptions: ProbeOptions;

  private timer?: ReturnType<typeof setInterval>;
  private inFlight = false;
  private endpointStates = new Map<string, ScheduledEndpointState>();
  private networkHeadLedger?: number;

  constructor(options: ProbeSchedulerOptions) {
    this.endpoints = options.endpoints;
    this.transportFactory = options.transportFactory;
    this.intervalMs = Math.max(1_000, options.intervalMs ?? 30_000);
    this.minIntervalMs = Math.max(100, options.minIntervalMs ?? 5_000);
    this.maxLag = options.maxLag ?? 3;
    this.sampleHistoryLimit = options.sampleHistoryLimit ?? 20;
    this.now = options.now ?? Date.now;
    this.probeOptions = {
      expectedPassphrase: options.expectedPassphrase,
      expectedProtocolVersion: options.expectedProtocolVersion,
      timeoutMs: options.timeoutMs,
      now: options.now,
    };

    for (const url of this.endpoints) {
      const safeUrl = redactProviderUrl(url);
      const emptySamples: ProbeSample[] = [];
      const scoreBreakdown = computeEndpointScore(emptySamples, { maxLag: this.maxLag, now: this.now() });
      this.endpointStates.set(url, {
        endpointUrl: url,
        safeUrl,
        score: scoreBreakdown.score,
        state: scoreBreakdown.state,
        scoreBreakdown,
        samples: emptySamples,
        isStale: false,
      });
    }

    if (options.autoStart) {
      this.start();
    }
  }

  /**
   * Starts periodic synthetic background probing.
   */
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.probeAll();
    }, this.intervalMs);

    if (typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as { unref: () => void }).unref();
    }
  }

  /**
   * Stops periodic synthetic background probing.
   */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /**
   * Returns current running status of the scheduler.
   */
  isRunning(): boolean {
    return this.timer !== undefined;
  }

  /**
   * Executes probes across all managed endpoints subject to rate-limiting and quota bounds.
   *
   * @param force When true, ignores the minIntervalMs throttle
   */
  async probeAll(force = false): Promise<ScheduledEndpointState[]> {
    if (this.inFlight) {
      return this.getAllStates();
    }

    const currentTime = this.now();
    this.inFlight = true;

    try {
      const probePromises = this.endpoints.map(async (url) => {
        const current = this.endpointStates.get(url);
        if (!force && current?.lastProbeAt && currentTime - current.lastProbeAt < this.minIntervalMs) {
          return null;
        }

        const transport = this.transportFactory(url);
        return probeEndpoint(url, transport, {
          ...this.probeOptions,
          now: this.now,
        });
      });

      const probeResults = await Promise.all(probePromises);

      const observedLedgers = probeResults
        .map((r) => r?.ledgerHeight)
        .filter((h): h is number => typeof h === "number");
      if (this.networkHeadLedger !== undefined) {
        observedLedgers.push(this.networkHeadLedger);
      }
      this.networkHeadLedger = findHighestLedger(observedLedgers);

      for (let i = 0; i < this.endpoints.length; i += 1) {
        const url = this.endpoints[i];
        const result = probeResults[i];
        if (!result) continue;

        const current = this.endpointStates.get(url)!;
        const freshness = evaluateFreshness(result.ledgerHeight, this.networkHeadLedger, this.maxLag);

        const newSample: ProbeSample = {
          ok: result.ok && !freshness.isStale,
          latencyMs: result.latencyMs,
          ledgerHeight: result.ledgerHeight,
          lag: freshness.lag,
          errorCode: result.errorCode,
          error: result.error,
          timestamp: result.timestamp,
        };

        const updatedSamples = [...current.samples, newSample].slice(-this.sampleHistoryLimit);
        const scoreBreakdown = computeEndpointScore(updatedSamples, {
          maxLag: this.maxLag,
          now: currentTime,
        });

        this.endpointStates.set(url, {
          endpointUrl: url,
          safeUrl: current.safeUrl,
          score: scoreBreakdown.score,
          state: scoreBreakdown.state,
          lastProbe: result,
          lastProbeAt: currentTime,
          ledgerHeight: result.ledgerHeight,
          highestObservedLedger: this.networkHeadLedger,
          lag: freshness.lag,
          isStale: freshness.isStale,
          scoreBreakdown,
          samples: updatedSamples,
        });
      }

      return this.getAllStates();
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Probes a specific endpoint directly and updates its score state.
   */
  async probeEndpoint(url: string, force = false): Promise<ScheduledEndpointState | undefined> {
    const current = this.endpointStates.get(url);
    if (!current) return undefined;

    const currentTime = this.now();
    if (!force && current.lastProbeAt && currentTime - current.lastProbeAt < this.minIntervalMs) {
      return current;
    }

    const transport = this.transportFactory(url);
    const result = await probeEndpoint(url, transport, {
      ...this.probeOptions,
      now: this.now,
    });

    if (result.ledgerHeight !== undefined) {
      this.networkHeadLedger = findHighestLedger([result.ledgerHeight, this.networkHeadLedger]);
    }

    const freshness = evaluateFreshness(result.ledgerHeight, this.networkHeadLedger, this.maxLag);

    const newSample: ProbeSample = {
      ok: result.ok && !freshness.isStale,
      latencyMs: result.latencyMs,
      ledgerHeight: result.ledgerHeight,
      lag: freshness.lag,
      errorCode: result.errorCode,
      error: result.error,
      timestamp: result.timestamp,
    };

    const updatedSamples = [...current.samples, newSample].slice(-this.sampleHistoryLimit);
    const scoreBreakdown = computeEndpointScore(updatedSamples, {
      maxLag: this.maxLag,
      now: currentTime,
    });

    const updatedState: ScheduledEndpointState = {
      endpointUrl: url,
      safeUrl: current.safeUrl,
      score: scoreBreakdown.score,
      state: scoreBreakdown.state,
      lastProbe: result,
      lastProbeAt: currentTime,
      ledgerHeight: result.ledgerHeight,
      highestObservedLedger: this.networkHeadLedger,
      lag: freshness.lag,
      isStale: freshness.isStale,
      scoreBreakdown,
      samples: updatedSamples,
    };

    this.endpointStates.set(url, updatedState);
    return updatedState;
  }

  /**
   * Ingests an observation from a live user request into the endpoint score model.
   *
   * @param endpointUrl Target endpoint URL
   * @param outcome Observed execution outcome
   */
  recordOutcome(
    endpointUrl: string,
    outcome: {
      ok: boolean;
      latencyMs: number;
      ledgerHeight?: number;
      errorCode?: string;
      error?: string;
    },
  ): void {
    const current = this.endpointStates.get(endpointUrl);
    if (!current) return;

    const currentTime = this.now();
    if (outcome.ledgerHeight !== undefined) {
      this.networkHeadLedger = findHighestLedger([outcome.ledgerHeight, this.networkHeadLedger]);
    }

    const freshness = evaluateFreshness(outcome.ledgerHeight, this.networkHeadLedger, this.maxLag);
    const sample: ProbeSample = {
      ok: outcome.ok && !freshness.isStale,
      latencyMs: outcome.latencyMs,
      ledgerHeight: outcome.ledgerHeight,
      lag: freshness.lag,
      errorCode: outcome.errorCode,
      error: outcome.error,
      timestamp: currentTime,
    };

    const updatedSamples = [...current.samples, sample].slice(-this.sampleHistoryLimit);
    const scoreBreakdown = computeEndpointScore(updatedSamples, {
      maxLag: this.maxLag,
      now: currentTime,
    });

    this.endpointStates.set(endpointUrl, {
      ...current,
      score: scoreBreakdown.score,
      state: scoreBreakdown.state,
      ledgerHeight: outcome.ledgerHeight ?? current.ledgerHeight,
      highestObservedLedger: this.networkHeadLedger,
      lag: freshness.lag,
      isStale: freshness.isStale,
      scoreBreakdown,
      samples: updatedSamples,
    });
  }

  /**
   * Retrieves current status for a specific endpoint.
   *
   * @param endpointUrl Target endpoint URL
   * @returns Endpoint state or undefined
   */
  getState(endpointUrl: string): ScheduledEndpointState | undefined {
    return this.endpointStates.get(endpointUrl);
  }

  /**
   * Retrieves snapshot of all managed endpoints.
   */
  getAllStates(): ScheduledEndpointState[] {
    return this.endpoints.map((url) => this.endpointStates.get(url)!);
  }

  /**
   * Returns the current highest observed ledger across all probes.
   */
  getHighestObservedLedger(): number | undefined {
    return this.networkHeadLedger;
  }
}
