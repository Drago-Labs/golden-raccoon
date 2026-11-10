import type { CreationEvidence, MetamorphicClassification } from "@/server/research/metamorphic-check";

export function DeploymentEvidence(props: {
  classification: MetamorphicClassification;
  creation: CreationEvidence;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Deployment evidence</h3>
      <div>Classification: {props.classification}</div>
      <div>Creation opcode: {props.creation.creationKind}</div>
      <div>Factory: {props.creation.factoryAddress ?? "n/a"}</div>
    </div>
  );
}
