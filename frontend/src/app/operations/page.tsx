import { AlertTriangle, CheckCircle2, ClipboardCheck } from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { knownLimitations, releaseReadinessChecks } from "@/server/operations/releaseReadiness";

export default function OperationsPage() {
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
            Deploy only after readiness checks, Supabase migration verification, production smoke, rollback review, and first-day monitoring are complete.
          </p>
          <div className="mt-7 rounded-lg border border-white/10 bg-white/6 p-5">
            <div className="text-sm font-semibold text-white">Required gates</div>
            <div className="mt-4 grid gap-3 text-sm text-white/64">
              <code className="rounded-md bg-black/35 px-3 py-2">npm run deploy:check</code>
              <code className="rounded-md bg-black/35 px-3 py-2">SMOKE_BASE_URL=https://your-production-domain.example npm run smoke</code>
              <code className="rounded-md bg-black/35 px-3 py-2">MONITOR_BASE_URL=https://your-production-domain.example npm run monitor:production</code>
            </div>
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
    </AppShell>
  );
}
