import type { ForkSemantics, InitCodePatternFindings, OpcodeFindings } from "@/server/research/metamorphic-check";

export function BytecodeFindings(props: {
  opcodes: OpcodeFindings;
  initCodePatterns: InitCodePatternFindings;
  forkRules: ForkSemantics;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-white/10 p-4 text-xs">
      <h3 className="text-sm font-medium text-white">Bytecode & fork findings</h3>
      <div>SELFDESTRUCT present: {props.opcodes.hasSelfDestruct ? "Yes" : "No"}</div>
      <div>DELEGATECALL present: {props.opcodes.hasDelegateCall ? "Yes" : "No"}</div>
      <div>External code copy in init: {props.initCodePatterns.externalCodeCopyInInit ? "Yes" : "No"}</div>
      <div>EIP-6780 active: {props.forkRules.eip6780Active ? "Yes" : "No"}</div>
    </div>
  );
}
