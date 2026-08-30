import { query } from "./db";

export type TableShape = {
  table: string;
  /** Primary key columns in *key* order, which need not match column order. */
  primaryKey: string[];
};

/**
 * Every table in `public` with its primary key columns, ordered by their
 * position in the key rather than their position in the table.
 *
 * That distinction is the whole point: a tool that reads key columns in column
 * order rather than key order addresses rows wrongly on a composite key, and
 * the two only differ if a table is deliberately built that way.
 *
 * Names only — no row data is read.
 */
export async function tableShapes(): Promise<TableShape[]> {
  const rows = await query<{ table_name: string; pk: string[] | null }>(
    `select c.relname as table_name,
            (select array_agg(a.attname order by k.ord)
               from unnest(i.indkey) with ordinality k(attnum, ord)
               join pg_attribute a
                 on a.attrelid = c.oid and a.attnum = k.attnum) as pk
       from pg_class c
       left join pg_index i on i.indrelid = c.oid and i.indisprimary
      where c.relkind = 'r'
        and c.relnamespace = 'public'::regnamespace
      order by c.relname`,
  );

  return rows.map((r) => ({ table: r.table_name, primaryKey: r.pk ?? [] }));
}
