// Applies every .sql file in /drizzle in filename order, recording what has
// already run in a `_repolens_migrations` table. No ORM required at runtime.
import { readdir, readFile } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(here, "..", "drizzle");

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Add it to .env to run migrations.");
  process.exit(1);
}

const client = new pg.Client({ connectionString });
await client.connect();

try {
  await client.query(`CREATE TABLE IF NOT EXISTS _repolens_migrations (
    id text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )`);

  const files = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql")).sort();
  for (const file of files) {
    const { rowCount } = await client.query("SELECT 1 FROM _repolens_migrations WHERE id = $1", [file]);
    if (rowCount && rowCount > 0) {
      console.log(`· ${file} (already applied)`);
      continue;
    }
    const sql = await readFile(join(migrationsDir, file), "utf8");
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO _repolens_migrations (id) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`✓ ${file}`);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
  console.log("Migrations complete.");
} finally {
  await client.end();
}
