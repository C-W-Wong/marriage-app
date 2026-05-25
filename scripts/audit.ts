import 'dotenv/config';
import pg from 'pg';

(async () => {
  const c = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const r = await c.query<{ group_id: string; cnt: number }>(
    'select group_id, count(*)::int as cnt from photos group by group_id order by group_id'
  );
  console.table(r.rows);
  await c.end();
})();
