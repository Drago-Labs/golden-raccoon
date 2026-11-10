import type { EnsPairClassification, ForwardResolutionStep, ReverseResolutionStep } from "@/server/research/ens-resolution";

export function ResolutionSteps(props: {
  classification: EnsPairClassification;
  forward: ForwardResolutionStep;
  reverse: ReverseResolutionStep;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Resolution steps ({props.classification})</h3>
      <div>Forward ({props.forward.normalizedName}): {props.forward.forwardAddress ?? "Unresolved"}</div>
      <div>Reverse ({props.reverse.queriedAddress ?? "n/a"}): {props.reverse.reverseName ?? "Unresolved"}</div>
    </div>
  );
}
