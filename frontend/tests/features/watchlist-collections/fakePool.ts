/**
 * A statement-recognizing stand-in for a PostgreSQL pool.
 *
 * This is **not** a SQL engine. It recognizes exactly the statements
 * `postgresRepository.ts` issues and applies them to in-memory tables. Its
 * purpose is to let the conformance suite run the same cases against both
 * repositories, so a behavioural divergence — an ordering, a duplicate rule, a
 * transaction boundary — is caught in CI rather than in production.
 *
 * What it deliberately *does* model, because the repository depends on it:
 *
 * - `BEGIN` / `COMMIT` / `ROLLBACK`, with a real snapshot restored on rollback,
 *   so a half-applied reorder would fail a test.
 * - The two uniqueness indexes, which reject a duplicate the way the database
 *   would.
 * - `rowCount`, which the repository returns to its callers.
 *
 * What it cannot verify is whether the SQL is valid PostgreSQL. That is what
 * applying the migration to a real database is for; see the feature doc.
 */
type Row = Record<string, unknown>;

const TABLES = [
  "watchlist_collections",
  "watchlist_collection_tags",
  "watchlist_collection_memberships",
  "watchlist_saved_views",
] as const;

type TableName = (typeof TABLES)[number];

export class UniqueViolation extends Error {
  constructor(index: string) {
    super(`duplicate key value violates unique constraint "${index}"`);
    this.name = "UniqueViolation";
  }
}

export function createFakePool() {
  let tables: Record<TableName, Row[]> = {
    watchlist_collections: [],
    watchlist_collection_tags: [],
    watchlist_collection_memberships: [],
    watchlist_saved_views: [],
  };

  let savepoint: typeof tables | null = null;
  const statements: string[] = [];

  function snapshot(): typeof tables {
    return JSON.parse(JSON.stringify(tables)) as typeof tables;
  }

  function tableOf(text: string): TableName {
    const match = TABLES.find((table) => text.includes(table));

    if (!match) throw new Error(`The fake pool does not recognize a table in: ${text}`);

    return match;
  }

  function assertUnique(table: TableName, row: Row): void {
    if (table === "watchlist_collection_tags") {
      const clash = tables[table].some(
        (existing) =>
          existing.wallet_address === row.wallet_address &&
          existing.network === row.network &&
          existing.normalized === row.normalized,
      );

      if (clash) throw new UniqueViolation("watchlist_collection_tags_owner_normalized_idx");
    }

    if (table === "watchlist_collection_memberships") {
      const clash = tables[table].some(
        (existing) =>
          existing.wallet_address === row.wallet_address &&
          existing.network === row.network &&
          existing.collection_id === row.collection_id &&
          existing.watchlist_entry_id === row.watchlist_entry_id,
      );

      if (clash) throw new UniqueViolation("watchlist_collection_memberships_unique_idx");
    }

    if (tables[table].some((existing) => existing.id === row.id)) {
      throw new UniqueViolation(`${table}_pkey`);
    }
  }

  return {
    statements: () => [...statements],
    rows: (table: TableName) => JSON.parse(JSON.stringify(tables[table])) as Row[],

    async query(text: string, values: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
      const normalized = text.replace(/\s+/g, " ").trim();
      statements.push(normalized);

      if (normalized === "BEGIN") {
        savepoint = snapshot();
        return { rows: [], rowCount: 0 };
      }

      if (normalized === "COMMIT") {
        savepoint = null;
        return { rows: [], rowCount: 0 };
      }

      if (normalized === "ROLLBACK") {
        if (savepoint) tables = savepoint;
        savepoint = null;
        return { rows: [], rowCount: 0 };
      }

      const table = tableOf(normalized);

      if (normalized.startsWith("SELECT * FROM")) {
        if (normalized.includes("WHERE id = $1")) {
          const found = tables[table].filter(
            (row) => row.id === values[0] && row.wallet_address === values[1] && row.network === values[2],
          );

          return { rows: JSON.parse(JSON.stringify(found)), rowCount: found.length };
        }

        const found = tables[table]
          .filter((row) => row.wallet_address === values[0] && row.network === values[1])
          .sort((left, right) => {
            if (normalized.includes("ORDER BY position")) {
              const byPosition = Number(left.position ?? 0) - Number(right.position ?? 0);

              if (byPosition !== 0) return byPosition;
            }

            if (normalized.includes("ORDER BY name")) {
              const byName = String(left.name).localeCompare(String(right.name));

              if (byName !== 0) return byName;
            }

            const leftAt = String(left.created_at ?? left.added_at ?? "");
            const rightAt = String(right.created_at ?? right.added_at ?? "");

            return leftAt.localeCompare(rightAt) || String(left.id).localeCompare(String(right.id));
          });

        return { rows: JSON.parse(JSON.stringify(found)), rowCount: found.length };
      }

      if (normalized.startsWith("INSERT INTO watchlist_collections")) {
        const row = {
          id: values[0],
          wallet_address: values[1],
          network: values[2],
          name: values[3],
          description: values[4],
          position: values[5],
          created_at: values[6],
          updated_at: values[7],
          revision: values[8],
        };

        assertUnique(table, row);
        tables.watchlist_collections.push(row);

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO watchlist_collection_tags")) {
        const row = {
          id: values[0],
          wallet_address: values[1],
          network: values[2],
          label: values[3],
          normalized: values[4],
          created_at: values[5],
        };

        assertUnique(table, row);
        tables.watchlist_collection_tags.push(row);

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO watchlist_collection_memberships")) {
        const row = {
          id: values[0],
          wallet_address: values[1],
          network: values[2],
          collection_id: values[3],
          watchlist_entry_id: values[4],
          position: values[5],
          tag_ids: values[6],
          added_at: values[7],
        };

        assertUnique(table, row);
        tables.watchlist_collection_memberships.push(row);

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("INSERT INTO watchlist_saved_views")) {
        const row = {
          id: values[0],
          wallet_address: values[1],
          network: values[2],
          name: values[3],
          collection_ids: values[4],
          tag_ids: values[5],
          search: values[6],
          sort: values[7],
          created_at: values[8],
          updated_at: values[9],
          revision: values[10],
        };

        const existing = tables.watchlist_saved_views.find(
          (candidate) => candidate.id === row.id && candidate.wallet_address === row.wallet_address && candidate.network === row.network,
        );

        // ON CONFLICT (id) DO UPDATE … WHERE owner matches.
        if (existing) {
          Object.assign(existing, {
            name: row.name,
            collection_ids: row.collection_ids,
            tag_ids: row.tag_ids,
            search: row.search,
            sort: row.sort,
            updated_at: row.updated_at,
            revision: row.revision,
          });

          return { rows: [], rowCount: 1 };
        }

        if (tables.watchlist_saved_views.some((candidate) => candidate.id === row.id)) {
          // Same id, different owner: the conflict target matches but the
          // WHERE clause does not, so nothing is written.
          return { rows: [], rowCount: 0 };
        }

        tables.watchlist_saved_views.push(row);

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE watchlist_collections SET name")) {
        const row = tables.watchlist_collections.find(
          (candidate) => candidate.id === values[0] && candidate.wallet_address === values[1] && candidate.network === values[2],
        );

        if (!row) return { rows: [], rowCount: 0 };

        Object.assign(row, {
          name: values[3],
          description: values[4],
          position: values[5],
          updated_at: values[6],
          revision: values[7],
        });

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE watchlist_collections SET updated_at")) {
        const row = tables.watchlist_collections.find(
          (candidate) => candidate.id === values[0] && candidate.wallet_address === values[1] && candidate.network === values[2],
        );

        if (!row) return { rows: [], rowCount: 0 };

        Object.assign(row, { updated_at: values[3], revision: Number(row.revision) + 1 });

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("UPDATE watchlist_collection_memberships SET tag_ids")) {
        const affected = tables.watchlist_collection_memberships.filter(
          (row) =>
            row.wallet_address === values[1] &&
            row.network === values[2] &&
            Array.isArray(row.tag_ids) &&
            (row.tag_ids as string[]).includes(values[0] as string),
        );

        for (const row of affected) {
          row.tag_ids = (row.tag_ids as string[]).filter((tagId) => tagId !== values[0]);
        }

        return { rows: [], rowCount: affected.length };
      }

      if (normalized.startsWith("UPDATE watchlist_collection_memberships SET position")) {
        const row = tables.watchlist_collection_memberships.find(
          (candidate) =>
            candidate.id === values[0] &&
            candidate.wallet_address === values[1] &&
            candidate.network === values[2] &&
            candidate.collection_id === values[3],
        );

        if (!row) return { rows: [], rowCount: 0 };

        row.position = values[4];

        return { rows: [], rowCount: 1 };
      }

      if (normalized.startsWith("DELETE FROM")) {
        const before = tables[table].length;

        if (normalized.includes("WHERE id = $1")) {
          tables[table] = tables[table].filter(
            (row) => !(row.id === values[0] && row.wallet_address === values[1] && row.network === values[2]),
          );
        } else if (normalized.includes("WHERE collection_id = $1")) {
          tables[table] = tables[table].filter(
            (row) => !(row.collection_id === values[0] && row.wallet_address === values[1] && row.network === values[2]),
          );
        } else {
          tables[table] = tables[table].filter((row) => !(row.wallet_address === values[0] && row.network === values[1]));
        }

        return { rows: [], rowCount: before - tables[table].length };
      }

      throw new Error(`The fake pool does not recognize: ${normalized}`);
    },
  };
}
