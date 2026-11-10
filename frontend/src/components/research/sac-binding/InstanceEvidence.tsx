import type {
  ContractInstanceSnapshot,
  ExecutableClassification,
} from "@/server/research/sac-binding";

export function InstanceEvidence(props: {
  classification: ExecutableClassification;
  instance: ContractInstanceSnapshot | null;
}) {
  const { classification, instance } = props;
  return (
    <div data-testid="instance-evidence" className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Contract executable verification</h3>
      <p className="font-semibold text-white">
        Verdict: {classification.verdict} — {classification.explanation}
      </p>
      {instance && (
        <dl className="grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-white/50">Executable type</dt>
            <dd className="font-mono">{instance.executableKind}</dd>
          </div>
          <div>
            <dt className="text-white/50">Deployed on-chain</dt>
            <dd>{instance.deployed ? "Yes" : "No"}</dd>
          </div>
          <div>
            <dt className="text-white/50">Wasm hash</dt>
            <dd className="font-mono">{instance.wasmHash ?? "None (built-in SAC)"}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}
