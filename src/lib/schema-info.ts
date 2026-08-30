import { query } from "./db";

export type TableShape = {
  table: string;
  /** Primary key columns in *key* order, which need not match column order. */
  primaryKey: string[];
  rows: number;
};

/** Fixture tables only — synthetic QA data, safe to echo. */
const FIXTURE_TABLES = ["order_items", "order_items_legacy", "notes"] as const;

/**
 * Every table in `public` with its primary key columns and row count.
 *
 * Key columns are ordered by their position in the key, not their position in
 * the table. That distinction is the point: a tool reading key columns in
 * column order addresses rows wrongly on a composite key, and the two only
 * differ if a table is deliberately built that way.
 *
 * Cast to text[] because array_agg over attname yields name[], which
 * node-postgres has no parser for and would return as a raw array literal.
 */
export async function tableShapes(): Promise<TableShape[]> {
  const tables = await query<{ table_name: string; pk: string[] | null }>(
    `select c.relname as table_name,
            (select array_agg(a.attname order by k.ord)
               from unnest(i.indkey) with ordinality k(attnum, ord)
               join pg_attribute a
                 on a.attrelid = c.oid and a.attnum = k.attnum)::text[] as pk
       from pg_class c
       left join pg_index i on i.indrelid = c.oid and i.indisprimary
      where c.relkind = 'r'
        and c.relnamespace = 'public'::regnamespace
      order by c.relname`,
  );

  // Counted one table at a time because a table name cannot be a bind
  // parameter. The names come from pg_class rather than from input, so there
  // is nothing user-controlled to inject.
  return Promise.all(
    tables.map(async (t) => {
      const counted = await query<{ n: string }>(
        `select count(*)::text as n from "${t.table_name}"`,
      );
      return {
        table: t.table_name,
        primaryKey: t.pk ?? [],
        rows: Number(counted[0]?.n ?? 0),
      };
    }),
  );
}

/**
 * Contents of the QA fixture tables, so an edit made in the console can be
 * checked against what Postgres actually holds.
 *
 * Restricted to the three fixture tables, which contain only synthetic test
 * data — application tables are never read.
 */
export async function fixtureRows(): Promise<Record<string, unknown[]>> {
  const out: Record<string, unknown[]> = {};
  for (const table of FIXTURE_TABLES) {
    out[table] = await query(`select * from "${table}" limit 50`).catch(() => []);
  }
  return out;
}
