export type DestinationKind = "exchange" | "multisig" | "contract" | "unknown";
export type Checkpoint = { time: number; asset: string; chain: string; amount: string };
export type Outflow = { time: number; asset: string; chain: string; amount: string; destination: string; label?: string };
export type ReportedFigure = { asset: string; chain: string; reported: string; source: string };
export type CategorizedOutflow = Outflow & { kind: DestinationKind };
export type BalancePoint = { time: number; asset: string; chain: string; amount: string };
export type Comparison = { asset: string; chain: string; reported: string; observed: string | null; source: string; matches: boolean };
export type TreasuryReport = {
  projectId: string;
  balances: BalancePoint[];
  outflows: CategorizedOutflow[];
  comparisons: Comparison[];
  coverage: { notes: string[] };
};
