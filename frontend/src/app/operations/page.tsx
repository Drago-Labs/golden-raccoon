import { AlertTriangle, CheckCircle2, ClipboardCheck, ShieldAlert, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import {
  knownLimitations,
  releaseReadinessChecks,
  getMachineCheckableReadiness,
} from "@/server/operations/releaseReadiness";
import { evaluatePubnetReadiness, summarizeReadiness } from "@/server/stellar/pubnetGate";
import { getFeatureFlagHealth } from "@/server/env/validation";
import { OperationsSloPanel } from "@/components/OperationsSloPanel";
import { getConfiguredProviderHealth } from "@/server/observability/providerHealth";

export default async function OperationsPage() {
  const pubnetGate = summarizeReadiness(await evaluatePubnetReadiness());
  const featureFlags = getFeatureFlagHealth();
  const providerHealth = getConfiguredProviderHealth();
  const releaseVerdict = await getMachineCheckableReadiness(
    process.env.APP_MODE || "production",
    process.env.GIT_COMMIT || "head"
  );

  return (
    <AppShell>
      <section className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d9a441]/25 bg-[#d9a441]/10 px-4 py-2 text-sm text-[#f2c86d]">
            <ClipboardCheck className="h-4 w-4" />
            Release readiness
          </div>
          <h1 className="mt-6 max-w-3xl text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Production operations
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-white/58">
            Deploy only after readiness checks, Supabase migration verification, AI Risk Report smoke, approval-only execution review, rollback review,
            and first-day monitoring are complete.
          </p>
          <div className="mt-7 rounded-lg border border-white/10 bg-white/6 p-5">
            <div className="text-sm font-semibold text-white">Required gates</div>
            <div className="mt-4 grid gap-3 text-sm text-white/64">
              <code className="rounded-md bg-black/35 px-3 py-2">node scripts/release-gate.mjs</code>
              <code className="rounded-md bg-black/35 px-3 py-2">npm run deploy:check</code>
              <code className="rounded-md bg-black/35 px-3 py-2">npm run test:agents --prefix frontend</code>
              <code className="rounded-md bg-black/35 px-3 py-2">{"curl -i \"$SMOKE_BASE_URL/api/x402/deep-scan?query=GOAT&chain=base\""}</code>
              <code className="rounded-md bg-black/35 px-3 py-2">SMOKE_BASE_URL=https://your-production-domain.example npm run smoke</code>
              <code className="rounded-md bg-black/35 px-3 py-2">MONITOR_BASE_URL=https://your-production-domain.example npm run monitor:production</code>
            </div>
          </div>
          <div className="mt-4 rounded-lg border border-[#d9a441]/25 bg-[#d9a441]/8 p-5">
            <div className="text-sm font-semibold text-[#f2c86d]">V1 execution rule</div>
            <p className="mt-2 text-sm leading-6 text-white/58">
              V1 can show an execution preview, but it cannot auto-buy, cannot server-sign, and cannot treat missing quote or pending simulation as an
              executable transaction.
            </p>
          </div>
        </div>

        <div className="grid gap-3">
          {releaseReadinessChecks.map((item) => (
            <article key={item.title} className="rounded-lg border border-white/10 bg-white/6 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#d9a441]" />
                <div>
                  <h2 className="text-sm font-semibold text-white">{item.title}</h2>
                  <p className="mt-1 text-sm leading-6 text-white/52">{item.detail}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-white/10 bg-white/6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            {releaseVerdict.verdict === "ready" ? (
              <ShieldCheck className="h-5 w-5 text-emerald-400" />
            ) : (
              <ShieldAlert className="h-5 w-5 text-rose-400" />
            )}
            <h2 className="text-sm font-semibold text-white">Machine-Checkable Release Gates</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/60">
              Commit: <code className="text-white/80">{releaseVerdict.commitSha.slice(0, 8)}</code>
            </span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                releaseVerdict.verdict === "ready"
                  ? "bg-emerald-400/15 text-emerald-300 border border-emerald-400/30"
                  : "bg-rose-400/15 text-rose-300 border border-rose-400/30"
              }`}
            >
              VERDICT: {releaseVerdict.verdict.toUpperCase()}
            </span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-md bg-black/20 p-3 text-center">
            <span className="text-xs text-white/50">Total Gates</span>
            <div className="text-lg font-semibold text-white">{releaseVerdict.summary.total}</div>
          </div>
          <div className="rounded-md bg-black/20 p-3 text-center">
            <span className="text-xs text-emerald-400/70">Passed</span>
            <div className="text-lg font-semibold text-emerald-400">{releaseVerdict.summary.passed}</div>
          </div>
          <div className="rounded-md bg-black/20 p-3 text-center">
            <span className="text-xs text-rose-400/70">Critical Failures</span>
            <div className="text-lg font-semibold text-rose-400">{releaseVerdict.summary.criticalFailures}</div>
          </div>
          <div className="rounded-md bg-black/20 p-3 text-center">
            <span className="text-xs text-amber-400/70">Warnings</span>
            <div className="text-lg font-semibold text-amber-400">{releaseVerdict.summary.warnings}</div>
          </div>
        </div>

        <ul className="mt-4 space-y-3">
          {releaseVerdict.gates.map((gate) => (
            <li key={gate.id} className="rounded-md border border-white/10 bg-black/20 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-white">{gate.name}</h3>
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${
                      gate.severity === "critical"
                        ? "bg-rose-500/20 text-rose-300"
                        : "bg-amber-500/20 text-amber-300"
                    }`}
                  >
                    {gate.severity}
                  </span>
                </div>
                <span
                  className={
                    gate.status === "pass"
                      ? "text-xs font-semibold text-emerald-300"
                      : gate.status === "skip"
                      ? "text-xs font-semibold text-white/50"
                      : "text-xs font-semibold text-rose-300"
                  }
                >
                  {gate.status.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-white/70">{gate.detail}</p>
              {gate.failureReason && (
                <p className="mt-1 text-xs text-rose-300">Failure: {gate.failureReason}</p>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-lg border border-white/10 bg-white/6 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-white">Stellar pubnet readiness gate</h2>
          <span className="text-xs text-white/60">
            {pubnetGate.requested
              ? pubnetGate.ready
                ? "Pubnet is advertised"
                : `Pubnet is gated${pubnetGate.blockedBy ? ` — ${pubnetGate.blockedBy}` : ""}`
              : "Pubnet is not requested; testnet is unaffected"}
          </span>
        </div>
        {pubnetGate.checks.length === 0 ? (
          <p className="mt-3 text-xs text-white/70">
            No pubnet checks run while the deployment targets testnet.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {pubnetGate.checks.map((check) => (
              <li key={check.id} className="rounded-md border border-white/10 bg-black/20 p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h3 className="text-sm font-semibold text-white">{check.title}</h3>
                  <span
                    className={
                      check.status === "pass"
                        ? "text-xs font-semibold text-emerald-300"
                        : "text-xs font-semibold text-amber-300"
                    }
                  >
                    {check.status === "pass" ? "pass" : (check.reason ?? check.status)}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-white/70">{check.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-10 rounded-lg border border-white/10 bg-white/6 p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-semibold text-white">Provider resilience</h2>
            <p className="mt-1 text-sm text-white/52">Circuit state and safe network-specific fallback readiness.</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${providerHealth.overallStatus === "healthy" ? "bg-emerald-400/15 text-emerald-300" : "bg-amber-400/15 text-amber-300"}`}>
            {providerHealth.overallStatus}
          </span>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {[...providerHealth.evm, ...providerHealth.stellar].map((provider) => (
            <article key={`${provider.family}:${provider.network}`} className="rounded-md bg-black/24 px-4 py-3">
              <div className="flex items-center justify-between text-sm"><span className="font-medium text-white">{provider.family.toUpperCase()} · {provider.network}</span><span className="text-white/50">{provider.status}</span></div>
              <p className="mt-2 text-xs leading-5 text-white/48">{provider.detail}</p>
            </article>
          ))}
        </div>
        {providerHealth.circuits.length > 0 && <p className="mt-4 text-xs text-white/45">Tracked circuits: {providerHealth.circuits.length}. Open and half-open providers fail over only inside the requested network.</p>}
      </section>

      <section className="mt-10 rounded-lg border border-white/10 bg-white/6 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <AlertTriangle className="h-4 w-4 text-[#d9a441]" />
          Known limitations
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {knownLimitations.map((limitation) => (
            <div key={limitation} className="rounded-md bg-black/24 px-4 py-3 text-sm leading-6 text-white/58">
              {limitation}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-white/10 bg-white/6 p-5">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <ClipboardCheck className="h-4 w-4 text-[#d9a441]" />
          Feature flags
        </div>
        <div className="mt-5 grid gap-2">
          {featureFlags.flags.map((flag) => (
            <div key={flag.key} className="flex items-center justify-between rounded-md bg-black/24 px-4 py-2 text-sm text-white/64">
              <code className="text-white/80">{flag.key}</code>
              <span className={flag.enabled ? "text-emerald-300" : "text-white/40"}>
                {flag.enabled ? "enabled" : "disabled"} · {flag.reason}
              </span>
            </div>
          ))}
        </div>
      </section>
      <OperationsSloPanel />
    </AppShell>
  );
}
