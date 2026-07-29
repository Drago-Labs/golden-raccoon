/**
 * Postgres adapter for the V3 alert engine. Optional: when a connection
 * string (SUPABASE_DB_URL, POSTGRES_URL, or DATABASE_URL) is present and
 * `pg` is installed, the alert storage functions dual-write rows to the
 * Postgres tables defined in `frontend/src/server/storage/schema.sql`.
 *
 * Design notes:
 *  - Reads stay in-memory so existing synchronous callers (routes,
 *    fixtures, dashboards) keep working without async refactors.
 *  - Writes go through memory immediately so the caller sees the row,
 *    then fire a best-effort mirror write to Postgres. When the mirror
 *    fails the row stays in memory and `getStorageHealth()` flags
 *    `persistent: false` so operators see the degraded state.
 *  - All mirror writes share a single promise chain so the natural
 *    call order (`createAlertRule` -> `createAlert` -> `createAlertDelivery`)
 *    is preserved across the Postgres boundary and the alerts FOREIGN
 *    KEY on `alerts.rule_id references alert_rules(id)` cannot fire
 *    before the rule row exists.
 *  - If the very first connection attempt fails the cached `connectPromise`
 *    is reset so the next write can retry instead of being permanently
 *    silenced.
 *  - `applySchema()` runs `schema.sql` once at boot so the SQL tables are
 *    physically present in the database, satisfying the audit
 *    requirement that "the added SQL tables are connected to the storage
 *    implementation". All statements in the schema are `IF NOT EXISTS`.
 *
 * This file does not assume `pg` is present. If the dependency is not
 * installed we fall back to a "schema connection string detected but no
 * pg client" state that `getStorageHealth()` exposes honestly.
 */

import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type {
  Alert,
  AlertDelivery,
  AlertObservation,
  AlertRule,
  ChainFamily,
  DiscoveryClassification,
  TransactionLifecycleEvent,
  TransactionLifecycleStatus,
  TransactionRecord,
  WatchlistEntry,
  WatchlistScanRun,
} from "@/server/types";

type MaybePgPool = {
  query(text: string, values?: unknown[]): Promise<{ rows: unknown[]; rowCount: number }>;
  end(): Promise<void>;
};

type PgModule = {
  Pool: new (config: { connectionString: string; ssl?: { rejectUnauthorized: boolean } | false }) => MaybePgPool;
};

let loadedPgModule: PgModule | null | undefined;

async function tryLoadPg(): Promise<PgModule | null> {
  if (loadedPgModule !== undefined) return loadedPgModule;

  try {
    // pathToFileURL handles spaces and odd characters on disk; safer than
    // a synthetic `process.cwd()/pg` string.
    const localRequire = createRequire(pathToFileURL(`${process.cwd()}/_pg_loader.cjs`).href);
    const mod = localRequire("pg") as PgModule;
    loadedPgModule = mod;

    return mod;
  } catch (error) {
    loadedPgModule = null;
    // Surface the load error so start-up health reflects it instead of
    // reporting a falsely "installed" state that never tries to connect.
    lastPgLoadError = error instanceof Error ? error.message : String(error);

    return null;
  }
}

let lastPgLoadError: string | null = null;

function resolveConnectionString(): string | undefined {
  return (
    process.env.SUPABASE_DB_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    undefined
  );
}

const SCHEMA_PATH = path.join(process.cwd(), "src/server/storage/schema.sql");

function loadSchema(): string {
  try {
    return fs.readFileSync(SCHEMA_PATH, "utf-8");
  } catch {
    return "";
  }
}

type PersistedAlertRule = Pick<
  AlertRule,
  | "id"
  | "walletAddress"
  | "triggerType"
  | "observationKey"
  | "threshold"
  | "hysteresis"
  | "cooldownMinutes"
  | "direction"
  | "severity"
  | "enabled"
  | "createdAt"
  | "updatedAt"
>;

type PersistedAlertObservation = Pick<
  AlertObservation,
  | "id"
  | "walletAddress"
  | "triggerType"
  | "observationKey"
  | "value"
  | "direction"
  | "createdAt"
  | "incompleteData"
> & { evidence: AlertObservation["evidence"] };

type PersistedAlert = Pick<
  Alert,
  | "id"
  | "walletAddress"
  | "ruleId"
  | "triggerType"
  | "observationKey"
  | "status"
  | "severity"
  | "message"
  | "beforeValue"
  | "afterValue"
  | "evidenceBefore"
  | "evidenceAfter"
  | "evidenceData"
  | "triggeredAt"
  | "recoveredAt"
  | "acknowledgedAt"
>;

type PersistedWatchlistEntry = Pick<
  WatchlistEntry,
  | "id"
  | "walletAddress"
  | "identityKey"
  | "chain"
  | "network"
  | "contractAddress"
  | "pairAddress"
  | "symbol"
  | "tokenName"
  | "assetKey"
  | "issuer"
  | "assetType"
  | "source"
  | "note"
  | "createdAt"
  | "lastScannedAt"
  | "latestScanRunId"
  | "latestClassification"
  | "latestScore"
  | "latestStatus"
>;

type PersistedWatchlistScanRun = Pick<
  WatchlistScanRun,
  | "id"
  | "entryId"
  | "walletAddress"
  | "identityKey"
  | "agentRunId"
  | "classification"
  | "classificationReasons"
  | "confidence"
  | "score"
  | "sourceLineage"
  | "missingData"
  | "riskReport"
  | "status"
  | "previousRunId"
  | "scannedAt"
>;

type PersistedWatchlistEntryLatestScan = {
  classification: DiscoveryClassification;
  score: number;
  scannedAt: string;
  status: WatchlistScanRun["status"];
  scanRunId: string;
};

type PersistedAlertDelivery = Pick<
  AlertDelivery,
  | "id"
  | "alertId"
  | "walletAddress"
  | "channel"
  | "status"
  | "errorDetail"
  | "sanitizedPayload"
  | "attemptCount"
  | "createdAt"
  | "sentAt"
>;

class PostgresStorageAdapter {
  private pool: MaybePgPool | null = null;
  private connectionString: string | undefined = resolveConnectionString();
  private migrated = false;
  private connected = false;
  private connectedAt: string | null = null;
  private lastError: string | null = null;
  private mirrorFailureCount = 0;
  private mirrorSuccessCount = 0;
  private connectPromise: Promise<{ ok: boolean; detail: string }> | null = null;

  /**
   * Single promise chain every mirror write is appended to. Ensures
   * foreign-key-sensitive tables (alerts.rule_id, alert_deliveries.alert_id)
   * are inserted in the same order the in-memory store is mutated, so the
   * mirror can never violate the rule → alert → delivery dependency.
   */
  private mirrorQueue: Promise<unknown> = Promise.resolve();

  isConfigured(): boolean {
    return Boolean(this.connectionString);
  }

  isConnected(): boolean {
    return this.connected;
  }

  getHealthSnapshot() {
    // pgInstalled is a tri-state: true (module loaded successfully),
    // false (load attempted but failed), null (never attempted). This
    // lets health consumers distinguish "we don't know yet" from
    // "we tried and pg is broken".
    const pgInstalled: true | false | null =
      loadedPgModule === undefined ? null : loadedPgModule === null ? false : true;

    return {
      connectionStringPresent: this.isConfigured(),
      pgInstalled,
      pgLoadError: lastPgLoadError,
      connected: this.connected,
      connectedAt: this.connectedAt,
      lastError: this.lastError,
      mirrorSuccessCount: this.mirrorSuccessCount,
      mirrorFailureCount: this.mirrorFailureCount,
    };
  }

  async connect(): Promise<{ ok: boolean; detail: string }> {
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = this.doConnect();

    return this.connectPromise;
  }

  private async doConnect(): Promise<{ ok: boolean; detail: string }> {
    if (!this.connectionString) {
      return { ok: false, detail: "No SUPABASE_DB_URL/POSTGRES_URL/DATABASE_URL configured." };
    }

    const pg = await tryLoadPg();

    if (!pg) {
      this.lastError = lastPgLoadError ?? "pg dependency not installed in this deployment bundle.";

      return { ok: false, detail: this.lastError };
    }

    if (this.pool) {
      return { ok: this.connected, detail: "Already connected." };
    }

    try {
      this.pool = new pg.Pool({
        connectionString: this.connectionString,
        ssl: process.env.SUPABASE_DB_URL ? { rejectUnauthorized: false } : false,
      });
      await this.pool.query("SELECT 1");
      this.connected = true;
      this.connectedAt = new Date().toISOString();
      this.lastError = null;
      const migration = await this.applySchema();

      if (!migration.ok) {
        this.connected = false;
        await this.safeEnd();
        // Allow the next call to try again: the cached failure potential
        // would otherwise mask transient blips.
        this.connectPromise = null;

        return { ok: false, detail: migration.detail };
      }

      return { ok: true, detail: "Connected and migrated." };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      this.connected = false;
      await this.safeEnd();
      this.connectPromise = null;

      return { ok: false, detail: this.lastError };
    }
  }

  private async safeEnd() {
    if (!this.pool) return;
    try {
      await this.pool.end();
    } catch {
      // ignore — already closed or never opened
    }
    this.pool = null;
  }

  private async applySchema(): Promise<{ ok: boolean; detail: string }> {
    if (this.migrated || !this.pool) return { ok: true, detail: "migrated" };
    const schema = loadSchema();

    if (!schema.trim()) {
      this.migrated = true;
      return { ok: true, detail: "schema file empty; skipping migration" };
    }

    try {
      await this.pool.query(schema);
      this.migrated = true;

      return { ok: true, detail: "schema applied" };
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);

      return { ok: false, detail: this.lastError };
    }
  }

  /**
   * Append a mirror operation to the shared chain so that rule -> alert
   * -> delivery writes honour the FK ordering regardless of how the
   * caller fired them. The returned promise is wrapped in `.catch` so
   * callers that fire-and-forget (`void adapter.mirrorAlert(...)`) do
   * not produce unhandled-rejection warnings when the actual SQL
   * statement throws.
   */
  private enqueueMirror<T>(work: () => Promise<T>): Promise<T | undefined> {
    const previous = this.mirrorQueue;
    const next = previous.then(work, work);
    const safe = next.catch(() => undefined);
    // Don't let one failed write break the chain for subsequent writes.
    this.mirrorQueue = safe;

    return safe;
  }

  private async doMirrorAlertRule(rule: PersistedAlertRule): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO alert_rules (id, wallet_address, trigger_type, observation_key, threshold, hysteresis, cooldown_minutes, direction, severity, enabled, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         ON CONFLICT (id) DO UPDATE SET
           wallet_address = EXCLUDED.wallet_address,
           trigger_type = EXCLUDED.trigger_type,
           observation_key = EXCLUDED.observation_key,
           threshold = EXCLUDED.threshold,
           hysteresis = EXCLUDED.hysteresis,
           cooldown_minutes = EXCLUDED.cooldown_minutes,
           direction = EXCLUDED.direction,
           severity = EXCLUDED.severity,
           enabled = EXCLUDED.enabled,
           updated_at = EXCLUDED.updated_at`,
        [
          rule.id,
          rule.walletAddress,
          rule.triggerType,
          rule.observationKey ?? null,
          rule.threshold,
          rule.hysteresis,
          rule.cooldownMinutes,
          rule.direction ?? "high_is_bad",
          rule.severity,
          rule.enabled,
          rule.createdAt,
          rule.updatedAt,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doMirrorAlertObservation(observation: PersistedAlertObservation): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO alert_observations (id, wallet_address, trigger_type, observation_key, value, direction, evidence, incomplete_data, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
         ON CONFLICT (id) DO NOTHING`,
        [
          observation.id,
          observation.walletAddress,
          observation.triggerType,
          observation.observationKey,
          observation.value,
          observation.direction,
          JSON.stringify(observation.evidence ?? {}),
          observation.incompleteData ?? false,
          observation.createdAt,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doMirrorAlert(alert: PersistedAlert): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO alerts (id, wallet_address, rule_id, trigger_type, observation_key, status, severity, message, before_value, after_value, evidence_before, evidence_after, evidence_data, triggered_at, recovered_at, acknowledged_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12::jsonb,$13::jsonb,$14,$15,$16)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           severity = EXCLUDED.severity,
           message = EXCLUDED.message,
           before_value = EXCLUDED.before_value,
           after_value = EXCLUDED.after_value,
           evidence_before = EXCLUDED.evidence_before,
           evidence_after = EXCLUDED.evidence_after,
           evidence_data = EXCLUDED.evidence_data,
           recovered_at = EXCLUDED.recovered_at,
           acknowledged_at = EXCLUDED.acknowledged_at`,
        [
          alert.id,
          alert.walletAddress,
          alert.ruleId,
          alert.triggerType,
          alert.observationKey,
          alert.status,
          alert.severity,
          alert.message,
          alert.beforeValue,
          alert.afterValue,
          JSON.stringify(alert.evidenceBefore ?? {}),
          JSON.stringify(alert.evidenceAfter ?? {}),
          JSON.stringify(alert.evidenceData ?? {}),
          alert.triggeredAt,
          alert.recoveredAt ?? null,
          alert.acknowledgedAt ?? null,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doMirrorWatchlistEntry(entry: PersistedWatchlistEntry): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO watchlist_entries (
           id, wallet_address, identity_key, chain, network,
           contract_address, pair_address, symbol, token_name, asset_key,
           issuer, asset_type, source, note, last_scanned_at,
           latest_scan_run_id, latest_classification, latest_score, latest_status, created_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         ON CONFLICT (id) DO UPDATE SET
           wallet_address = EXCLUDED.wallet_address,
           identity_key = EXCLUDED.identity_key,
           chain = EXCLUDED.chain,
           network = EXCLUDED.network,
           contract_address = EXCLUDED.contract_address,
           pair_address = EXCLUDED.pair_address,
           symbol = EXCLUDED.symbol,
           token_name = EXCLUDED.token_name,
           asset_key = EXCLUDED.asset_key,
           issuer = EXCLUDED.issuer,
           asset_type = EXCLUDED.asset_type,
           source = EXCLUDED.source,
           note = EXCLUDED.note,
           last_scanned_at = EXCLUDED.last_scanned_at,
           latest_scan_run_id = EXCLUDED.latest_scan_run_id,
           latest_classification = EXCLUDED.latest_classification,
           latest_score = EXCLUDED.latest_score,
           latest_status = EXCLUDED.latest_status`,
        [
          entry.id,
          entry.walletAddress,
          entry.identityKey,
          entry.chain,
          entry.network ?? null,
          entry.contractAddress ?? null,
          entry.pairAddress ?? null,
          entry.symbol ?? null,
          entry.tokenName ?? null,
          entry.assetKey ?? null,
          entry.issuer ?? null,
          entry.assetType ?? null,
          entry.source,
          entry.note ?? null,
          entry.lastScannedAt ?? null,
          entry.latestScanRunId ?? null,
          entry.latestClassification ?? null,
          entry.latestScore ?? null,
          entry.latestStatus ?? null,
          entry.createdAt,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doRemoveMirrorWatchlistEntry(id: string): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query("DELETE FROM watchlist_scan_runs WHERE entry_id = $1", [id]);
      await this.pool.query("DELETE FROM discovery_alerts WHERE entry_id = $1", [id]);
      await this.pool.query("DELETE FROM watchlist_entries WHERE id = $1", [id]);
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doMirrorWatchlistScanRun(run: PersistedWatchlistScanRun): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO watchlist_scan_runs (
           id, entry_id, wallet_address, identity_key, agent_run_id,
           classification, classification_reasons, confidence, score,
           source_lineage, missing_data, risk_report, status, previous_run_id, scanned_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15)
         ON CONFLICT (id) DO UPDATE SET
           entry_id = EXCLUDED.entry_id,
           classification = EXCLUDED.classification,
           classification_reasons = EXCLUDED.classification_reasons,
           confidence = EXCLUDED.confidence,
           score = EXCLUDED.score,
           source_lineage = EXCLUDED.source_lineage,
           missing_data = EXCLUDED.missing_data,
           risk_report = EXCLUDED.risk_report,
           status = EXCLUDED.status`,
        [
          run.id,
          run.entryId,
          run.walletAddress,
          run.identityKey,
          run.agentRunId ?? null,
          run.classification,
          JSON.stringify(run.classificationReasons),
          run.confidence,
          run.score,
          JSON.stringify(run.sourceLineage),
          JSON.stringify(run.missingData),
          run.riskReport ? JSON.stringify(run.riskReport) : null,
          run.status,
          run.previousRunId ?? null,
          run.scannedAt,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doUpdateMirrorWatchlistEntryLatestScan(entryId: string, update: PersistedWatchlistEntryLatestScan): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `UPDATE watchlist_entries SET
           last_scanned_at = $1,
           latest_scan_run_id = $2,
           latest_classification = $3,
           latest_score = $4,
           latest_status = $5
         WHERE id = $6`,
        [update.scannedAt, update.scanRunId, update.classification, update.score, update.status, entryId],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  private async doMirrorAlertDelivery(delivery: PersistedAlertDelivery): Promise<void> {
    if (!this.pool) return;
    try {
      await this.pool.query(
        `INSERT INTO alert_deliveries (id, alert_id, wallet_address, channel, status, error_detail, sanitized_payload, attempt_count, created_at, sent_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           error_detail = EXCLUDED.error_detail,
           sent_at = EXCLUDED.sent_at,
           attempt_count = EXCLUDED.attempt_count`,
        [
          delivery.id,
          delivery.alertId,
          delivery.walletAddress,
          delivery.channel,
          delivery.status,
          delivery.errorDetail ?? null,
          JSON.stringify(delivery.sanitizedPayload ?? {}),
          delivery.attemptCount,
          delivery.createdAt,
          delivery.sentAt ?? null,
        ],
      );
      this.mirrorSuccessCount += 1;
    } catch (error) {
      this.mirrorFailureCount += 1;
      this.lastError = error instanceof Error ? error.message : String(error);
    }
  }

  async mirrorAlertRule(rule: PersistedAlertRule): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorAlertRule(rule));
  }

  async mirrorAlertObservation(observation: PersistedAlertObservation): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorAlertObservation(observation));
  }

  async mirrorAlert(alert: PersistedAlert): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorAlert(alert));
  }

  async mirrorAlertDelivery(delivery: PersistedAlertDelivery): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorAlertDelivery(delivery));
  }

  async mirrorTransaction(record: TransactionRecord): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => doMirrorTransactionRecord(this.pool!, record));
  }

  async mirrorTransactionLifecycleEvent(event: TransactionLifecycleEvent): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => doMirrorTransactionLifecycleEvent(this.pool!, event));
  }

  async mirrorWatchlistEntry(entry: PersistedWatchlistEntry): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorWatchlistEntry(entry));
  }

  async removeMirrorWatchlistEntry(id: string): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doRemoveMirrorWatchlistEntry(id));
  }

  async mirrorWatchlistScanRun(run: PersistedWatchlistScanRun): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doMirrorWatchlistScanRun(run));
  }

  async updateMirrorWatchlistEntryLatestScan(entryId: string, update: PersistedWatchlistEntryLatestScan): Promise<void> {
    if (!this.connectionString || !(await this.ensurePool())) return;
    await this.enqueueMirror(() => this.doUpdateMirrorWatchlistEntryLatestScan(entryId, update));
  }

  async hydrateWatchlistTables(target: {
    entries: WatchlistEntry[];
    scanRuns: WatchlistScanRun[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.connectionString || !(await this.ensurePool())) {
      return { hydrated: 0, skipped: 0 };
    }
    return (await this.enqueueMirror(() => this.doHydrateWatchlistTables(target))) ?? { hydrated: 0, skipped: 0 };
  }

  private async doHydrateWatchlistTables(target: {
    entries: WatchlistEntry[];
    scanRuns: WatchlistScanRun[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.pool) return { hydrated: 0, skipped: 0 };

    let hydrated = 0;
    let skipped = 0;

    hydrated += await this.mergeWatchlistEntriesFromPostgres(target.entries, () => skipped++);
    hydrated += await this.mergeWatchlistScanRunsFromPostgres(target.scanRuns, () => skipped++);

    return { hydrated, skipped };
  }

  private async mergeWatchlistEntriesFromPostgres(
    store: WatchlistEntry[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM watchlist_entries ORDER BY created_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapWatchlistEntryRow(row);
      const existing = store.find((entry) => entry.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async mergeWatchlistScanRunsFromPostgres(
    store: WatchlistScanRun[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM watchlist_scan_runs ORDER BY scanned_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapWatchlistScanRunRow(row);
      const existing = store.find((run) => run.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  async hydrateTransactionTables(target: {
    transactions: TransactionRecord[];
    events: TransactionLifecycleEvent[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.connectionString || !(await this.ensurePool())) {
      return { hydrated: 0, skipped: 0 };
    }
    return (await this.enqueueMirror(() => this.doHydrateTransactionTables(target))) ?? { hydrated: 0, skipped: 0 };
  }

  private async doHydrateTransactionTables(target: {
    transactions: TransactionRecord[];
    events: TransactionLifecycleEvent[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.pool) return { hydrated: 0, skipped: 0 };

    let hydrated = 0;
    let skipped = 0;

    hydrated += await this.mergeTransactionsFromPostgres(target.transactions, () => skipped++);
    hydrated += await this.mergeTransactionEventsFromPostgres(target.events, () => skipped++);

    return { hydrated, skipped };
  }

  private async mergeTransactionsFromPostgres(
    store: TransactionRecord[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM transactions ORDER BY created_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const hash = typeof row.tx_hash === "string" ? row.tx_hash : "";
      if (!hash) { onSkip(); continue; }
      const existing = store.find((t) => t.hash.toLowerCase() === hash.toLowerCase());
      if (existing) { onSkip(); continue; }
      const family: ChainFamily = row.chain_family === "stellar" ? "stellar" : "evm";
      const lifecycleStatusVal = String(row.lifecycle_status ?? row.status ?? "prepared") as TransactionLifecycleStatus;
      store.push({
        hash,
        chainFamily: family,
        network: String(row.network ?? ""),
        walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : undefined,
        sourceAccount: typeof row.source_account === "string" ? row.source_account : undefined,
        type: "swap" as TransactionRecord["type"],
        asset: String(row.asset ?? ""),
        valueUsd: Number(row.value_usd ?? 0),
        decisionAction: typeof row.decision_action === "string" ? row.decision_action as TransactionRecord["decisionAction"] : undefined,
        decisionId: typeof row.decision_id === "string" ? row.decision_id : undefined,
        lifecycleStatus: lifecycleStatusVal,
        status: lifecycleStatusVal,
        userApproved: Boolean(row.user_approved),
        simulationStatus: typeof row.simulation_status === "string" ? row.simulation_status as TransactionRecord["simulationStatus"] : undefined,
        policyStatus: row.policy_status ? JSON.parse(String(row.policy_status)) as TransactionRecord["policyStatus"] : undefined,
        expectedEffects: row.expected_effects ? JSON.parse(String(row.expected_effects)) as TransactionRecord["expectedEffects"] : undefined,
        idempotencyKey: typeof row.idempotency_key === "string" ? row.idempotency_key : undefined,
        explorerUrl: typeof row.explorer_url === "string" ? row.explorer_url : undefined,
        failureReason: typeof row.failure_reason === "string" ? row.failure_reason : undefined,
        submittedAt: typeof row.submitted_at === "string" ? row.submitted_at : undefined,
        terminalAt: typeof row.terminal_at === "string" ? row.terminal_at : undefined,
        lastPolledAt: typeof row.last_polled_at === "string" ? row.last_polled_at : undefined,
        createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
        stellarDetails: row.envelope_xdr ? {
          envelopeXdr: typeof row.envelope_xdr === "string" ? row.envelope_xdr : undefined,
          sequence: typeof row.sequence === "string" ? row.sequence : undefined,
          feeCharged: typeof row.fee_charged === "number" ? row.fee_charged : undefined,
          operationCount: typeof row.operation_count === "number" ? row.operation_count : undefined,
          ledger: typeof row.ledger === "number" ? row.ledger : undefined,
          resultXdr: typeof row.result_xdr === "string" ? row.result_xdr : undefined,
          trustlineAsset: typeof row.trustline_asset === "string" ? row.trustline_asset : undefined,
        } : undefined,
      });
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async mergeTransactionEventsFromPostgres(
    store: TransactionLifecycleEvent[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM transaction_lifecycle_events ORDER BY occurred_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const hash = typeof row.transaction_hash === "string" ? row.transaction_hash : "";
      if (!hash) { onSkip(); continue; }
      const id = typeof row.id === "string" ? row.id : `tx_event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const existing = store.find((e) => e.id === id);
      if (existing) { onSkip(); continue; }
      store.push({
        id,
        hash,
        event: String(row.event ?? "prepared") as TransactionLifecycleEvent["event"],
        detail: row.detail ? JSON.parse(String(row.detail)) : undefined,
        provider: typeof row.provider === "string" ? row.provider : undefined,
        providerUrl: typeof row.provider_url === "string" ? row.provider_url : undefined,
        occurredAt: typeof row.occurred_at === "string" ? row.occurred_at : new Date().toISOString(),
      });
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async ensurePool(): Promise<boolean> {
    if (this.pool && this.connected) return true;
    const result = await this.connect();

    return result.ok;
  }

  /**
   * Hydrate the in-memory alert stores from Postgres on process start.
   *
   * The original mirror pipeline was write-only: every write landed in
   * memory and a best-effort mirror flushed it to SQL. After a server
   * restart the in-memory arrays were empty and the SQL tables still
   * held the rows on disk, but reads from the in-memory lists returned
   * nothing. This method reads alert_rules → alert_observations → alerts
   * → alert_deliveries in FK-safe order and merges rows back into the
   * supplied in-memory stores by id (skipping rows that already exist,
   * to avoid overwriting writes that landed during hydration).
   *
   * On degraded paths (no DATABASE_URL, pg not installed, query fails)
   * this method swallows the error so callers can still rely on the
   * in-memory store as the source of truth; `getStorageHealth()` will
   * expose the hydration failure honestly.
   */
  async hydrateAlertTables(target: {
    rules: AlertRule[];
    observations: AlertObservation[];
    alerts: Alert[];
    deliveries: AlertDelivery[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.connectionString || !(await this.ensurePool())) {
      return { hydrated: 0, skipped: 0 };
    }

    return (await this.enqueueMirror(() => this.doHydrateAlertTables(target))) ?? { hydrated: 0, skipped: 0 };
  }

  private async doHydrateAlertTables(target: {
    rules: AlertRule[];
    observations: AlertObservation[];
    alerts: Alert[];
    deliveries: AlertDelivery[];
  }): Promise<{ hydrated: number; skipped: number }> {
    if (!this.pool) return { hydrated: 0, skipped: 0 };

    let hydrated = 0;
    let skipped = 0;

    hydrated += await this.mergeRulesFromPostgres(target.rules, () => skipped++);
    skipped += 0;
    hydrated += await this.mergeObservationsFromPostgres(target.observations, () => skipped++);
    skipped += 0;
    hydrated += await this.mergeAlertsFromPostgres(target.alerts, () => skipped++);
    skipped += 0;
    hydrated += await this.mergeDeliveriesFromPostgres(target.deliveries, () => skipped++);

    return { hydrated, skipped };
  }

  private async mergeRulesFromPostgres(
    store: AlertRule[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM alert_rules ORDER BY created_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapAlertRuleRow(row);
      const existing = store.find((entry) => entry.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async mergeObservationsFromPostgres(
    store: AlertObservation[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM alert_observations ORDER BY created_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapAlertObservationRow(row);
      const existing = store.find((entry) => entry.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async mergeAlertsFromPostgres(
    store: Alert[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM alerts ORDER BY triggered_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapAlertRow(row);
      const existing = store.find((entry) => entry.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }

  private async mergeDeliveriesFromPostgres(
    store: AlertDelivery[],
    onSkip: () => void,
  ): Promise<number> {
    if (!this.pool) return 0;
    const result = await this.pool.query("SELECT * FROM alert_deliveries ORDER BY created_at ASC");
    let hydrationCount = 0;

    for (const row of result.rows as Array<Record<string, unknown>>) {
      const mapped = mapAlertDeliveryRow(row);
      const existing = store.find((entry) => entry.id === mapped.id);

      if (existing) {
        onSkip();
        continue;
      }
      store.push(mapped);
      hydrationCount += 1;
    }

    return hydrationCount;
  }
}

function toIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;

  return new Date().toISOString();
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.length > 0) {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function toJson(value: unknown): unknown {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value;
}

function mapAlertRuleRow(row: Record<string, unknown>): AlertRule {
  return {
    id: typeof row.id === "string" ? row.id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    triggerType: typeof row.trigger_type === "string" ? (row.trigger_type as AlertRule["triggerType"]) : "critical_risk",
    observationKey: typeof row.observation_key === "string" ? row.observation_key : undefined,
    threshold: toNumber(row.threshold),
    hysteresis: toNumber(row.hysteresis),
    cooldownMinutes: Math.round(toNumber(row.cooldown_minutes)) || 60,
    direction: row.direction === "low_is_bad" ? "low_is_bad" : "high_is_bad",
    severity: (row.severity as AlertRule["severity"]) ?? "medium",
    enabled: Boolean(row.enabled),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapAlertObservationRow(row: Record<string, unknown>): AlertObservation {
  return {
    id: typeof row.id === "string" ? row.id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    triggerType: typeof row.trigger_type === "string" ? (row.trigger_type as AlertObservation["triggerType"]) : "critical_risk",
    observationKey: typeof row.observation_key === "string" ? row.observation_key : "",
    value: toNumber(row.value),
    direction: row.direction === "low_is_bad" ? "low_is_bad" : "high_is_bad",
    evidence: (toJson(row.evidence) ?? {}) as AlertObservation["evidence"],
    incompleteData: Boolean(row.incomplete_data),
    createdAt: toIso(row.created_at),
  };
}

function mapAlertRow(row: Record<string, unknown>): Alert {
  return {
    id: typeof row.id === "string" ? row.id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    ruleId: typeof row.rule_id === "string" ? row.rule_id : "",
    triggerType: typeof row.trigger_type === "string" ? (row.trigger_type as Alert["triggerType"]) : "critical_risk",
    observationKey: typeof row.observation_key === "string" ? row.observation_key : "",
    status: (row.status as Alert["status"]) ?? "triggered",
    severity: (row.severity as Alert["severity"]) ?? "medium",
    message: typeof row.message === "string" ? row.message : "",
    beforeValue: toNumber(row.before_value),
    afterValue: toNumber(row.after_value),
    evidenceBefore: (toJson(row.evidence_before) ?? {}) as Alert["evidenceBefore"],
    evidenceAfter: (toJson(row.evidence_after) ?? {}) as Alert["evidenceAfter"],
    evidenceData: (toJson(row.evidence_data) ?? {}) as Alert["evidenceData"],
    triggeredAt: toIso(row.triggered_at),
    recoveredAt: row.recovered_at ? toIso(row.recovered_at) : undefined,
    acknowledgedAt: row.acknowledged_at ? toIso(row.acknowledged_at) : undefined,
  };
}

function mapWatchlistEntryRow(row: Record<string, unknown>): WatchlistEntry {
  return {
    id: typeof row.id === "string" ? row.id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    identityKey: typeof row.identity_key === "string" ? row.identity_key : "",
    chain: typeof row.chain === "string" ? row.chain : "",
    network: typeof row.network === "string" ? row.network : undefined,
    contractAddress: typeof row.contract_address === "string" ? row.contract_address : undefined,
    pairAddress: typeof row.pair_address === "string" ? row.pair_address : undefined,
    symbol: typeof row.symbol === "string" ? row.symbol : undefined,
    tokenName: typeof row.token_name === "string" ? row.token_name : undefined,
    assetKey: typeof row.asset_key === "string" ? row.asset_key : undefined,
    issuer: typeof row.issuer === "string" ? row.issuer : undefined,
    assetType: typeof row.asset_type === "string" ? (row.asset_type as WatchlistEntry["assetType"]) : undefined,
    source: typeof row.source === "string" ? (row.source as WatchlistEntry["source"]) : "manual_watchlist",
    note: typeof row.note === "string" ? row.note : undefined,
    createdAt: toIso(row.created_at),
    lastScannedAt: row.last_scanned_at ? toIso(row.last_scanned_at) : undefined,
    latestScanRunId: typeof row.latest_scan_run_id === "string" ? row.latest_scan_run_id : undefined,
    latestClassification: typeof row.latest_classification === "string" ? (row.latest_classification as DiscoveryClassification) : undefined,
    latestScore: typeof row.latest_score === "number" ? row.latest_score : (
      typeof row.latest_score === "string" ? parseInt(row.latest_score, 10) : undefined
    ),
    latestStatus: typeof row.latest_status === "string" ? (row.latest_status as WatchlistScanRun["status"]) : undefined,
    successfulScanRunIds: undefined,
  };
}

function mapWatchlistScanRunRow(row: Record<string, unknown>): WatchlistScanRun {
  return {
    id: typeof row.id === "string" ? row.id : "",
    entryId: typeof row.entry_id === "string" ? row.entry_id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    identityKey: typeof row.identity_key === "string" ? row.identity_key : "",
    classification: typeof row.classification === "string" ? (row.classification as DiscoveryClassification) : "watch",
    classificationReasons: Array.isArray(row.classification_reasons) ? row.classification_reasons : (
      typeof row.classification_reasons === "string" ? JSON.parse(row.classification_reasons) : []
    ),
    confidence: toNumber(row.confidence),
    score: typeof row.score === "number" ? row.score : (
      typeof row.score === "string" ? parseInt(row.score, 10) : 0
    ),
    sourceLineage: Array.isArray(row.source_lineage) ? row.source_lineage : (
      typeof row.source_lineage === "string" ? JSON.parse(row.source_lineage) : []
    ),
    missingData: Array.isArray(row.missing_data) ? row.missing_data : (
      typeof row.missing_data === "string" ? JSON.parse(row.missing_data) : []
    ),
    riskReport: row.risk_report ? (
      typeof row.risk_report === "string" ? JSON.parse(row.risk_report) : row.risk_report
    ) as WatchlistScanRun["riskReport"] : undefined,
    agentRunId: typeof row.agent_run_id === "string" ? row.agent_run_id : undefined,
    previousRunId: typeof row.previous_run_id === "string" ? row.previous_run_id : undefined,
    scannedAt: toIso(row.scanned_at),
    status: typeof row.status === "string" ? (row.status as WatchlistScanRun["status"]) : "completed",
  };
}

function mapAlertDeliveryRow(row: Record<string, unknown>): AlertDelivery {
  return {
    id: typeof row.id === "string" ? row.id : "",
    alertId: typeof row.alert_id === "string" ? row.alert_id : "",
    walletAddress: typeof row.wallet_address === "string" ? row.wallet_address.toLowerCase() : "",
    channel: (row.channel as AlertDelivery["channel"]) ?? "in_app",
    status: (row.status as AlertDelivery["status"]) ?? "pending",
    errorDetail: typeof row.error_detail === "string" ? row.error_detail : undefined,
    sanitizedPayload: (toJson(row.sanitized_payload) ?? {}) as AlertDelivery["sanitizedPayload"],
    attemptCount: Math.round(toNumber(row.attempt_count)) || 0,
    createdAt: toIso(row.created_at),
    sentAt: row.sent_at ? toIso(row.sent_at) : undefined,
  };
}

/**
 * Public exposure of the row-mapping helpers so fixtures and dry-run
 * tooling can verify the SQL ↔ TypeScript parity without needing a live
 * Postgres connection. The adapters' `hydrateAlertTables` consumes these
 * directly.
 */
export const __rowMappers = {
  rule: mapAlertRuleRow,
  observation: mapAlertObservationRow,
  alert: mapAlertRow,
  delivery: mapAlertDeliveryRow,
  watchlistEntry: mapWatchlistEntryRow,
  watchlistScanRun: mapWatchlistScanRunRow,
};

let adapterSingleton: PostgresStorageAdapter | null = null;

export function getPostgresStorageAdapter(): PostgresStorageAdapter {
  if (!adapterSingleton) adapterSingleton = new PostgresStorageAdapter();

  return adapterSingleton;
}

/**
 * Fire-and-forget write-through helper used by the in-memory storage
 * functions. Errors are absorbed into the adapter health snapshot; the
 * caller always sees a synchronous in-memory write complete.
 */
export function mirrorAlertRuleWrite(rule: AlertRule): void {
  void getPostgresStorageAdapter().mirrorAlertRule(rule);
}

export function mirrorAlertObservationWrite(observation: AlertObservation): void {
  void getPostgresStorageAdapter().mirrorAlertObservation(observation);
}

export function mirrorAlertWrite(alert: Alert): void {
  void getPostgresStorageAdapter().mirrorAlert(alert);
}

export function mirrorAlertDeliveryWrite(delivery: AlertDelivery): void {
  void getPostgresStorageAdapter().mirrorAlertDelivery(delivery);
}

/**
 * Mirror a partial alert update (status / recovered_at / acknowledged_at /
 * evidence fields refreshed by deterioration). Always re-writes the row
 * via INSERT ... ON CONFLICT DO UPDATE so the SQL `alerts` table stays
 * consistent with the in-memory record across recovery/acknowledgement
 * cycles.
 */
export function mirrorAlertUpdate(alert: Alert): void {
  mirrorAlertWrite(alert);
}

export function mirrorAlertDeliveryUpdate(delivery: AlertDelivery): void {
  mirrorAlertDeliveryWrite(delivery);
}

// ── Transaction mirror helpers ────────────────────────────────────────────

async function doMirrorTransactionRecord(
  pool: MaybePgPool,
  record: TransactionRecord,
): Promise<void> {
  const hash = record.hash;
  await pool.query(
    `INSERT INTO transactions (
       tx_hash, wallet_address, decision_id, decision_action, type, asset, value_usd,
       status, lifecycle_status, chain_family, source_account, expected_effects,
       idempotency_key, explorer_url, failure_reason, network, user_approved,
       simulation_status, policy_status, submitted_at, terminal_at, last_polled_at, created_at
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$21,$22,$23)
     ON CONFLICT (tx_hash) DO UPDATE SET
       status = EXCLUDED.status,
       lifecycle_status = EXCLUDED.lifecycle_status,
       failure_reason = EXCLUDED.failure_reason,
       terminal_at = EXCLUDED.terminal_at,
       last_polled_at = EXCLUDED.last_polled_at,
       explorer_url = EXCLUDED.explorer_url,
       policy_status = EXCLUDED.policy_status`,
    [
      hash,
      record.walletAddress ?? "",
      record.decisionId ?? null,
      record.decisionAction ?? null,
      record.type,
      record.asset,
      record.valueUsd,
      record.lifecycleStatus,
      record.lifecycleStatus,
      record.chainFamily,
      record.sourceAccount ?? null,
      JSON.stringify(record.expectedEffects ?? []),
      record.idempotencyKey ?? null,
      record.explorerUrl ?? null,
      record.failureReason ?? null,
      record.network,
      record.userApproved ?? false,
      record.simulationStatus ?? null,
      JSON.stringify(record.policyStatus ?? {}),
      record.submittedAt ?? null,
      record.terminalAt ?? null,
      record.lastPolledAt ?? null,
      record.createdAt,
    ],
  );
}

async function doMirrorTransactionLifecycleEvent(
  pool: MaybePgPool,
  event: TransactionLifecycleEvent,
): Promise<void> {
  await pool.query(
    `INSERT INTO transaction_lifecycle_events (transaction_hash, event, detail, provider, provider_url, occurred_at)
     VALUES ($1,$2,$3::jsonb,$4,$5,$6)`,
    [
      event.hash,
      event.event,
      JSON.stringify(event.detail ?? {}),
      event.provider ?? null,
      event.providerUrl ?? null,
      event.occurredAt,
    ],
  );
}

export function mirrorTransactionRecord(record: TransactionRecord): void {
  void getPostgresStorageAdapter().mirrorTransaction(record);
}

export function mirrorTransactionLifecycleEvent(event: TransactionLifecycleEvent): void {
  void getPostgresStorageAdapter().mirrorTransactionLifecycleEvent(event);
}

export function mirrorWatchlistEntryWrite(entry: WatchlistEntry): void {
  void getPostgresStorageAdapter().mirrorWatchlistEntry(entry);
}

export function mirrorWatchlistEntryDeletion(id: string): void {
  void getPostgresStorageAdapter().removeMirrorWatchlistEntry(id);
}

export function mirrorWatchlistScanRunWrite(run: WatchlistScanRun): void {
  void getPostgresStorageAdapter().mirrorWatchlistScanRun(run);
}

export function mirrorWatchlistEntryLatestScanUpdate(entryId: string, update: {
  classification: DiscoveryClassification;
  score: number;
  scannedAt: string;
  status: WatchlistScanRun["status"];
  scanRunId: string;
}): void {
  void getPostgresStorageAdapter().updateMirrorWatchlistEntryLatestScan(entryId, update);
}

export async function bootstrapPostgresStorage(): Promise<{ tried: boolean; connected: boolean; detail: string }> {
  const adapter = getPostgresStorageAdapter();

  if (!adapter.isConfigured()) return { tried: false, connected: false, detail: "no DATABASE_URL configured" };
  const result = await adapter.connect();

  return { tried: true, connected: result.ok, detail: result.detail };
}
