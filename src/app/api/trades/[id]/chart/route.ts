import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { CHART_TIMEFRAMES, chartCandles, type ChartTimeframe } from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getTradeById } from "@/lib/data";

export const dynamic = "force-dynamic";

/**
 * Candle history around one trade, for the pinned chart on the trade page.
 * Ownership is checked twice: the proxy keeps signed-out visitors out, and
 * getTradeById scopes the trade to the signed-in user.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Trade not found" }, { status: 404 });
  const trade = await getTradeById(id);
  if (!trade) return Response.json({ error: "Trade not found" }, { status: 404 });

  const tfParam = new URL(request.url).searchParams.get("tf")?.toUpperCase() ?? "";
  if (!CHART_TIMEFRAMES.includes(tfParam as ChartTimeframe)) {
    return Response.json({ error: "Unknown timeframe" }, { status: 400 });
  }
  const timeframe = tfParam as ChartTimeframe;

  const rows = await db
    .select({
      time: chartCandles.time,
      open: chartCandles.open,
      high: chartCandles.high,
      low: chartCandles.low,
      close: chartCandles.close,
    })
    .from(chartCandles)
    .where(and(eq(chartCandles.tradeId, id), eq(chartCandles.timeframe, timeframe)))
    .orderBy(asc(chartCandles.time));

  return Response.json({
    symbol: trade.symbol,
    timeframe,
    candles: rows.map((r) => ({ time: r.time, open: r.open, high: r.high, low: r.low, close: r.close })),
  });
}
