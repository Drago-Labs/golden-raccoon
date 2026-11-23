export type SecurityHeaders = {
  csp: string | null;
  hsts: string | null;
  frame: string | null;
  referrer: string | null;
};

export type ScriptRecord = {
  src: string | null;
  inline: boolean;
  sha256: string;
  integrity: string | null;
  origin: string;
  /** Always false. The monitor records source text and never runs it. */
  executed: false;
};

export type Snapshot = {
  id: string;
  domain: string;
  scripts: ScriptRecord[];
  headers: SecurityHeaders;
};

export type SnapshotDiff = {
  added: ScriptRecord[];
  removed: ScriptRecord[];
  headerChanges: { name: keyof SecurityHeaders; before: string | null; after: string | null }[];
};

export type Finding = { kind: "missing_integrity" | "new_third_party"; detail: string };

export type IntegrityReport = {
  domain: string;
  current: Snapshot;
  previous: Snapshot | null;
  diff: SnapshotDiff;
  findings: Finding[];
  coverage: { notes: string[] };
};
