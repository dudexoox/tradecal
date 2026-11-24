/**
 * One-time data migration: local PostgreSQL -> Supabase.
 *
 * Prereq: push the schema first, e.g.
 *   DATABASE_URL="<supabase pooler uri>" npx drizzle-kit push
 *
 * Then run:
 *   SUPABASE_DATABASE_URL="<supabase pooler uri>" node scripts/migrate-to-supabase.mjs
 *
 * Copies accounts, playbooks, strategies, trades and journal entries (preserving
 * ids and foreign keys), resets identity sequences, and creates the uploads
 * Storage bucket (copying any local upload files into it).
 */
import dotenv from "dotenv";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const SOURCE = process.env.LOCAL_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:5432/app_db";
const TARGET = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;

if (!TARGET) throw new Error("Set SUPABASE_DATABASE_URL (or DATABASE_URL) to the Supabase pooler URI.");
if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(TARGET))
  throw new Error("TARGET looks like a local database. Point SUPABASE_DATABASE_URL at Supabase.");

const sslFor = (url) => (/@(localhost|127\.0\.0\.1)(:|\/)/.test(url) ? undefined : { rejectUnauthorized: false });

const src = new Client({ connectionString: SOURCE, ssl: sslFor(SOURCE) });
const dst = new Client({ connectionString: TARGET, ssl: sslFor(TARGET) });
await src.connect();
await dst.connect();

const TABLES = ["accounts", "playbooks", "strategies", "trades", "journal_entries"];

for (const t of TABLES) {
  const present = await dst.query("select to_regclass($1) as r", [`public.${t}`]);
  if (!present.rows[0].r)
    throw new Error(`Table ${t} missing on Supabase. Run: DATABASE_URL="<supabase uri>" npx drizzle-kit push`);
}

for (const t of TABLES) {
  const { rows, fields } = await src.query(`select * from ${t} order by id`);
  if (rows.length === 0) {
    console.log(`${t}: 0 rows`);
    continue;
  }
  const cols = fields.map((f) => f.name);
  const placeholders = cols.map((_, i) => `$${i + 1}`).join(", ");
  const updates = cols.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  for (const row of rows) {
    await dst.query(
      `insert into ${t} (${cols.join(", ")}) values (${placeholders}) on conflict (id) do update set ${updates}`,
      cols.map((c) => row[c]),
    );
  }
  await dst.query(`select setval(pg_get_serial_sequence('${t}', 'id'), coalesce((select max(id) from ${t}), 1))`);
  console.log(`${t}: ${rows.length} rows copied`);
}

/* ---------------------------------------------------- uploads -> Storage */
const supaUrl = (process.env.SUPABASE_URL ?? "").replace(/\/+$/, "");
const supaKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const bucket = process.env.SUPABASE_UPLOAD_BUCKET ?? "journal-uploads";

if (supaUrl && supaKey) {
  const created = await fetch(`${supaUrl}/storage/v1/bucket`, {
    method: "POST",
    headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ id: bucket, name: bucket, public: true }),
  });
  console.log(`storage bucket ${bucket}: ${created.status === 200 || created.status === 201 ? "created" : `status ${created.status} (may already exist)`}`);

  const dir = path.join(process.cwd(), "data", "uploads");
  if (existsSync(dir)) {
    const files = readdirSync(dir);
    for (const name of files) {
      const bytes = readFileSync(path.join(dir, name));
      const ext = name.split(".").pop()?.toLowerCase();
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      const up = await fetch(`${supaUrl}/storage/v1/object/${bucket}/${name}`, {
        method: "POST",
        headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}`, "Content-Type": mime, "x-upsert": "true" },
        body: new Uint8Array(bytes),
      });
      console.log(`upload ${name}: ${up.ok ? "ok" : `status ${up.status}`}`);
    }
  }
} else {
  console.log("storage: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipped bucket + upload copy");
}

await src.end();
await dst.end();
console.log("migration complete");
