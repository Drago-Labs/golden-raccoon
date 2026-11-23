import { labelKind } from "./destinationLabels";
import type { CategorizedOutflow, Outflow } from "./schema";
export function categorizeOutflows(outflows: Outflow[]): CategorizedOutflow[] {
  return outflows.map((outflow) => ({ ...outflow, kind: labelKind(outflow.label) }));
}
