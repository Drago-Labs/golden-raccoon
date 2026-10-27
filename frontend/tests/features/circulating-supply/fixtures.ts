import matching from "./data/matching-report.json";
export const address = "0x0000000000000000000000000000000000000001";
export const token = "0x0000000000000000000000000000000000000010";
export const request = { token: { network: "evm" as const, chainId: 1, address: token, decimals: 18 }, observation: { block: 123 }, exclusions: [{ address, reason: "Protocol treasury", evidenceUrl: "https://example.com/treasury" }], reportedSources: [{ name: "Project API", url: "https://example.com/supply", value: matching.reported, fetchedAt: "2026-01-01T00:00:00.000Z" }, { name: "Index provider", url: "https://index.example/supply", value: "850000", fetchedAt: "2026-01-01T00:00:00.000Z" }] };
export const deps = { read: async () => ({ totalSupply: matching.totalSupply, balances: matching.balances, observation: 123, sourceUrl: "https://rpc.example" }) };
