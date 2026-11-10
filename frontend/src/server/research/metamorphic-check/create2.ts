import type { CreationEvidence } from "./schema";

export function isCreate2Deployment(creation: CreationEvidence): boolean {
  return creation.found && creation.creationKind === "CREATE2";
}
