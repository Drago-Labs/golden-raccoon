export function inCooldown(previousAt: number | null, currentAt: number, minutes: number) { return previousAt !== null && currentAt - previousAt < Math.max(0, minutes) * 60_000; }
export function fingerprint(item: { evidenceId?: string; value: number | null }) { return `${item.evidenceId ?? "no-evidence"}:${item.value}`; }
