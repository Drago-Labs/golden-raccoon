import type { CirculatingSupplyRequest, SupplyComparison } from "./schema";
export function compareReported(sources: CirculatingSupplyRequest["reportedSources"], implied: string): SupplyComparison[] {
  return sources.map((source) => ({ name: source.name, sourceUrl: source.url, fetchedAt: source.fetchedAt, reported: source.value, implied, gap: (BigInt(source.value) - BigInt(implied)).toString() }));
}
