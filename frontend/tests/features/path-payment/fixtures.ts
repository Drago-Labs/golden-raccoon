import type { PathSource } from "@/server/research/path-payment/evidenceReader";
import { normalizePathRecord } from "@/server/research/path-payment/normalize";

export const wallet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const issuerA = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const issuerB = "GBTNDGT62HU2NIRQY3UVKDV4Q2YLBZILKMEOX6QEDMASBVDX5PVMUWYK";

export function source(
  overrides: Partial<Awaited<ReturnType<PathSource["read"]>>> = {},
): PathSource {
  const route = normalizePathRecord(
    {
      source_amount: "1.0000000",
      destination_amount: "2.5000000",
      source_asset_type: "native",
      destination_asset_type: "credit_alphanum4",
      destination_asset_code: "USD",
      destination_asset_issuer: issuerA,
      path: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "USD",
          asset_issuer: issuerB,
        },
      ],
    },
    "strict_send",
    "route-1",
  );
  return {
    read: async () => ({
      ledger: 300,
      closeTime: "2026-01-03T00:00:00Z",
      source: "https://horizon.example",
      quoteAgeSeconds: 5,
      routes: [route],
      noPath: false,
      ...overrides,
    }),
  };
}
