import { VolatilityProfile } from "@/components/research/volatility-profile/VolatilityProfile";

export const dynamic = "force-dynamic";

export default function VolatilityProfilePage() {
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Historical Volatility & Drawdowns</h1>
        <p className="text-sm text-white/70">
          Profile log-return volatility, maximum drawdown, recovery periods, and data gaps over a stated window.
        </p>
      </header>
      <VolatilityProfile />
    </main>
  );
}
