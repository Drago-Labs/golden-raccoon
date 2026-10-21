export type TomlValidator = {
  publicKey: string;
  homeDomain: string | null;
  source: string;
  fetchedAt: string | null;
};

export type NodeHome = { publicKey: string; homeDomain: string | null };

export type HomeDisagreement = {
  publicKey: string;
  field: "home_domain" | "missing_toml" | "missing_node";
  nodeValue: string | null;
  tomlValue: string | null;
};

/** Read `[[VALIDATORS]]` tables. Only PUBLIC_KEY and HOME_DOMAIN are compared. */
export function parseTomlValidators(toml: string, source: string, fetchedAt: string | null): TomlValidator[] {
  const validators: TomlValidator[] = [];
  let current: Partial<TomlValidator> | null = null;
  const flush = () => {
    if (current?.publicKey) validators.push({ publicKey: current.publicKey, homeDomain: current.homeDomain ?? null, source, fetchedAt });
    current = null;
  };
  for (const rawLine of toml.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (/^\[\[VALIDATORS\]\]$/i.test(line)) {
      flush();
      current = {};
      continue;
    }
    if (!current || line.startsWith("[")) continue;
    const match = /^([A-Za-z0-9_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (!match) continue;
    const field = match[1]?.toUpperCase();
    const value = match[2]?.trim() ?? "";
    if (field === "PUBLIC_KEY") current.publicKey = value;
    if (field === "HOME_DOMAIN") current.homeDomain = value;
  }
  flush();
  return validators;
}

export function compareToml(nodes: NodeHome[], tomlRows: TomlValidator[]): HomeDisagreement[] {
  const byKey = new Map(tomlRows.map((row) => [row.publicKey, row]));
  const disagreements: HomeDisagreement[] = [];
  for (const node of nodes) {
    const row = byKey.get(node.publicKey);
    if (!row) {
      disagreements.push({ publicKey: node.publicKey, field: "missing_toml", nodeValue: node.homeDomain, tomlValue: null });
      continue;
    }
    if ((row.homeDomain ?? "") !== (node.homeDomain ?? "")) {
      disagreements.push({ publicKey: node.publicKey, field: "home_domain", nodeValue: node.homeDomain, tomlValue: row.homeDomain });
    }
  }
  const nodeKeys = new Set(nodes.map((node) => node.publicKey));
  for (const row of tomlRows) {
    if (!nodeKeys.has(row.publicKey)) {
      disagreements.push({ publicKey: row.publicKey, field: "missing_node", nodeValue: null, tomlValue: row.homeDomain });
    }
  }
  return disagreements;
}
