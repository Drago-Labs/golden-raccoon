/**
 * Production vesting reader.
 *
 * In this research slice, live chain decoding is deliberately bounded: only
 * fixture-shaped known schedules and explicitly marked unsupported contracts
 * are accepted. Arbitrary bytecode is refused as an evidence gap. Tests inject
 * a `VestingReader` directly; this module is the HTTP route default.
 */
import type { VestingReadResult, VestingReader, VestingSourceRef } from "./schema";

export type FixtureWorld = {
  bySourceId: Record<string, VestingReadResult | Error>;
};

export function createFixtureReader(world: FixtureWorld): VestingReader {
  return {
    async readSource(input: VestingSourceRef) {
      const entry = world.bySourceId[input.id];

      if (!entry) {
        return {
          observation: {
            ledger: null,
            closeTime: null,
            source: null,
            observedAt: new Date().toISOString(),
          },
          schedules: [
            {
              scheduleId: input.id,
              revision: 0,
              sourceType: input.kind === "issuer_published" ? "published_only" : "onchain_enforced",
              supported: false,
              unsupportedReason: "No supported vesting evidence is registered for this source id.",
              asset: {
                identity: `${input.network}:unknown`,
                symbol: "UNKNOWN",
                network: input.network,
                chainFamily: input.kind === "stellar_vesting_contract" || input.network.startsWith("stellar") ? "stellar" : "evm",
                decimals: 0,
              },
              beneficiary: null,
              plan: { kind: "cliff", amountBaseUnits: "0", cliffAt: new Date(0).toISOString() },
              provenance: `unsupported source ${input.id}`,
            },
          ],
          // Gaps for unsupported sources are recorded by the service from the
          // unsupported schedule row, so this array stays empty to avoid duplicates.
          gaps: [],
        };
      }

      if (entry instanceof Error) throw entry;

      return entry;
    },
  };
}

/**
 * Default production reader.
 *
 * Without configured adapters this refuses arbitrary contracts rather than
 * inventing unlocks. Callers that need deterministic evidence in tests or
 * demos pass an explicit `VestingReader`.
 */
export function createProductionReader(): VestingReader {
  return createFixtureReader({ bySourceId: {} });
}
