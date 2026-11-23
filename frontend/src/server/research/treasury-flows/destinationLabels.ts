import type { DestinationKind } from "./schema";
const KNOWN = new Set<DestinationKind>(["exchange", "multisig", "contract", "unknown"]);
/** A label is trusted only when it is one of the four published kinds. Anything else stays unknown. */
export function labelKind(label: string | undefined): DestinationKind {
  if (label && KNOWN.has(label as DestinationKind) && label !== "unknown") return label as DestinationKind;
  return "unknown";
}
