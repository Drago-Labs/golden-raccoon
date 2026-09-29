import type { ControlSource } from "@/server/research/issuer-control/evidenceReader";

if (typeof window !== "undefined" && !window.localStorage) {
  const values = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    value: {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (k: string) => values.get(k) ?? null,
      key: (i: number) => [...values.keys()][i] ?? null,
      removeItem: (k: string) => values.delete(k),
      setItem: (k: string, v: string) => values.set(k, v),
    },
  });
}

export const wallet = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";
export const issuer = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
export const otherIssuer = "GBTNDGT62HU2NIRQY3UVKDV4Q2YLBZILKMEOX6QEDMASBVDX5PVMUWYK";

export function source(
  overrides: Partial<Awaited<ReturnType<ControlSource["read"]>>> = {},
): ControlSource {
  return {
    read: async () => ({
      ledger: 100,
      closeTime: "2026-01-01T00:00:00Z",
      source: "https://horizon.example",
      accountBalances: [
        {
          asset_type: "credit_alphanum4",
          asset_code: "USD",
          asset_issuer: issuer,
          balance: "10.0000000",
          limit: "1000.0000000",
          is_authorized: true,
          is_authorized_to_maintain_liabilities: false,
        },
      ],
      accountMissing: false,
      issuerFlags: {
        authRequired: true,
        authRevocable: true,
        authImmutable: false,
        authClawbackEnabled: true,
        issuerExists: true,
      },
      issuerFlagsUnavailable: false,
      events: [
        {
          id: "effect-1",
          kind: "trustline_clawed_back",
          pagingToken: "1",
          account: wallet,
          assetKey: `classic:USD:${issuer}`,
          amount: "1.0000000",
          ledger: 99,
          closedAt: "2025-12-31T00:00:00Z",
          source: "https://horizon.example",
          note: "Observed trustline clawed back effect.",
        },
      ],
      pagesRead: 1,
      duplicatePage: false,
      truncated: false,
      ...overrides,
    }),
  };
}
