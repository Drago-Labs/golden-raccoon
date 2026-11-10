import type { DerivedSacRecord } from "@/server/research/sac-binding";

export function DerivationSteps(props: { derivation: DerivedSacRecord | null }) {
  const { derivation } = props;
  if (!derivation) return null;
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Deterministic SAC ID derivation</h3>
      <p className="text-white/70">
        Expected SAC ID:{" "}
        <span className="font-mono font-semibold text-white">{derivation.expectedContractId}</span>
      </p>
      <ol className="space-y-1">
        {derivation.steps.map((step) => (
          <li key={step.step} className="rounded border border-white/5 p-2">
            <span className="text-white/60">
              Step {step.step} ({step.label}):{" "}
            </span>
            <span className="font-mono text-white">{step.value}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
