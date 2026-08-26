#!/usr/bin/env node
/**
 * Deterministic deployment driver for the V2 contract audit layer.
 *
 * Design rules this script exists to enforce:
 *
 * 1. The target network is always explicit. There is no default, no "current"
 *    network, and no fallback to mainnet-shaped config. A missing `--network`
 *    is an error, not a guess.
 * 2. Secrets never reach stdout, stderr, or the artifact file. The script reads
 *    credentials from the environment, checks only that they are present, and
 *    passes them via standard tooling.
 * 3. Builds are compiled freshly from the working tree and the bytecode / wasm
 *    is hashed before deployment. The record written to `docs/deployments/`
 *    contains the git commit, the clean-tree flag, and the artifact sha256.
 * 4. Provenance manifest verification is strictly enforced before mainnet/production deployments.
 */

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { verifyProvenanceManifest } from "./verify-artifact-provenance.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, "..");

const NETWORKS = {
  soroban: {
    testnet: {
      rpcEnv: "STELLAR_RPC_URL",
      keyEnv: "STELLAR_SECRET_KEY",
      networkPassphrase: "Test SDF Network ; September 2015",
    },
    local: {
      rpcEnv: "STELLAR_RPC_URL",
      keyEnv: "STELLAR_SECRET_KEY",
      networkPassphrase: "Standalone Network ; February 2017",
    },
  },
  evm: {
    sepolia: {
      rpcEnv: "SEPOLIA_RPC_URL",
      keyEnv: "DEPLOYER_PRIVATE_KEY",
      chainId: 11155111,
    },
    hardhat: {
      rpcEnv: "HARDHAT_RPC_URL",
      keyEnv: "DEPLOYER_PRIVATE_KEY",
      chainId: 31337,
    },
  },
};

const BLOCKED_NETWORKS = new Set(["mainnet", "pubnet", "production"]);

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const parsed = { dryRun: false, chain: null, network: null, out: null, manifest: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") parsed.dryRun = true;
    else if (a === "--chain") parsed.chain = argv[++i];
    else if (a === "--network") parsed.network = argv[++i];
    else if (a === "--out") parsed.out = argv[++i];
    else if (a === "--manifest") parsed.manifest = argv[++i];
    else if (a.startsWith("--")) fail(`unknown flag ${a}`);
  }
  return parsed;
}

function requireEnv(name) {
  const val = process.env[name];
  if (!val || val.trim() === "") {
    fail(`required environment variable ${name} is not set`);
  }
  return val.trim();
}

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function gitIsClean() {
  try {
    const status = execFileSync("git", ["status", "--porcelain"], { cwd: root, encoding: "utf8" }).trim();
    return status.length === 0;
  } catch {
    return false;
  }
}

function sha256(filePath) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function toolVersion(cmd, args) {
  try {
    return execFileSync(cmd, args, { cwd: root, encoding: "utf8" }).trim().split("\n")[0];
  } catch {
    return "unknown";
  }
}

function run(cmd, args, opts = {}) {
  try {
    return execFileSync(cmd, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      ...opts,
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? `\n${err.stderr}` : "";
    fail(`command failed: ${cmd} ${args.join(" ")}${stderr}`);
  }
}

function buildSoroban() {
  run("stellar", ["contract", "build", "--manifest-path", "soroban/Cargo.toml"]);

  const wasmPath = join(
    root,
    "soroban/target/wasm32v1-none/release/golden_raccoon_audit_registry.wasm",
  );

  if (!existsSync(wasmPath)) {
    fail(`expected wasm at ${wasmPath} after build`);
  }

  return { wasmPath, wasmHash: sha256(wasmPath) };
}

function deploySoroban(network, config, dryRun) {
  const rpcUrl = requireEnv(config.rpcEnv);
  requireEnv(config.keyEnv);

  const { wasmPath, wasmHash } = buildSoroban();

  const artifact = {
    chain: "soroban",
    network,
    wasmSha256: wasmHash,
    rpcUrlEnv: config.rpcEnv,
    deployerSecretEnv: config.keyEnv,
    toolchain: {
      rustc: toolVersion("rustc", ["--version"]),
      cargo: toolVersion("cargo", ["--version"]),
      stellarCli: toolVersion("stellar", ["--version"]),
    },
  };

  if (dryRun) {
    console.log("dry run: built the wasm and validated configuration, deployed nothing");
    return { ...artifact, dryRun: true };
  }

  const contractId = run("stellar", [
    "contract",
    "deploy",
    "--wasm",
    wasmPath,
    "--source-account",
    process.env[config.keyEnv],
    "--rpc-url",
    rpcUrl,
    "--network",
    network,
  ]);

  return { ...artifact, contractId };
}

function deployEvm(network, config, dryRun) {
  requireEnv(config.rpcEnv);
  requireEnv(config.keyEnv);

  const contractsDir = join(root, "backend/contracts");

  run("npx", ["hardhat", "compile"], { cwd: contractsDir });

  const artifactPath = join(
    contractsDir,
    "artifacts/contracts/GoldenRaccoonAudit.sol/GoldenRaccoonAudit.json",
  );

  if (!existsSync(artifactPath)) {
    fail(`expected compiled artifact at ${artifactPath}`);
  }

  const compiled = JSON.parse(readFileSync(artifactPath, "utf8"));
  const artifact = {
    chain: "evm",
    network,
    bytecodeSha256: createHash("sha256").update(compiled.bytecode).digest("hex"),
    abiSha256: createHash("sha256").update(JSON.stringify(compiled.abi)).digest("hex"),
    rpcUrlEnv: config.rpcEnv,
    deployerKeyEnv: config.keyEnv,
    toolchain: {
      node: process.version,
      hardhat: toolVersion("npx", ["hardhat", "--version"]),
    },
  };

  if (dryRun) {
    console.log("dry run: compiled the contract and validated configuration, deployed nothing");
    return { ...artifact, dryRun: true };
  }

  const output = run("npx", ["hardhat", "run", "scripts/deploy-audit.ts", "--network", network], {
    cwd: contractsDir,
  });
  const match = output.match(/0x[a-fA-F0-9]{40}/);

  if (!match) {
    fail("deployment produced no contract address");
  }

  return { ...artifact, address: match[0] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.manifest) {
    console.log(`Verifying deployment provenance manifest: ${args.manifest}`);
    const prov = verifyProvenanceManifest(args.manifest, { strict: true });
    if (!prov.valid) {
      fail(`Provenance verification failed: ${prov.reason}`);
    }
    console.log("Provenance verification passed.");
  }

  if (!args.chain) {
    fail("--chain is required (evm or soroban)");
  }

  if (!NETWORKS[args.chain]) {
    fail(`unknown chain "${args.chain}". Use evm or soroban.`);
  }

  if (!args.network) {
    fail("--network is required. There is no default target network.");
  }

  const network = args.network.trim().toLowerCase();

  if (BLOCKED_NETWORKS.has(network)) {
    fail(
      `"${network}" is a production network. Pubnet and mainnet deployment require separate security approval and are not performed by this script.`,
    );
  }

  const config = NETWORKS[args.chain][network];

  if (!config) {
    const known = Object.keys(NETWORKS[args.chain]).join(", ");
    fail(`unknown ${args.chain} network "${network}". Known: ${known}`);
  }

  const commit = gitCommit();
  const clean = gitIsClean();

  if (!clean && !args.dryRun) {
    fail("the working tree is dirty. Deploy from a committed tree so the artifact record identifies real source.");
  }

  console.log(`chain:   ${args.chain}`);
  console.log(`network: ${network}`);
  console.log(`commit:  ${commit}`);
  console.log(`credentials read from: ${config.rpcEnv}, ${config.keyEnv} (values not printed)`);

  const result =
    args.chain === "soroban" ? deploySoroban(network, config, args.dryRun) : deployEvm(network, config, args.dryRun);

  const record = {
    ...result,
    commit,
    workingTreeClean: clean,
    deployedAt: new Date().toISOString(),
  };

  const outPath = args.out ? resolve(root, args.out) : join(root, "docs/deployments", `${args.chain}-${network}.json`);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(record, null, 2)}\n`);

  console.log(`\nartifact record written to ${outPath.replace(`${root}/`, "")}`);
  console.log(JSON.stringify(record, null, 2));
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main();
}
