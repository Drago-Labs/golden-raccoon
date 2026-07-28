import type { SimulationResultDetail } from "@/server/types";
import { getChainFamily } from "@/lib/chainIdentity";
import { shortAddress } from "@/lib/format";

function shortenIdentifier(id: string, chars = 8): string {
  if (id.length <= chars * 2 + 3) return id;
  return `${id.slice(0, chars)}...${id.slice(-chars)}`;
}

function formatChange(change: string): string {
  if (change.length > 20) return shortenIdentifier(change, 10);
  return change;
}

export function SimulationResultPanel({ simulation }: { simulation: SimulationResultDetail }) {
  const chainFamily = simulation.chainFamily ?? getChainFamily();
  const isBlocked = simulation.status === "failed" || simulation.status === "unavailable" || simulation.status === "pending";

  const statusColor =
    simulation.status === "passed"
      ? "border-green-400/25 bg-green-500/10 text-green-200"
      : simulation.status === "failed"
        ? "border-red-400/25 bg-red-500/10 text-red-200"
        : simulation.status === "unavailable"
          ? "border-yellow-400/25 bg-yellow-500/10 text-yellow-200"
          : "border-white/10 bg-white/6 text-white/52";

  return (
    <div className="rounded-[28px] border border-[#d9a441]/25 bg-[#d9a441]/8 p-6">
      <div className="text-sm uppercase tracking-[0.18em] text-[#d9a441]">Simulation result</div>

      <div className={`mt-4 rounded-2xl border px-4 py-3 text-sm ${statusColor}`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${simulation.status === "passed" ? "bg-green-400" : simulation.status === "failed" ? "bg-red-400" : "bg-yellow-400"}`} />
          <span className="font-semibold capitalize">{simulation.status.replaceAll("_", " ")}</span>
        </div>
        {simulation.revertReasonHuman && simulation.status === "failed" && (
          <p className="mt-2 text-white/70">{simulation.revertReasonHuman}</p>
        )}
        {simulation.detail && (
          <p className="mt-1 text-white/50">{simulation.detail}</p>
        )}
      </div>

      {simulation.balanceChanges && simulation.balanceChanges.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-[0.12em] text-white/38">Balance changes</div>
          <div className="grid gap-2">
            {simulation.balanceChanges.map((change, index) => (
              <div key={index} className="flex items-center justify-between rounded-2xl bg-black/20 px-4 py-3 text-sm">
                <span className="text-white/70">{change.symbol}</span>
                <span className={change.direction === "inflow" ? "text-green-300" : "text-red-300"}>
                  {change.direction === "inflow" ? "+" : "-"}{formatChange(change.expectedChange)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {chainFamily === "evm" && simulation.allowanceRisk && simulation.allowanceRisk.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-[0.12em] text-white/38">Allowance / authorisation risk</div>
          <div className="grid gap-2">
            {simulation.allowanceRisk.map((risk, index) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">{risk.token}</span>
                  {risk.isInfinite && <span className="rounded bg-red-500/20 px-2 py-0.5 text-xs text-red-300">Infinite approval</span>}
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Spender: {shortAddress(risk.spender)} &middot; Allowance: {risk.newAllowance}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {chainFamily === "stellar" && simulation.trustlineRisk && simulation.trustlineRisk.length > 0 && (
        <div className="mt-4">
          <div className="mb-2 text-xs uppercase tracking-[0.12em] text-white/38">Trustline / network risk</div>
          <div className="grid gap-2">
            {simulation.trustlineRisk.map((risk, index) => (
              <div key={index} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-white/70">{risk.assetShort ?? risk.asset}</span>
                  <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs text-yellow-300 capitalize">{risk.action}</span>
                </div>
                <div className="mt-1 text-xs text-white/45">
                  Issuer: {risk.issuerShort ?? shortAddress(risk.issuer)} &middot; {risk.detail}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {simulation.fee && (
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <div className="text-xs text-white/38">Network fee</div>
            <div className="mt-1 text-sm font-semibold">{formatChange(simulation.fee)}</div>
          </div>
          {simulation.simulatedAt && (
            <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-xs text-white/38">Simulated at</div>
              <div className="mt-1 text-sm font-semibold">{new Date(simulation.simulatedAt).toLocaleString()}</div>
            </div>
          )}
        </div>
      )}

      {simulation.blockNumber !== undefined && (
        <div className="mt-2 rounded-2xl bg-black/20 px-4 py-2 text-xs text-white/38">
          Block #{simulation.blockNumber}
          {simulation.ledgerSeq !== undefined ? ` / Ledger #${simulation.ledgerSeq}` : ""}
        </div>
      )}

      {simulation.calldataHash && (
        <div className="mt-2 rounded-2xl bg-black/20 px-4 py-2 text-xs text-white/38 font-mono">
          Calldata hash: {shortenIdentifier(simulation.calldataHash, 12)}
        </div>
      )}

      {isBlocked && (
        <div className="mt-4 rounded-2xl border border-red-300/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
          Wallet approval is blocked until simulation shows a passing result. Re-run simulation with current parameters before approving.
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-white/10 bg-white/6 px-4 py-3 text-xs text-white/40">
        Simulation results are based on network state at the time of simulation and do not guarantee future
        execution outcomes. Always review the parameters and re-run if conditions have changed.
        This informational context does not override any safety blocks shown above.
      </div>
    </div>
  );
}
