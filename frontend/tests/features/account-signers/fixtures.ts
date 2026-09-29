import type { SignerSource } from "@/server/research/account-signers/evidenceReader";

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
export const coSigner = "GBTNDGT62HU2NIRQY3UVKDV4Q2YLBZILKMEOX6QEDMASBVDX5PVMUWYK";

export function source(
  overrides: Partial<Awaited<ReturnType<SignerSource["read"]>>> = {},
): SignerSource {
  return {
    read: async () => ({
      ledger: 200,
      closeTime: "2026-01-02T00:00:00Z",
      source: "https://horizon.example",
      thresholds: { low: 1, medium: 2, high: 3, masterWeight: 0 },
      signers: [
        { key: wallet, weight: 0, kind: "ed25519", sponsor: null },
        { key: coSigner, weight: 2, kind: "ed25519", sponsor: coSigner },
      ],
      accountMissing: false,
      ...overrides,
    }),
  };
}
