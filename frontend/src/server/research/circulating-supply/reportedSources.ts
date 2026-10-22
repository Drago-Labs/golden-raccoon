import type { CirculatingSupplyRequest } from "./schema";
export function reportedSources(input: CirculatingSupplyRequest["reportedSources"]) { return [...input].sort((a, b) => a.name.localeCompare(b.name)); }
