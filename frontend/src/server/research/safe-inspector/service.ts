export class SafeInspectorError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "SafeInspectorError";
    this.code = code;
  }
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
const KNOWN_SINGLETONS: Record<string, string> = {
  "0x0000000000000000000000000000000000000001": "1.3.0",
  "0x0000000000000000000000000000000000000002": "1.4.1",
};

export type SafeEvent = {
  type: "AddedOwner" | "RemovedOwner" | "ChangedThreshold" | "EnabledModule" | "ChangedGuard";
  block: number;
  logIndex: number;
  tx: string;
  page: number;
};

export type SafeInspection = {
  address: string;
  supported: boolean;
  version: string | null;
  owners: string[];
  threshold: number | null;
  nonce: number | null;
  modules: { address: string; review: "known" | "unreviewed"; thresholdBypass: true }[];
  guard: { address: string | null; review: "known" | "unreviewed" | "none" };
  fallbackHandler: string | null;
  events: SafeEvent[];
  control: string;
  coverage: string;
};

export function inspectSafe(input: {
  address: string;
  singleton?: string | null;
  owners?: string[];
  threshold?: number | null;
  nonce?: number | null;
  modulePages?: string[][];
  guard?: string | null;
  knownGuards?: string[];
  knownModules?: string[];
  fallbackHandler?: string | null;
  events?: SafeEvent[];
}): SafeInspection {
  if (!ADDRESS.test(input.address)) {
    throw new SafeInspectorError("invalid_address", "Address must be a 20-byte hex value.");
  }

  const version = input.singleton ? KNOWN_SINGLETONS[input.singleton.toLowerCase()] ?? null : null;
  if (!version) {
    return {
      address: input.address,
      supported: false,
      version: null,
      owners: [],
      threshold: null,
      nonce: null,
      modules: [],
      guard: { address: null, review: "none" },
      fallbackHandler: null,
      events: [],
      control: "This address is not a supported Safe. It is not reported as safe.",
      coverage: "Supported Safe singleton versions: 1.3.0 and 1.4.1.",
    };
  }

  const knownModules = new Set((input.knownModules ?? []).map((item) => item.toLowerCase()));
  const knownGuards = new Set((input.knownGuards ?? []).map((item) => item.toLowerCase()));
  const modules = (input.modulePages ?? []).flat().map((address) => ({
    address,
    review: knownModules.has(address.toLowerCase()) ? ("known" as const) : ("unreviewed" as const),
    thresholdBypass: true as const,
  }));
  const seen = new Set<string>();
  const events = [...(input.events ?? [])]
    .sort((left, right) => left.block - right.block || left.logIndex - right.logIndex || left.tx.localeCompare(right.tx))
    .filter((event) => {
      const key = `${event.tx}:${event.type}:${event.block}:${event.logIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

  const guardAddress = input.guard ?? null;
  return {
    address: input.address,
    supported: true,
    version,
    owners: input.owners ?? [],
    threshold: input.threshold ?? null,
    nonce: input.nonce ?? null,
    modules,
    guard: {
      address: guardAddress,
      review: guardAddress ? (knownGuards.has(guardAddress.toLowerCase()) ? "known" : "unreviewed") : "none",
    },
    fallbackHandler: input.fallbackHandler ?? null,
    events,
    control: modules.length
      ? "Enabled modules can move funds without meeting the owner threshold."
      : "No enabled module was found. Owner threshold still applies to owner paths.",
    coverage: "Supported Safe singleton versions: 1.3.0 and 1.4.1. Unknown modules and guards are unreviewed, not malicious.",
  };
}
