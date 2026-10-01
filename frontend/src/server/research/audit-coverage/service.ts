export class AuditCoverageError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "AuditCoverageError";
    this.code = code;
  }
}

export interface AuditRecord {
  id: string;
  auditor: string;
  date: string;
  reportUrl: string;
  reportHash: string;
  providedDigest: string;
  commit: string;
  codeHash?: string;
  contracts: string[];
  findings: { severity: string; resolution: string }[];
}

export interface DeployedContract {
  address: string;
  codeHash?: string;
  commit?: string;
}

export function assertContract(value: string): void {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new AuditCoverageError("invalid_contract", "Contract address must be a 20-byte hex address.");
  }
}

export function mapAudits(records: AuditRecord[], deployed: DeployedContract[]) {
  const shown = records.map((record) => ({
    ...record,
    intact: record.reportHash.toLowerCase() === record.providedDigest.toLowerCase(),
  }));
  const contracts = deployed.map((contract) => {
    const matches = shown.filter((record) => record.intact && record.contracts.map((item) => item.toLowerCase()).includes(contract.address.toLowerCase()));
    if (!contract.codeHash && !contract.commit) {
      return { address: contract.address, status: "unknown" as const };
    }
    const hashMatch = matches.find((record) => record.codeHash && contract.codeHash && record.codeHash.toLowerCase() === contract.codeHash.toLowerCase());
    if (contract.codeHash && matches.some((record) => record.codeHash && record.codeHash.toLowerCase() !== contract.codeHash!.toLowerCase()) && !hashMatch) {
      return { address: contract.address, status: "changed-since-audit" as const };
    }
    if (hashMatch) return { address: contract.address, status: "covered" as const, auditId: hashMatch.id };
    const commitMatch = matches.find((record) => contract.commit && record.commit === contract.commit);
    if (commitMatch) return { address: contract.address, status: "covered" as const, auditId: commitMatch.id };
    if (matches.length === 0 && shown.some((record) => record.intact)) {
      return { address: contract.address, status: "not-covered" as const };
    }
    return { address: contract.address, status: "unknown" as const };
  });
  const findings = shown.filter((record) => record.intact).flatMap((record) => record.findings);
  return {
    records: shown.map((record) => ({ id: record.id, auditor: record.auditor, intact: record.intact })),
    contracts,
    findings,
    coverage: "Statuses use published audit scope. Findings are not re-rated.",
  };
}
