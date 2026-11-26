/**
 * Desktop MT5 sync agent: pulls broker history through the local Python bridge
 * and writes it into the shared Supabase database, so the Vercel-hosted journal
 * always shows fresh MT5 data. Run manually or on a schedule (Task Scheduler).
 *
 *   SUPABASE_DATABASE_URL="<supabase pooler uri>" node scripts/sync-mt5-to-supabase.mjs
 *
 * Reads MT5-enabled accounts from Supabase, uses each account's saved investor
 * password (or the bridge's DPAPI credentials), and upserts trades idempotently.
 * It also pulls candle history around every trade (M5–D1) into chart_candles,
 * which powers the pinned chart snapshot on each trade page.
 */
import dotenv from "dotenv";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { Client } from "pg";

dotenv.config({ path: ".env.local" });
dotenv.config();

const TARGET = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL;
if (!TARGET) throw new Error("Set SUPABASE_DATABASE_URL (or DATABASE_URL) to the Supabase pooler URI.");
if (/@(localhost|127\.0\.0\.1)(:|\/)/.test(TARGET))
  throw new Error("TARGET looks local. The desktop agent should write to Supabase, not the local DB.");

const appData = process.env.LOCALAPPDATA ?? path.join(os.homedir(), "AppData", "Local");
const python = process.env.MT5_PYTHON ?? path.join(appData, "ForexJournal", "bridge-venv", "Scripts", "python.exe");
const script =
  process.env.MT5_BRIDGE_SCRIPT ??
  path.resolve(process.cwd(), "..", "obsidian-forex-journal", ".obsidian", "plugins", "forex-journal", "bridge", "mt5_bridge.py");
const terminal = process.env.MT5_TERMINAL ?? path.join(appData, "ForexJournal", "MT5-Terminal", "terminal64.exe");
for (const p of [python, script, terminal]) if (!existsSync(p)) throw new Error(`Missing bridge component: ${p}`);

function runBridge(request) {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], { windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("bridge timed out")); }, 150_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(e); });
    child.on("close", () => {
      clearTimeout(timer);
      if (!out.trim()) return reject(new Error(err.trim() || "bridge returned no output"));
      try { resolve(JSON.parse(out.trim())); } catch { reject(new Error("bridge returned invalid JSON")); }
    });
    child.stdin.on("error", () => {});
    child.stdin.write(JSON.stringify(request));
    child.stdin.end();
  });
}

const round = (v, d) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0);
const brokerDate = (v) => { const d = v ? new Date(v) : new Date(NaN); return Number.isNaN(d.getTime()) ? new Date() : d; };
const sumVol = (ds) => ds.reduce((s, d) => s + (Number.isFinite(d.volume) ? d.volume : 0), 0);
function wPrice(ds) {
  let vol = 0, tot = 0;
  for (const d of ds) { if (!Number.isFinite(d.volume) || d.volume <= 0) continue; vol += d.volume; tot += (d.price ?? 0) * d.volume; }
  if (vol > 0) return round(tot / vol, 5);
  const f = ds.find((d) => Number.isFinite(d.price) && d.price > 0);
  return f ? round(f.price, 5) : null;
}
const earliest = (ds, fb) => { let b = Infinity; for (const d of ds) { const t = brokerDate(d.time).getTime(); if (t < b) b = t; } return Number.isFinite(b) ? new Date(b) : fb; };
const latest = (ds, fb) => { let b = 0; for (const d of ds) { const t = brokerDate(d.time).getTime(); if (t > b) b = t; } return b > 0 ? new Date(b) : fb; };
const net = (ds) => ds.reduce((s, d) => s + (d.profit ?? 0) + (d.commission ?? 0) + (d.swap ?? 0) + (d.fee ?? 0), 0);
const fees = (ds) => Math.abs(ds.reduce((s, d) => s + (d.commission ?? 0) + (d.fee ?? 0), 0));

function groupDeals(snapshot, scale) {
  const open = new Set((snapshot.positions ?? []).map((p) => p.identifier || p.ticket).filter(Boolean));
  const byPos = new Map();
  for (const d of snapshot.deals ?? []) {
    if (!d.position_id || (d.type !== 0 && d.type !== 1) || open.has(d.position_id)) continue;
    const list = byPos.get(d.position_id) ?? [];
    list.push(d);
    byPos.set(d.position_id, list);
  }
  const rows = [];
  for (const [pid, legs] of byPos) {
    const entries = legs.filter((d) => d.entry === 0);
    const exits = legs.filter((d) => d.entry === 1 || d.entry === 3);
    if (!exits.length) continue;
    const base = entries[0] ?? legs[0];
    const symbol = (base.symbol || exits[0].symbol || "").trim().toUpperCase();
    if (!symbol) continue;
    const openedAt = earliest(entries.length ? entries : [base], brokerDate(base.time));
    const closedAt = latest(exits, openedAt);
    rows.push({
      externalId: `mt5:${pid}`, symbol, direction: base.type === 1 ? "short" : "long",
      openedAt, closedAt: closedAt.getTime() > openedAt.getTime() ? closedAt : openedAt,
      entryPrice: wPrice(entries.length ? entries : [base]), exitPrice: wPrice(exits),
      size: round(Math.max(sumVol(entries), sumVol(exits), base.volume ?? 0), 2),
      pnl: round(net(legs) * scale, 2), fees: round(fees(legs) * scale, 2),
    });
  }
  for (const p of snapshot.positions ?? []) {
    const id = p.identifier || p.ticket;
    const symbol = (p.symbol || "").trim().toUpperCase();
    if (!id || !symbol) continue;
    rows.push({
      externalId: `mt5:${id}`, symbol, direction: p.type === 1 ? "short" : "long",
      openedAt: brokerDate(p.time), closedAt: null,
      entryPrice: Number.isFinite(p.price_open) ? round(p.price_open, 5) : null, exitPrice: null,
      size: Number.isFinite(p.volume) ? round(p.volume, 2) : null,
      pnl: round((p.profit ?? 0) * scale, 2), fees: 0,
    });
  }
  return rows.sort((a, b) => a.openedAt - b.openedAt);
}

const db = new Client({ connectionString: TARGET, ssl: { rejectUnauthorized: false } });
await db.connect();

const { rows: accounts } = await db.query(
  `select id, name, user_id, mt5_login, mt5_server, mt5_investor_password from accounts where mt5_enabled and mt5_login is not null`,
);
if (accounts.length === 0) console.log("no MT5-enabled accounts on Supabase");

/** First working MT5 session of this run — reused for the chart bar requests. */
let chartConnection = null;

for (const acc of accounts) {
  try {
    const connection = {
      action: "sync", login: acc.mt5_login, server: acc.mt5_server,
      terminal_path: terminal, portable: true,
      ...(acc.mt5_investor_password ? { password: acc.mt5_investor_password } : {}),
    };
    const res = await runBridge(connection);
    if (!res.ok) throw new Error(res.error || "bridge sync failed");
    if (!chartConnection) chartConnection = { ...connection };
    const scale = (res.account?.currency ?? "USD").trim().toUpperCase() === "USC" ? 0.01 : 1;
    const rows = groupDeals(res, scale);

    await db.query(`delete from trades where account_id = $1 and external_id like 'demo:%'`, [acc.id]);
    const existing = await db.query(`select id, external_id from trades where account_id = $1`, [acc.id]);
    const mine = new Map(existing.rows.filter((r) => r.external_id).map((r) => [r.external_id, r.id]));
    let imported = 0, updated = 0;
    for (const r of rows) {
      const params = [r.symbol, r.direction, r.entryPrice, r.exitPrice, r.size, r.pnl, r.fees, r.openedAt, r.closedAt, "mt5", r.externalId];
      const id = mine.get(r.externalId);
      if (id) {
        // user_id is refreshed too, so rows written before the first signup
        // claim are adopted by the owning account's user. Never overwrite an
        // already-owned row with NULL: if the claim commits while this sync is
        // in flight, the stale read must not un-claim it (it would self-heal
        // only after the next run).
        await db.query(
          `update trades set symbol=$1,direction=$2,entry_price=$3,exit_price=$4,size=$5,pnl=$6,fees=$7,opened_at=$8,closed_at=$9,source=$10,external_id=$11,user_id=case when $13::uuid is not null then $13 else user_id end where id=$12`,
          [...params, id, acc.user_id],
        );
        updated++;
      } else {
        await db.query(
          `insert into trades (symbol,direction,entry_price,exit_price,size,pnl,fees,opened_at,closed_at,source,external_id,account_id,user_id) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
          [...params, acc.id, acc.user_id],
        );
        imported++;
      }
    }
    await db.query(
      `update accounts set mt5_mode='live', mt5_status='connected', mt5_last_error=null, mt5_last_sync_at=now(), mt5_last_imported=$1 where id=$2`,
      [imported, acc.id],
    );
    console.log(`${acc.name}: ok — ${imported} new, ${updated} refreshed (${rows.length} total)`);
  } catch (e) {
    await db.query(`update accounts set mt5_status='error', mt5_last_error=$1, mt5_last_sync_at=now() where id=$2`, [String(e.message).slice(0, 300), acc.id]);
    console.error(`${acc.name}: FAILED — ${e.message}`);
  }
}

/* ------------------------------ chart candles ------------------------------ */

/**
 * Context kept around a trade per timeframe, in milliseconds. `minSpan` pads
 * very short trades so the chart never renders as a sliver.
 */
const CHART_TFS = [
  { tf: "M5", before: 3 * 36e5, after: 6 * 36e5, minSpan: 8 * 36e5 },
  { tf: "M15", before: 8 * 36e5, after: 16 * 36e5, minSpan: 32 * 36e5 },
  { tf: "H1", before: 24 * 36e5, after: 48 * 36e5, minSpan: 96 * 36e5 },
  { tf: "H4", before: 72 * 36e5, after: 120 * 36e5, minSpan: 288 * 36e5 },
  { tf: "D1", before: 480 * 36e5, after: 240 * 36e5, minSpan: 960 * 36e5 },
];

/**
 * MT5 bar times are epoch seconds whose UTC breakdown is the broker's wall
 * clock, while trades are stored by parsing that same wall clock as local
 * time. Pushing bars through the identical conversion keeps candles and entry
 * markers in one instant space, so they line up in any timezone.
 */
const brokerInstant = (epochSeconds) => {
  const d = new Date(epochSeconds * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  return new Date(
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`,
  );
};

/** Inverse of brokerInstant: an instant's local wall clock is the broker's. */
const wallClock = (ms) => {
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** Journal symbol -> this broker's name when they differ (e.g. FTMO vs Vantage). */
const SYMBOL_ALIASES = { US100: "NAS100", US500: "SP500" };

function chartRange(openedMs, closedMs, spec) {
  const open = openedMs;
  // An open trade keeps accruing bars, so its window follows the clock.
  const close = Math.max(closedMs ?? Date.now(), open);
  let from = open - spec.before;
  let to = close + spec.after;
  if (to - from < spec.minSpan) {
    const pad = (spec.minSpan - (to - from)) / 2;
    from -= pad;
    to += pad;
  }
  return { from: Math.floor(from / 1000), to: Math.ceil(to / 1000) };
}

async function syncCharts() {
  if (!chartConnection) {
    console.log("charts: skipped (no working MT5 connection this run)");
    return;
  }
  const { rows: trades } = await db.query(
    `select t.id, t.symbol, t.opened_at, t.closed_at, t.user_id from trades t order by t.id`,
  );
  if (trades.length === 0) {
    console.log("charts: skipped (no trades)");
    return;
  }
  const { rows: have } = await db.query(`select distinct trade_id, timeframe from chart_candles`);
  const seen = new Set(have.map((r) => `${r.trade_id}:${r.timeframe}`));

  const requests = [];
  const windows = new Map();
  for (const t of trades) {
    const openedMs = new Date(t.opened_at).getTime();
    const closedMs = t.closed_at ? new Date(t.closed_at).getTime() : null;
    for (const spec of CHART_TFS) {
      const key = `${t.id}:${spec.tf}`;
      // Closed trades are immutable: only fetch what is missing. Open trades
      // are re-fetched so their window keeps extending to the current bar.
      if (closedMs !== null && seen.has(key)) continue;
      const range = chartRange(openedMs, closedMs, spec);
      windows.set(key, range);
      requests.push({
        key, symbol: SYMBOL_ALIASES[t.symbol] ?? t.symbol, timeframe: spec.tf,
        from: wallClock(range.from * 1000), to: wallClock(range.to * 1000),
      });
    }
  }
  if (requests.length === 0) {
    console.log("charts: up to date");
    return;
  }

  const users = new Map(trades.map((t) => [t.id, t.user_id]));
  let fetched = 0, stored = 0, failed = 0;
  for (let i = 0; i < requests.length; i += 250) {
    const chunk = requests.slice(i, i + 250);
    const res = await runBridge({ ...chartConnection, action: "bars", requests: chunk });
    if (!res.ok) throw new Error(res.error || "bridge bars failed");
    for (const req of chunk) {
      const result = res.results?.[req.key];
      const tradeId = Number(req.key.split(":")[0]);
      if (!result?.ok) {
        failed++;
        console.error(`  chart ${req.symbol} ${req.timeframe} (trade ${tradeId}): ${result?.error ?? "no result"}`);
        continue;
      }
      const candles = result.candles ?? [];
      if (candles.length === 0) continue;
      const range = windows.get(req.key);
      const userId = users.get(tradeId) ?? null;
      // Upsert first and trim afterwards, so a symbol or time edit never
      // leaves the chart empty while the sync is running.
      for (let c = 0; c < candles.length; c += 500) {
        const batch = candles.slice(c, c + 500);
        const values = [];
        const params = [];
        batch.forEach((bar, j) => {
          const b = j * 9;
          values.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`);
          params.push(
            tradeId, userId, result.symbol, req.timeframe,
            Math.floor(brokerInstant(bar.time).getTime() / 1000),
            bar.open, bar.high, bar.low, bar.close,
          );
        });
        await db.query(
          `insert into chart_candles (trade_id, user_id, symbol, timeframe, time, open, high, low, close)
           values ${values.join(",")}
           on conflict (trade_id, timeframe, time)
           do update set symbol = excluded.symbol, open = excluded.open, high = excluded.high,
                          low = excluded.low, close = excluded.close,
                          user_id = coalesce(chart_candles.user_id, excluded.user_id)`,
          params,
        );
      }
      await db.query(
        `delete from chart_candles where trade_id = $1 and timeframe = $2 and (time < $3 or time > $4)`,
        [tradeId, req.timeframe, range.from, range.to],
      );
      fetched++;
      stored += candles.length;
    }
  }
  console.log(`charts: ${fetched} ranges stored, ${stored} candles${failed ? `, ${failed} failed` : ""}`);
}

try {
  await syncCharts();
} catch (e) {
  console.error(`charts: FAILED — ${e.message}`);
}

await db.end();
