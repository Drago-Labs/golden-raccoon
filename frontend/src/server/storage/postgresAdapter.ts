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

  private async ensurePool(): Promise<boolean> {
    if (this.pool && this.connected) return true;
    const result = await this.connect();

    return result.ok;
  }
}

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

export async function bootstrapPostgresStorage(): Promise<{ tried: boolean; connected: boolean; detail: string }> {
  const adapter = getPostgresStorageAdapter();

  if (!adapter.isConfigured()) return { tried: false, connected: false, detail: "no DATABASE_URL configured" };
  const result = await adapter.connect();

  return { tried: true, connected: result.ok, detail: result.detail };
}
