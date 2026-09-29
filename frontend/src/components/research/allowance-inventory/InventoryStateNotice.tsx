export function InventoryStateNotice({ error, connected }: { error: string | null; connected: boolean }) {
  if (!connected) return <div role="status" className="rounded-2xl border border-amber-300/25 bg-amber-500/8 p-4 text-sm text-amber-100">Connect and authenticate an EVM wallet to scan its allowance exposure.</div>;
  if (error) return <div role="alert" className="rounded-2xl border border-red-300/25 bg-red-500/8 p-4 text-sm text-red-100">{error}</div>;
  return null;
}
