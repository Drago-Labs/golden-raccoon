import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { StrKey } from "@stellar/stellar-sdk";
import {
  ChainIdentityError,
  canonicalizeTransactionHash,
  createAssetIdentity,
  createContractIdentity,
  createWalletIdentity,
  resolveChainContext,
} from "../src/lib/chainIdentity";
import {
  createApprovalRecord,
  createTransactionRecord,
  getStorageCounts,
  getTransactionRecord,
} from "../src/server/storage";

const evmWallet = "0x1111111111111111111111111111111111111111";
const evmContract = "0x2222222222222222222222222222222222222222";
const evmHash = `0x${"ab".repeat(32)}`;
const stellarHash = "AB".repeat(32);
const stellarWallet = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 1));
const secondIssuer = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 2));
const sorobanContract = StrKey.encodeContract(Buffer.alloc(32, 3));
const secondSorobanContract = StrKey.encodeContract(Buffer.alloc(32, 4));

function expectIdentityError(action: () => unknown, code: ChainIdentityError["code"]) {
  assert.throws(action, (error) => error instanceof ChainIdentityError && error.code === code);
}

function runDomainChecks() {
  const evmContext = resolveChainContext({ chainFamily: "evm", network: "Base" });
  const stellarContext = resolveChainContext({ chainFamily: "stellar", network: "stellar:pubnet" });
  const evmAccount = createWalletIdentity({ ...evmContext, address: evmWallet.toUpperCase() });
  const stellarAccount = createWalletIdentity({ ...stellarContext, address: stellarWallet });
  const evmToken = createAssetIdentity({
    ...evmContext,
    kind: "evm_contract",
    contractAddress: evmContract.toUpperCase(),
    symbol: "usdc",
  });
  const native = createAssetIdentity({ ...stellarContext, kind: "stellar_native" });
  const classicA = createAssetIdentity({
    ...stellarContext,
    kind: "stellar_classic",
    code: "USDC",
    issuer: stellarWallet,
  });
  const classicB = createAssetIdentity({
    ...stellarContext,
    kind: "stellar_classic",
    code: "USDC",
    issuer: secondIssuer,
  });
  const sac = createAssetIdentity({
    ...stellarContext,
    kind: "stellar_sac",
    contractId: sorobanContract,
    wrappedAssetKey: classicA.assetKey,
  });
  const sep41 = createAssetIdentity({
    ...stellarContext,
    kind: "stellar_sep41",
    contractId: secondSorobanContract,
  });

  assert.equal(evmAccount.kind, "evm_account");
  assert.equal(evmAccount.address, evmWallet);
  assert.equal(stellarAccount.kind, "stellar_account");
  assert.equal(stellarAccount.address, stellarWallet, "Stellar account case must be preserved");
  assert.equal(evmToken.assetKey, `contract:${evmContract}`);
  assert.equal(native.assetKey, "native");
  assert.notEqual(classicA.assetKey, classicB.assetKey, "same-symbol issuers must not collide");
  assert.equal(sac.assetKey, `sac:${sorobanContract}`);
  assert.equal(sep41.assetKey, `sep41:${secondSorobanContract}`);
  assert.equal(
    createContractIdentity({ ...stellarContext, address: sorobanContract }).kind,
    "soroban_contract",
  );
  assert.equal(canonicalizeTransactionHash(stellarHash, stellarContext), stellarHash);

  expectIdentityError(
    () => createWalletIdentity({ ...evmContext, address: stellarWallet }),
    "cross_family_identifier",
  );
  expectIdentityError(
    () => createContractIdentity({ ...stellarContext, address: evmContract }),
    "cross_family_identifier",
  );
  expectIdentityError(
    () => canonicalizeTransactionHash(evmHash, stellarContext),
    "cross_family_identifier",
  );
}

function runMemoryAdapterChecks() {
  const base = createTransactionRecord({
    chainFamily: "evm",
    network: "base",
    hash: evmHash.toUpperCase().replace("0X", "0x"),
    type: "transfer",
    asset: "ETH",
    valueUsd: 10,
    status: "confirmed",
    walletAddress: evmWallet.toUpperCase(),
  });
  const ethereum = createTransactionRecord({
    chainFamily: "evm",
    network: "ethereum",
    hash: evmHash,
    type: "transfer",
    asset: "ETH",
    valueUsd: 20,
    status: "confirmed",
    walletAddress: evmWallet,
  });
  const stellar = createTransactionRecord({
    chainFamily: "stellar",
    network: "stellar-pubnet",
    hash: stellarHash,
    type: "transfer",
    asset: "native",
    valueUsd: 30,
    status: "confirmed",
    walletAddress: stellarWallet,
  });

  assert.equal(base.hash, evmHash);
  assert.equal(base.walletAddress, evmWallet);
  assert.equal(ethereum.network, "ethereum");
  assert.equal(stellar.hash, stellarHash);
  assert.equal(stellar.walletAddress, stellarWallet);
  assert.equal(getStorageCounts().transactions, 3);
  assert.equal(getTransactionRecord(evmHash, { chainFamily: "evm", network: "base" }), base);
  assert.equal(
    getTransactionRecord(evmHash, { chainFamily: "evm", network: "ethereum" }),
    ethereum,
  );

  const approval = createApprovalRecord({
    chainFamily: "stellar",
    network: "stellar-pubnet",
    walletAddress: stellarWallet,
    txHash: stellarHash,
  });
  assert.equal(approval.chainFamily, "stellar");
  assert.equal(approval.txHash, stellarHash);

  expectIdentityError(
    () =>
      createTransactionRecord({
        chainFamily: "stellar",
        network: "stellar-pubnet",
        hash: evmHash,
        type: "transfer",
        asset: "native",
        valueUsd: 1,
        status: "confirmed",
        walletAddress: stellarWallet,
      }),
    "cross_family_identifier",
  );
}

async function runMigrationChecks() {
  const db = new PGlite();
  const migrationUrl = new URL(
    "../src/server/storage/migrations/20260728_chain_aware_identity.sql",
    import.meta.url,
  );
  const validationUrl = new URL(
    "../src/server/storage/migrations/20260728_chain_aware_identity.validate.sql",
    import.meta.url,
  );
  const rollbackUrl = new URL(
    "../src/server/storage/migrations/20260728_chain_aware_identity.rollback.sql",
    import.meta.url,
  );
  const [migration, validation, rollback] = await Promise.all([
    readFile(migrationUrl, "utf8"),
    readFile(validationUrl, "utf8"),
    readFile(rollbackUrl, "utf8"),
  ]);

  await db.exec(`
    create table wallets (id text primary key, address text not null unique);
    create table token_identities (
      id text primary key,
      identity_key text not null unique,
      wallet_address text,
      contract_address text,
      chain text,
      symbol text
    );
    create table agent_runs (
      id text primary key,
      wallet_address text not null,
      target_chain text
    );
    create table agent_results (id text primary key, run_id text not null);
    create table recommendations (
      id text primary key,
      run_id text,
      wallet_address text not null
    );
    create table approvals (
      id text primary key,
      wallet_address text not null,
      tx_hash text not null,
      network text
    );
    create table transactions (
      id text primary key,
      wallet_address text not null,
      tx_hash text not null unique,
      network text not null
    );
    create table x402_payment_receipts (
      id text primary key,
      transaction_hash text,
      network text not null
    );
    create table user_rules (
      id text primary key,
      wallet_address text not null unique
    );

    insert into wallets values ('wallet-evm', '${evmWallet}'), ('wallet-stellar', '${stellarWallet}');
    insert into token_identities values
      ('asset-evm', 'base:${evmContract}', null, '${evmContract}', 'base', 'USDC'),
      ('asset-native', 'native', null, null, 'stellar-pubnet', 'XLM'),
      ('asset-classic', 'classic:USDC:${stellarWallet}', null, null, 'stellar-pubnet', 'USDC'),
      ('asset-sep41', 'sep41:${sorobanContract}', null, '${sorobanContract}', 'stellar-pubnet', 'SORO');
    insert into agent_runs values ('run-evm', '${evmWallet}', 'base'), ('run-stellar', '${stellarWallet}', 'stellar-pubnet');
    insert into agent_results values ('result-evm', 'run-evm'), ('result-stellar', 'run-stellar');
    insert into recommendations values ('rec-evm', 'run-evm', '${evmWallet}'), ('rec-stellar', 'run-stellar', '${stellarWallet}');
    insert into approvals values ('approval-evm', '${evmWallet}', '${evmHash}', 'base'), ('approval-stellar', '${stellarWallet}', '${stellarHash}', 'stellar-pubnet');
    insert into transactions values ('tx-evm', '${evmWallet}', '${evmHash}', 'base'), ('tx-stellar', '${stellarWallet}', '${stellarHash}', 'stellar-pubnet');
    insert into x402_payment_receipts values ('receipt-evm', '${evmHash}', 'base'), ('receipt-stellar', '${stellarHash}', 'stellar-pubnet');
    insert into user_rules values ('rule-evm', '${evmWallet}'), ('rule-stellar', '${stellarWallet}');
  `);

  await db.exec(migration);
  await db.exec(migration);
  await db.exec(validation);

  const report = await db.query<{ check_name: string; invalid_count: bigint }>(
    "select check_name, invalid_count from chain_identity_migration_report",
  );
  assert.equal(report.rows.every((row) => Number(row.invalid_count) === 0), true);

  await db.exec(`
    insert into token_identities
      (id, identity_key, chain_family, network, asset_kind, asset_key, issuer, chain, symbol)
    values
      ('same-symbol-a', 'stellar-testnet:classic:USDC:${stellarWallet}', 'stellar', 'stellar-testnet', 'stellar_classic', 'classic:USDC:${stellarWallet}', '${stellarWallet}', 'stellar-testnet', 'USDC'),
      ('same-symbol-b', 'stellar-testnet:classic:USDC:${secondIssuer}', 'stellar', 'stellar-testnet', 'stellar_classic', 'classic:USDC:${secondIssuer}', '${secondIssuer}', 'stellar-testnet', 'USDC');

    insert into transactions
      (id, wallet_address, tx_hash, network, chain_family)
    values
      ('tx-evm-other-network', '${evmWallet}', '${evmHash}', 'ethereum', 'evm');
  `);

  await assert.rejects(
    db.exec(`
      insert into transactions
        (id, wallet_address, tx_hash, network, chain_family)
      values
        ('tx-invalid-cross-family', '${stellarWallet}', '${evmHash}', 'stellar-pubnet', 'stellar');
    `),
  );
  await assert.rejects(db.exec(rollback), /rollback blocked: transaction hashes collide/);
  await db.exec("rollback");

  await db.exec("delete from transactions where id = 'tx-evm-other-network'");
  await db.exec(rollback);
  await db.exec(rollback);
  await db.close();
}

async function main() {
  runDomainChecks();
  runMemoryAdapterChecks();
  await runMigrationChecks();
  console.log("Chain-aware identity and migration checks passed.");
}

void main();
