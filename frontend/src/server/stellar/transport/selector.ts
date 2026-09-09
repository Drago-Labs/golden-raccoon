import { StellarDataLayerError } from "../errors";
import type { ProbeScheduler, ScheduledEndpointState } from "@/server/stellar/probes/schedule";

export type OutageStatus = {
  isOutage: boolean;
  reason?: string;
  totalEndpoints: number;
  healthyCount: number;
  degradedCount: number;
  unhealthyCount: number;
  states: ScheduledEndpointState[];
};

export class EndpointSelector {
  constructor(private readonly scheduler: ProbeScheduler) {}

  /**
   * Evaluates network-wide health status across all configured endpoints.
   * Distinguishes isolated endpoint failures from a global network outage.
   */
  getOutageStatus(): OutageStatus {
    const states = this.scheduler.getAllStates();
    const total = states.length;
    const healthyCount = states.filter((s) => s.state === "healthy").length;
    const degradedCount = states.filter((s) => s.state === "degraded").length;
    const unhealthyCount = states.filter((s) => s.state === "unhealthy").length;

    const isOutage = total > 0 && (unhealthyCount === total || (healthyCount === 0 && degradedCount === 0));
    let reason: string | undefined;

    if (isOutage) {
      const staleCount = states.filter((s) => s.isStale).length;
      if (staleCount === total) {
        reason = `All ${total} configured RPC endpoints are lagging behind network head.`;
      } else {
        reason = `All ${total} configured RPC endpoints are down or degraded.`;
      }
    }

    return {
      isOutage,
      reason,
      totalEndpoints: total,
      healthyCount,
      degradedCount,
      unhealthyCount,
      states,
    };
  }

  /**
   * Returns candidates sorted by score descending, excluding unhealthy/stale endpoints.
   */
  selectCandidates(): ScheduledEndpointState[] {
    const outage = this.getOutageStatus();
    if (outage.isOutage) {
      return [];
    }

    const eligible = outage.states.filter((s) => s.state !== "unhealthy" && !s.isStale);

    return [...eligible].sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }
      const latA = a.lastProbe?.latencyMs ?? 1000;
      const latB = b.lastProbe?.latencyMs ?? 1000;
      return latA - latB;
    });
  }

  /**
   * Selects candidate endpoint URLs ordered by health score.
   * Excludes any unhealthy or lagging endpoints until probes recover them.
   * Throws StellarDataLayerError if all endpoints are down.
   *
   * @returns Array of eligible endpoint URLs ordered by descending score
   */
  selectEndpoints(): string[] {
    const outage = this.getOutageStatus();
    if (outage.isOutage) {
      throw new StellarDataLayerError(
        "all_providers_failed",
        `Network-wide outage detected: ${outage.reason ?? "all endpoints are unhealthy"}`,
        true,
      );
    }

    const candidates = this.selectCandidates();
    if (candidates.length === 0) {
      throw new StellarDataLayerError(
        "all_providers_failed",
        "No healthy or degraded RPC endpoints are currently available in rotation.",
        true,
      );
    }

    return candidates.map((s) => s.endpointUrl);
  }

  /**
   * Returns top healthy endpoint candidate, or throws if none available.
   */
  selectBestEndpoint(): ScheduledEndpointState {
    const candidates = this.selectCandidates();
    if (candidates.length === 0) {
      throw new StellarDataLayerError(
        "all_providers_failed",
        "No healthy or degraded RPC endpoints are currently available in rotation.",
        true,
      );
    }
    return candidates[0]!;
  }

  /**
   * Returns top healthy endpoint URL, or throws if none available.
   */
  selectPrimary(): string {
    const endpoints = this.selectEndpoints();
    return endpoints[0]!;
  }

  /**
   * Returns backup endpoint for hedging, or undefined if only one healthy endpoint exists.
   */
  selectHedgeCandidate(primaryUrl: string): string | undefined {
    const endpoints = this.selectEndpoints();
    return endpoints.find((url) => url !== primaryUrl);
  }
}
