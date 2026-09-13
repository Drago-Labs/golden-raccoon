import { ERC1967_SLOTS } from "@/server/research/proxy-inspector";
if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });
export const proxy = "0x1111111111111111111111111111111111111111";
export const implementation = "0x2222222222222222222222222222222222222222";
export const beacon = "0x3333333333333333333333333333333333333333";
export const slotAddress = (address: string | null) => "0x" + (address ? address.slice(2).padStart(64, "0") : "0".repeat(64));
export function directReader(fail = false) { return { async call(method: string, params: unknown[]) { if (fail) throw new Error("RPC down"); if (method === "eth_blockNumber") return "0x64"; if (method === "eth_getCode") return "0x6001"; if (method === "eth_getStorageAt") return slotAddress(params[1] === ERC1967_SLOTS.implementation ? implementation : null); throw new Error("unexpected"); } }; }
