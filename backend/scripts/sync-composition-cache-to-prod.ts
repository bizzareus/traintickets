/**
 * One-off: copy train_composition_cache rows from the LOCAL DB (DATABASE_URL in
 * backend/.env) into the PROD DB (PROD_DATABASE_URL), upserting by train_number.
 * Existing prod rows are refreshed; missing ones are inserted. Run after a local
 * backfill to publish the cached compositions to prod.
 *
 * Usage (from backend/):
 *   PROD_DATABASE_URL=$(railway variables --service backend --environment production --kv \
 *     | grep '^DATABASE_URL=' | cut -d= -f2-) \
 *   npx tsx scripts/sync-composition-cache-to-prod.ts
 *
 *   --dry   report counts only, write nothing
 */
import 'dotenv/config';
import { Pool } from 'pg';

const localUrl = process.env.DATABASE_URL;
const prodUrl = process.env.PROD_DATABASE_URL;
const dry = process.argv.includes('--dry');

if (!prodUrl) {
  console.error('PROD_DATABASE_URL is not set.');
  process.exit(1);
}

const local = new Pool({ connectionString: localUrl });
const prod = new Pool({
  connectionString: prodUrl,
  ssl: { rejectUnauthorized: false },
});

const BATCH = 100;

async function main() {
  const { rows } = await local.query<{ train_number: string; data: unknown }>(
    'SELECT train_number, data FROM train_composition_cache ORDER BY train_number',
  );
  const before = await prod.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM train_composition_cache',
  );
  console.log(
    `local rows: ${rows.length} | prod rows before: ${before.rows[0].count}${dry ? ' | DRY RUN' : ''}`,
  );
  if (dry) {
    await local.end();
    await prod.end();
    return;
  }

  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk = rows.slice(i, i + BATCH);
    const params: unknown[] = [];
    const tuples = chunk.map((r, j) => {
      const b = j * 2;
      const dataStr =
        typeof r.data === 'string' ? r.data : JSON.stringify(r.data);
      params.push(r.train_number, dataStr);
      return `($${b + 1}, $${b + 2}::jsonb, now())`;
    });
    await prod.query(
      `INSERT INTO train_composition_cache (train_number, data, updated_at)
       VALUES ${tuples.join(',')}
       ON CONFLICT (train_number)
       DO UPDATE SET data = EXCLUDED.data, updated_at = now()`,
      params,
    );
    done += chunk.length;
    console.log(`upserted ${done}/${rows.length}`);
  }

  const after = await prod.query<{ count: string }>(
    'SELECT count(*)::int AS count FROM train_composition_cache',
  );
  console.log(`Done. prod rows after: ${after.rows[0].count}`);
  await local.end();
  await prod.end();
}

main().catch(async (e) => {
  console.error(e);
  await local.end().catch(() => {});
  await prod.end().catch(() => {});
  process.exit(1);
});
