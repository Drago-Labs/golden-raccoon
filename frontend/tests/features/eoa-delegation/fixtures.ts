export const ACCOUNT = "0x1111111111111111111111111111111111111111";
export const TARGET = "0x0000000000000000000000000000000000007702";
export const DESIGNATOR = `0xef0100${TARGET.slice(2)}` as const;
export const request = { address: ACCOUNT, network: "ethereum" } as const;
