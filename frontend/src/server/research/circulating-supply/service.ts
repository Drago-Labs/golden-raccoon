import { compareReported } from "./comparison";
import { supplyCoverage } from "./coverage";
import { CirculatingSupplyError } from "./errors";
import { excludedTotal, resolveExclusions } from "./exclusions";
import { impliedSupply } from "./impliedSupply";
import { reportedSources } from "./reportedSources";
import { circulatingSupplyRequestSchema, type CirculatingSupplyReport, type SupplySnapshot } from "./schema";
export type SupplyDeps = { read: (input: ReturnType<typeof circulatingSupplyRequestSchema.parse>) => Promise<SupplySnapshot> };
export async function reconcileCirculatingSupply(input: unknown, deps: SupplyDeps): Promise<CirculatingSupplyReport> {
  const parsed = circulatingSupplyRequestSchema.safeParse(input);
  if (!parsed.success) throw new CirculatingSupplyError("invalid_request", "The circulating-supply request is invalid.", parsed.error.flatten());
  try { const snapshot = await deps.read(parsed.data); const exclusions = resolveExclusions(parsed.data, snapshot); const excluded = excludedTotal(exclusions); const implied = impliedSupply(snapshot.totalSupply, excluded); const sources = reportedSources(parsed.data.reportedSources); return { state: "complete", token: parsed.data.token, totalSupply: snapshot.totalSupply, excludedTotal: excluded, impliedSupply: implied, exclusions, comparisons: compareReported(sources, implied), observation: snapshot.observation, sourceUrl: snapshot.sourceUrl, coverageNotice: supplyCoverage(exclusions.length, sources.length), readOnly: true }; }
  catch (error) { if (error instanceof RangeError) throw new CirculatingSupplyError("invalid_request", error.message); return { state: "unavailable", token: parsed.data.token, totalSupply: null, excludedTotal: "0", impliedSupply: null, exclusions: [], comparisons: [], observation: null, sourceUrl: null, coverageNotice: "Supply provider unavailable; no value was inferred.", readOnly: true }; }
}
