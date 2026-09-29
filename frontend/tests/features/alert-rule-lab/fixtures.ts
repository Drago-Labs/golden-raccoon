import type { LabRequest } from "@/server/research/alert-rule-lab";
if (!window.localStorage) Object.defineProperty(window, "localStorage", { value: { clear() {} } });
export const wallet = "0x1111111111111111111111111111111111111111";
export const draft = { id: "draft", threshold: 75, hysteresis: 5, cooldownMinutes: 60, direction: "high_is_bad" as const, enabled: true };
export function observation(id: string, value: number | null, minute: number, extra: Partial<LabRequest["observations"][number]> = {}) { return { id, walletAddress: wallet, network: "goat", observationKey: "risk:token", value, observedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString(), evidenceId: id, incomplete: false, ...extra }; }
export function request(observations: LabRequest["observations"]): LabRequest { return { walletAddress: wallet, chainFamily: "evm", network: "goat", frozenAt: "2026-01-01T02:00:00.000Z", draft, observations }; }
