export class AccountLineageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AccountLineageError";
    this.code = code;
  }
}

export interface AccountRecord {
  id: string;
  createdBy?: string;
  sponsored?: boolean;
  missing?: boolean;
  payments?: { from: string; amount: string; asset: string; ledger: number; kind: "payment" | "path_payment" }[];
}

export interface LineageInput {
  account: string;
  hopLimit: number;
  accounts: AccountRecord[];
  labels?: { id: string; kind: "exchange" | "anchor"; evidence: string }[];
}

export function assertAccount(value: string): void {
  if (!/^G[A-Z2-7]{55}$/.test(value)) {
    throw new AccountLineageError("invalid_account", "Account must be a Stellar public key.");
  }
}

export function traceLineage(input: LineageInput) {
  const byId = new Map(input.accounts.map((account) => [account.id, account]));
  const labels = new Map((input.labels ?? []).map((label) => [label.id, label]));
  const hops = [];
  const seen = new Set<string>();
  let current = input.account;
  let cycle = false;
  let truncated = false;

  for (let step = 0; step < input.hopLimit; step += 1) {
    if (seen.has(current)) {
      cycle = true;
      break;
    }
    seen.add(current);
    const account = byId.get(current);
    const label = labels.get(current) ?? null;
    if (!account || account.missing || !account.createdBy) {
      hops.push({ account: current, status: "missing", root: false, label });
      break;
    }
    hops.push({
      account: current,
      creator: account.createdBy,
      sponsored: Boolean(account.sponsored),
      status: "created",
      root: false,
      label,
      payments: (account.payments ?? []).slice(0, 5),
    });
    current = account.createdBy;
  }

  if (!cycle && hops.at(-1)?.status === "created" && byId.get(current)?.createdBy) {
    truncated = true;
  }

  return {
    hops,
    cycle,
    truncated,
    hopLimit: input.hopLimit,
    coverage: truncated
      ? "Creator walk stopped at the hop limit."
      : "Bounded creator walk. Unlabeled accounts stay unlabeled.",
  };
}
