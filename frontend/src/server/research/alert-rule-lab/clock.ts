export function frozenClock(value: string) { const date = new Date(value); if (!Number.isFinite(date.getTime())) throw new Error("Invalid frozen clock"); return date; }
