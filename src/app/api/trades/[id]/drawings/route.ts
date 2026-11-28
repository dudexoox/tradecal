import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  CHART_DRAWING_KINDS,
  chartDrawings,
  type ChartDrawingKind,
  type ChartDrawingPoint,
} from "@/db/schema";
import { getUser } from "@/lib/auth";
import { getTradeById } from "@/lib/data";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Validate the anchors of a drawing. */
function parsePoints(value: unknown): ChartDrawingPoint[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > 4) return null;
  const points: ChartDrawingPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) return null;
    const raw = item as Record<string, unknown>;
    const { time, price } = raw;
    if (typeof time !== "number" || !Number.isFinite(time)) return null;
    if (typeof price !== "number" || !Number.isFinite(price)) return null;
    points.push({ time: Math.round(time), price });
  }
  return points;
}

function parseKind(value: unknown): ChartDrawingKind | null {
  if (typeof value !== "string") return null;
  return (CHART_DRAWING_KINDS as readonly string[]).includes(value)
    ? (value as ChartDrawingKind)
    : null;
}

function parseColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

/**
 * The trade behind the drawings, checked against the signed-in user. Other
 * users' trades are indistinguishable from missing ones.
 */
async function ownedTrade(ctx: Context) {
  const user = await getUser();
  if (!user) return { user: null, tradeId: null };
  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return { user, tradeId: null };
  const trade = await getTradeById(id);
  if (!trade) return { user, tradeId: null };
  return { user, tradeId: id };
}

/** Every drawing the user made on one trade. */
export async function GET(_request: Request, ctx: Context) {
  const { user, tradeId } = await ownedTrade(ctx);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (tradeId === null) return Response.json({ error: "Trade not found" }, { status: 404 });

  const rows = await db
    .select({
      id: chartDrawings.id,
      kind: chartDrawings.kind,
      points: chartDrawings.points,
      color: chartDrawings.color,
    })
    .from(chartDrawings)
    .where(and(eq(chartDrawings.tradeId, tradeId), eq(chartDrawings.userId, user.id)))
    .orderBy(asc(chartDrawings.id));

  return Response.json({ drawings: rows });
}

/** Add a drawing to a trade. */
export async function POST(request: Request, ctx: Context) {
  const { user, tradeId } = await ownedTrade(ctx);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (tradeId === null) return Response.json({ error: "Trade not found" }, { status: 404 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (input ?? {}) as Record<string, unknown>;
  const kind = parseKind(raw.kind);
  const points = parsePoints(raw.points);
  const color = parseColor(raw.color) ?? "#0781fe";
  if (!kind || !points) return Response.json({ error: "Invalid drawing" }, { status: 400 });

  const [drawing] = await db
    .insert(chartDrawings)
    .values({ tradeId, userId: user.id, kind, points, color })
    .returning({
      id: chartDrawings.id,
      kind: chartDrawings.kind,
      points: chartDrawings.points,
      color: chartDrawings.color,
    });

  return Response.json({ drawing });
}

/** Move or restyle a drawing. */
export async function PATCH(request: Request, ctx: Context) {
  const { user, tradeId } = await ownedTrade(ctx);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (tradeId === null) return Response.json({ error: "Trade not found" }, { status: 404 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const raw = (input ?? {}) as Record<string, unknown>;
  const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Drawing not found" }, { status: 404 });
  }

  const [current] = await db
    .select()
    .from(chartDrawings)
    .where(
      and(
        eq(chartDrawings.id, id),
        eq(chartDrawings.tradeId, tradeId),
        eq(chartDrawings.userId, user.id),
      ),
    )
    .limit(1);
  if (!current) return Response.json({ error: "Drawing not found" }, { status: 404 });

  const points = raw.points === undefined ? current.points : parsePoints(raw.points);
  const color = raw.color === undefined ? current.color : parseColor(raw.color);
  if (!points || !color) return Response.json({ error: "Invalid drawing" }, { status: 400 });

  const [drawing] = await db
    .update(chartDrawings)
    .set({ points, color, updatedAt: new Date() })
    .where(
      and(
        eq(chartDrawings.id, id),
        eq(chartDrawings.tradeId, tradeId),
        eq(chartDrawings.userId, user.id),
      ),
    )
    .returning({
      id: chartDrawings.id,
      kind: chartDrawings.kind,
      points: chartDrawings.points,
      color: chartDrawings.color,
    });

  return Response.json({ drawing });
}

/** Remove one drawing, or every drawing on the trade. */
export async function DELETE(request: Request, ctx: Context) {
  const { user, tradeId } = await ownedTrade(ctx);
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });
  if (tradeId === null) return Response.json({ error: "Trade not found" }, { status: 404 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    input = {};
  }
  const raw = (input ?? {}) as Record<string, unknown>;

  if (raw.all === true) {
    await db
      .delete(chartDrawings)
      .where(and(eq(chartDrawings.tradeId, tradeId), eq(chartDrawings.userId, user.id)));
    return Response.json({ ok: true });
  }

  const id = typeof raw.id === "number" ? raw.id : Number(raw.id);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: "Drawing not found" }, { status: 404 });
  }
  await db
    .delete(chartDrawings)
    .where(
      and(
        eq(chartDrawings.id, id),
        eq(chartDrawings.tradeId, tradeId),
        eq(chartDrawings.userId, user.id),
      ),
    );
  return Response.json({ ok: true });
}
