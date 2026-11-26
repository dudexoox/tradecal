import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  TV_CHART_TYPES,
  TV_INTERVALS,
  TV_THEMES,
  TV_TIMEZONES,
  chartPreferences,
} from "@/db/schema";
import { getUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const DEFAULTS = {
  interval: "15" as const,
  theme: "light" as const,
  chartType: "candles" as const,
  timezone: "Etc/UTC" as const,
  showDrawingToolbar: true,
};

type PreferencesInput = Partial<typeof DEFAULTS>;

function parseInput(value: unknown): PreferencesInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  const out: PreferencesInput = {};

  if (raw.interval !== undefined) {
    if (!TV_INTERVALS.includes(raw.interval as (typeof TV_INTERVALS)[number])) return null;
    out.interval = raw.interval as (typeof DEFAULTS)["interval"];
  }
  if (raw.theme !== undefined) {
    if (!TV_THEMES.includes(raw.theme as (typeof TV_THEMES)[number])) return null;
    out.theme = raw.theme as (typeof DEFAULTS)["theme"];
  }
  if (raw.chartType !== undefined) {
    if (!TV_CHART_TYPES.includes(raw.chartType as (typeof TV_CHART_TYPES)[number])) return null;
    out.chartType = raw.chartType as (typeof DEFAULTS)["chartType"];
  }
  if (raw.timezone !== undefined) {
    if (!TV_TIMEZONES.includes(raw.timezone as (typeof TV_TIMEZONES)[number])) return null;
    out.timezone = raw.timezone as (typeof DEFAULTS)["timezone"];
  }
  if (raw.showDrawingToolbar !== undefined) {
    if (typeof raw.showDrawingToolbar !== "boolean") return null;
    out.showDrawingToolbar = raw.showDrawingToolbar;
  }
  return out;
}

/** The signed-in user's saved Analyze-chart setup; null means "not saved yet". */
export async function GET() {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  const [prefs] = await db
    .select()
    .from(chartPreferences)
    .where(eq(chartPreferences.userId, user.id))
    .limit(1);
  return Response.json({ preferences: prefs ?? null });
}

/** Save the signed-in user's Analyze-chart setup. Never accepts a user id. */
export async function PUT(request: Request) {
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in required" }, { status: 401 });

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const patch = parseInput(input);
  if (!patch) return Response.json({ error: "Invalid chart settings" }, { status: 400 });

  const [current] = await db
    .select()
    .from(chartPreferences)
    .where(eq(chartPreferences.userId, user.id))
    .limit(1);
  const values = {
    userId: user.id,
    interval: patch.interval ?? current?.interval ?? DEFAULTS.interval,
    theme: patch.theme ?? current?.theme ?? DEFAULTS.theme,
    chartType: patch.chartType ?? current?.chartType ?? DEFAULTS.chartType,
    timezone: patch.timezone ?? current?.timezone ?? DEFAULTS.timezone,
    showDrawingToolbar: patch.showDrawingToolbar ?? current?.showDrawingToolbar ?? DEFAULTS.showDrawingToolbar,
    updatedAt: new Date(),
  };

  const [saved] = await db
    .insert(chartPreferences)
    .values(values)
    .onConflictDoUpdate({
      target: chartPreferences.userId,
      set: {
        interval: values.interval,
        theme: values.theme,
        chartType: values.chartType,
        timezone: values.timezone,
        showDrawingToolbar: values.showDrawingToolbar,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return Response.json({ preferences: saved });
}
