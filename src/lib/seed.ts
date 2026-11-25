import { db } from "@/db";
import { accounts, journalEntries, playbooks, strategies, trades, type NewPlaybook, type NewStrategy, type NewTrade } from "@/db/schema";
import { eq, sql } from "drizzle-orm";

type Template = {
  daysAgo: number;
  open: string; // HH:mm
  durMin: number;
  symbol: string;
  direction: "long" | "short";
  entry: number;
  exit: number;
  size: number;
  pnl: number;
  fees: number;
  setup: string;
  rating: number;
  notes?: string;
};

const TEMPLATES: Template[] = [
  { daysAgo: 34, open: "08:15", durMin: 95, symbol: "EURUSD", direction: "long", entry: 1.0812, exit: 1.0854, size: 1.0, pnl: 420, fees: 7, setup: "Breakout", rating: 4, notes: "London open breakout above Asian range. Clean follow-through." },
  { daysAgo: 33, open: "09:40", durMin: 50, symbol: "GBPUSD", direction: "short", entry: 1.2731, exit: 1.2762, size: 1.0, pnl: -310, fees: 7, setup: "Pullback", rating: 2, notes: "Entered too early, no confirmation candle." },
  { daysAgo: 31, open: "14:30", durMin: 140, symbol: "XAUUSD", direction: "long", entry: 2318.4, exit: 2336.0, size: 0.5, pnl: 880, fees: 9, setup: "Reversal", rating: 5, notes: "NY session sweep of lows, strong reclaim." },
  { daysAgo: 30, open: "15:35", durMin: 70, symbol: "US100", direction: "long", entry: 18122, exit: 18187, size: 2, pnl: 650, fees: 6, setup: "Breakout", rating: 4 },
  { daysAgo: 28, open: "07:50", durMin: 45, symbol: "USDJPY", direction: "short", entry: 151.42, exit: 151.84, size: 1.0, pnl: -275, fees: 7, setup: "Range", rating: 3 },
  { daysAgo: 27, open: "10:10", durMin: 30, symbol: "EURUSD", direction: "long", entry: 1.0795, exit: 1.0756, size: 1.0, pnl: -390, fees: 7, setup: "Pullback", rating: 2, notes: "Chased after missing the first entry. Revenge-ish." },
  { daysAgo: 26, open: "14:45", durMin: 160, symbol: "XAUUSD", direction: "short", entry: 2351.2, exit: 2328.8, size: 0.5, pnl: 1120, fees: 9, setup: "Reversal", rating: 5, notes: "Textbook failed breakout at the highs." },
  { daysAgo: 24, open: "08:05", durMin: 120, symbol: "GBPJPY", direction: "long", entry: 192.16, exit: 191.64, size: 1.0, pnl: -520, fees: 8, setup: "Breakout", rating: 3 },
  { daysAgo: 23, open: "15:30", durMin: 25, symbol: "US100", direction: "short", entry: 18240, exit: 18308, size: 2, pnl: -680, fees: 6, setup: "Reversal", rating: 1, notes: "Fought the trend into close. Max loss for the day – stopped trading." },
  { daysAgo: 22, open: "09:00", durMin: 85, symbol: "EURUSD", direction: "short", entry: 1.0768, exit: 1.0737, size: 1.0, pnl: 310, fees: 7, setup: "Range", rating: 4 },
  { daysAgo: 20, open: "14:20", durMin: 210, symbol: "XAUUSD", direction: "long", entry: 2302.6, exit: 2331.8, size: 0.5, pnl: 1460, fees: 9, setup: "Pullback", rating: 5, notes: "Held through the first pullback. Trailed to structure." },
  { daysAgo: 19, open: "08:30", durMin: 60, symbol: "GBPUSD", direction: "long", entry: 1.2688, exit: 1.2712, size: 1.0, pnl: 240, fees: 7, setup: "Breakout", rating: 3 },
  { daysAgo: 17, open: "15:45", durMin: 40, symbol: "US100", direction: "long", entry: 18410, exit: 18365, size: 2, pnl: -450, fees: 6, setup: "Breakout", rating: 3 },
  { daysAgo: 16, open: "07:30", durMin: 150, symbol: "USDJPY", direction: "long", entry: 152.05, exit: 152.63, size: 1.0, pnl: 385, fees: 7, setup: "Pullback", rating: 4 },
  { daysAgo: 15, open: "09:20", durMin: 55, symbol: "EURUSD", direction: "long", entry: 1.0801, exit: 1.0801, size: 1.0, pnl: 0, fees: 7, setup: "Range", rating: 3, notes: "Moved to breakeven, got tagged." },
  { daysAgo: 13, open: "14:35", durMin: 35, symbol: "XAUUSD", direction: "short", entry: 2340.0, exit: 2358.4, size: 0.5, pnl: -920, fees: 9, setup: "News", rating: 1, notes: "Traded into CPI. Rule broken: no news trading." },
  { daysAgo: 12, open: "08:10", durMin: 110, symbol: "GBPUSD", direction: "short", entry: 1.2745, exit: 1.2689, size: 1.0, pnl: 560, fees: 7, setup: "Reversal", rating: 4 },
  { daysAgo: 10, open: "15:30", durMin: 180, symbol: "US100", direction: "long", entry: 18290, exit: 18414, size: 2, pnl: 1240, fees: 6, setup: "Breakout", rating: 5, notes: "Opening range breakout, trend day. Scaled out in thirds." },
  { daysAgo: 9, open: "10:00", durMin: 40, symbol: "EURUSD", direction: "short", entry: 1.0724, exit: 1.0752, size: 1.0, pnl: -280, fees: 7, setup: "Pullback", rating: 3 },
  { daysAgo: 8, open: "07:45", durMin: 130, symbol: "GBPJPY", direction: "short", entry: 193.42, exit: 192.69, size: 1.0, pnl: 735, fees: 8, setup: "Reversal", rating: 4 },
  { daysAgo: 6, open: "14:50", durMin: 60, symbol: "XAUUSD", direction: "long", entry: 2362.5, exit: 2350.3, size: 0.5, pnl: -610, fees: 9, setup: "Breakout", rating: 2, notes: "Late entry at the top of the move." },
  { daysAgo: 5, open: "15:40", durMin: 50, symbol: "US100", direction: "short", entry: 18520, exit: 18471, size: 2, pnl: 490, fees: 6, setup: "Range", rating: 4 },
  { daysAgo: 3, open: "08:20", durMin: 125, symbol: "EURUSD", direction: "long", entry: 1.0688, exit: 1.0770, size: 1.0, pnl: 820, fees: 7, setup: "Breakout", rating: 5, notes: "Patient entry on the retest. A+ execution." },
  { daysAgo: 2, open: "09:15", durMin: 45, symbol: "GBPUSD", direction: "long", entry: 1.2656, exit: 1.2622, size: 1.0, pnl: -340, fees: 7, setup: "Pullback", rating: 3 },
  { daysAgo: 1, open: "14:30", durMin: 170, symbol: "XAUUSD", direction: "long", entry: 2331.1, exit: 2350.4, size: 0.5, pnl: 965, fees: 9, setup: "Reversal", rating: 5, notes: "Waited for the sweep, took the reclaim. Let it run." },
];

function tradingDay(daysAgo: number) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() - 1); // Saturday -> Friday
  if (dow === 0) d.setDate(d.getDate() - 2); // Sunday -> Friday
  return d;
}

function at(base: Date, hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d;
}

let seededOnce = false;

/** Seeds a demo account the first time the app runs with an empty database. */
const DEMO_PLAYBOOK: NewPlaybook = {
  name: "London Session Playbook",
  description:
    "Setups traded between the London open and the New York overlap — range breakouts, session sweeps and reversals. If it is not in this book, I do not trade it.",
};

const DEMO_STRATEGIES: NewStrategy[] = [
  {
    name: "Asian Range Breakout",
    market: "FX",
    timeframe: "15m",
    session: "London",
    direction: "both",
    status: "active",
    rating: 5,
    risk: "0.5% per trade · R:R 1:2",
    description:
      "Trade the expansion that follows the London open, once price has swept an extreme of the overnight Asian range.",
    howItWorks:
      "Asia compresses into a range while liquidity builds above the overnight high and below the low. In the first half hour of London price sweeps one side, then displaces. I only take the break in the direction of the sweep once a 5m candle closes beyond the range.",
    entryWhere:
      "A retest of the broken range extreme after the 5m close beyond it, with the stop on the far side of the sweep wick.",
    entryWhy:
      "The sweep takes out resting orders and the close confirms the displacement. The retest gives an entry with defined risk at the exact level that was cleared.",
    entryCriteria: [
      "Asian range clearly defined over the last 4–6 hours",
      "Sweep of an Asian high or low within the first 30 minutes of London",
      "5m candle body closes beyond the range extreme",
      "Entry taken on the retest of the broken level, never on the break itself",
      "Stop beyond the sweep wick rather than the range",
    ].join("\n"),
    avoidCriteria: [
      "Asia traded an unusually wide range — no clear level to sweep",
      "A red-folder economic event within the next 60 minutes",
      "Price already extended 1R beyond the level before I see the setup",
      "Friday after 16:00 server time",
    ].join("\n"),
    skipReasons:
      "I deliberately drop the volume filter on FX — London execution is about liquidity, not tick volume, and the filter was cutting winners on GBPJPY. I also ignore the daily-bias rule when the D1 candle is balanced: a 50/50 daily means the range itself decides direction. On indices I drop the Asia-range requirement entirely, so the criterion simply does not transfer.",
    invalidation:
      "A 15m close back inside the Asian range invalidates the idea — exit on the spot instead of waiting for the stop. If the sweep is traded straight back through within two candles there is no follow-through to wait for.",
    target:
      "Take half at the 1:2R extension of the sweep candle and trail the rest under 15m structure. The first target never moves further away once price is in profit.",
  },
  {
    name: "New York Reversal",
    market: "Indices",
    timeframe: "5m",
    session: "New York",
    direction: "both",
    status: "testing",
    rating: 4,
    risk: "0.75% per trade · R:R 1:3",
    description:
      "Fade the second leg of the New York morning when the opening trend fails at a key daily level on the S&P 500 or Nasdaq.",
    howItWorks:
      "The morning run establishes a clear extreme. If price tags a daily level and the second push cannot extend, I look for a failed auction — a retest that cannot take out the extreme — and trade the rotation back to the range mid.",
    entryWhere:
      "On the lower high (or higher low) after the failed retest of the morning extreme, entering as the 5m structure flips.",
    entryWhy:
      "Two failed attempts at the extreme with the second push losing energy shows the auction ran out of buyers; the flip candle gives an early entry before the rotation is obvious.",
    entryCriteria: [
      "Morning trend printed a clearly defined extreme",
      "Price tags a daily support or resistance level",
      "Second push fails to make a new extreme",
      "5m structure flips against the morning trend",
      "Risk capped at 0.75% of account equity",
    ].join("\n"),
    avoidCriteria: [
      "The first 15 minutes of the opening bell — spread and noise are too high",
      "CPI / FOMC days and 30 minutes either side",
      "The failed push is under 15 points — too small to be meaningful",
    ].join("\n"),
    skipReasons:
      "I removed the volume-confirmation criterion: on the 5m by the time volume confirms a rotation, half the move is gone. I also drop the higher-timeframe-alignment rule when the daily level is untested for a week — the level itself is the context, and demanding daily bias made me miss the best reversals.",
    invalidation:
      "A 5m close through the morning extreme kills the idea — the auction simply was not done. Exit immediately and do not average in.",
    target:
      "Scale out at the range mid (1.5R) and leave a runner for the other side of the day's range with the stop moved to breakeven.",
  },
  {
    name: "Liquidity Sweep Reversal",
    market: "FX",
    timeframe: "15m",
    session: "Overlap",
    direction: "both",
    status: "active",
    rating: 4,
    risk: "0.5% per trade · R:R 1:3",
    description:
      "Take the turn after both sessions have swept obvious equal highs or lows and rejected the level with a displacement candle.",
    howItWorks:
      "Equal highs and lows sit on every chart and get taken during the London–New York overlap. When the sweep is followed by aggressive displacement back through the level, the trapped side has to exit — I enter the retracement into that displacement.",
    entryWhere:
      "50% retracement of the displacement candle, entered with a limit, stop beyond the sweep extreme.",
    entryWhy:
      "Displacement after a sweep is the footprint of institutions closing into the liquidity they just created; the midpoint of that candle is where the imbalance begins.",
    entryCriteria: [
      "Equal highs or equal lows clearly visible before the sweep",
      "The sweep happens during the London–New York overlap",
      "Displacement candle closes back through the swept level",
      "Entry at the 50% retracement of that displacement",
      "Stop beyond the sweep extreme, risk fixed at 1%",
    ].join("\n"),
    avoidCriteria: [
      "Sweep without displacement — price just lingers at the level",
      "Equal highs that are more than 8 hours old (stale)",
      "The session closes in under 30 minutes",
    ].join("\n"),
    skipReasons:
      "I removed the higher-timeframe-trend-only filter — it was cutting the best reversals in half, because the sweep itself usually completes the higher-timeframe move. I keep the equal-lows requirement for FX but ignore it on gold, where level spacing is wider and any clean rejection works.",
    invalidation:
      "A 15m close back beyond the swept level means the sweep was a break rather than a trap — exit on the close of that candle.",
    target:
      "First target at 3R into the opposite side of the session range; trail under the displacement low rather than adding.",
  },
];

export async function ensureSeeded(userId: string) {
  if (seededOnce) return;
  await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(727374)`);

    /* Demo data only ever appears on a completely fresh install (no accounts
       at all). On an existing journal — including after the first signup
       claims the migrated rows — new users start with an empty workspace. */
    const [{ totalAccounts }] = await tx
      .select({ totalAccounts: sql<number>`count(*)::int` })
      .from(accounts);

    if (totalAccounts === 0) {
      const [pb] = await tx
        .insert(playbooks)
        .values({ ...DEMO_PLAYBOOK, userId })
        .returning({ id: playbooks.id });
      const created = await tx
        .insert(strategies)
        .values(DEMO_STRATEGIES.map((s) => ({ ...s, playbookId: pb.id, userId })))
        .returning({ id: strategies.id, name: strategies.name });
      const strategyIds: Record<string, number> = Object.fromEntries(created.map((s) => [s.name, s.id]));

      const [account] = await tx
        .insert(accounts)
        .values({
          userId,
          name: "FTMO Challenge 100K",
          phase: "challenge",
          currency: "USD",
          startingBalance: 100000,
          profitTargetPct: 10,
          maxDailyLossPct: 5,
          maxLossPct: 10,
        })
        .returning();

      await insertDemoJournal(tx, account.id, strategyIds, userId);
      seededOnce = true;
      return;
    }

    /* Existing journal: the first signup already claimed the playbook and its
       strategies, so backfill this user's unlinked legacy trades — and only
       theirs. New users own no strategies, so this is a no-op for them. */
    const userStrategies = await tx
      .select({ id: strategies.id, name: strategies.name })
      .from(strategies)
      .where(eq(strategies.userId, userId));
    if (userStrategies.length > 0) {
      await tx.execute(sql`
        update trades set strategy_id = case
          when setup = 'Breakout' then (select id from strategies where name = 'Asian Range Breakout' and user_id = ${userId})
          when setup = 'Reversal' then (select id from strategies where name = case when symbol like 'US%' then 'New York Reversal' else 'Liquidity Sweep Reversal' end and user_id = ${userId})
          when setup = 'Range' then (select id from strategies where name = 'New York Reversal' and user_id = ${userId})
          else strategy_id end
        where strategy_id is null and user_id = ${userId}
      `);
    }
    seededOnce = true;
  });
  seededOnce = true;
}

/** Demo trades + journal entries for a brand-new install, owned by `userId`. */
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function insertDemoJournal(
  tx: Tx,
  accountId: number,
  strategyIds: Record<string, number>,
  userId: string,
) {
  const strategyFor = (symbol: string, setup: string): number | null => {
    if (setup === "Breakout") return strategyIds["Asian Range Breakout"] ?? null;
    if (setup === "Reversal")
      return symbol.startsWith("US")
        ? (strategyIds["New York Reversal"] ?? null)
        : (strategyIds["Liquidity Sweep Reversal"] ?? null);
    if (setup === "Range") return strategyIds["New York Reversal"] ?? null;
    return null;
  };

  const rows: NewTrade[] = TEMPLATES.map((t) => {
    const openedAt = at(tradingDay(t.daysAgo), t.open);
    const closedAt = new Date(openedAt.getTime() + t.durMin * 60000);
    return {
      accountId,
      userId,
      symbol: t.symbol,
      direction: t.direction,
      entryPrice: t.entry,
      exitPrice: t.exit,
      size: t.size,
      pnl: t.pnl,
      fees: t.fees,
      openedAt,
      closedAt,
      setup: t.setup,
      rating: t.rating,
      notes: t.notes ?? null,
      strategyId: strategyFor(t.symbol, t.setup),
    };
  });
  const inserted = await tx.insert(trades).values(rows).returning({ id: trades.id });
  // Demo chart / setup artwork so the media section is visible on first run.
  const artwork: Record<number, Partial<NewTrade>> = {
    0: { chartImageUrl: "/seed/chart-1.svg" },
    2: { chartImageUrl: "/seed/chart-2.svg", setupImageUrl: "/seed/setup-1.svg" },
    6: { tradingviewUrl: "https://www.tradingview.com/chart/" },
    10: { chartImageUrl: "/seed/chart-1.svg", setupImageUrl: "/seed/setup-1.svg" },
  };
  for (const [index, patch] of Object.entries(artwork)) {
    const row = inserted[Number(index)];
    if (row) await tx.update(trades).set(patch).where(sql`${trades.id} = ${row.id}`);
  }

  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  await tx
    .insert(journalEntries)
    .values([
      {
        userId,
        entryDate: iso(tradingDay(23)),
        mood: "frustrated",
        content:
          "Hit my daily loss limit fighting the NQ trend into the close. The first loss was fine, the second one was ego. New rule: after two consecutive losses, shut the platform for the day.",
      },
      {
        userId,
        entryDate: iso(tradingDay(13)),
        mood: "anxious",
        content:
          "Broke the no-news rule and traded gold into CPI. Spread blew out and I was stopped before the move even developed. Not a strategy problem – a discipline problem.",
      },
      {
        userId,
        entryDate: iso(tradingDay(3)),
        mood: "focused",
        content:
          "Best session in weeks. Waited for the retest instead of chasing, sized according to plan, and let the trade work. This is what the process is supposed to feel like.",
      },
      {
        userId,
        entryDate: iso(tradingDay(1)),
        mood: "calm",
        content:
          "Only one setup today and it was the right one. Halfway to the profit target with plenty of room under the drawdown limits. Keep sizing flat – no need to push.",
      },
    ])
    .onConflictDoNothing();
}

