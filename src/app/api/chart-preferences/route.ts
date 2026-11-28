import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  CHART_REPLAY_SPEEDS,
  CHART_STYLES,
  CHART_THEMES,
  CHART_TIMEFRAMES,
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
  timeframe: "M15" as const,
  chartStyle: "candles" as const,
  chartTheme: "light" as const,
  showZones: true,
  showRunningPnl: true,
  showHigherTimeframe: false,
  replaySpeed: 1,
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

  /* replay workspace (broker candles) */
  if (raw.timeframe !== undefined) {
    if (!CHART_TIMEFRAMES.includes(raw.timeframe as (typeof CHART_TIMEFRAMES)[number])) return null;
    out.timeframe = raw.timeframe as (typeof DEFAULTS)["timeframe"];
  }
  if (raw.chartStyle !== undefined) {
    if (!CHART_STYLES.includes(raw.chartStyle as (typeof CHART_STYLES)[number])) return null;
    out.chartStyle = raw.chartStyle as (typeof DEFAULTS)["chartStyle"];
  }
  if (raw.chartTheme !== undefined) {
    if (!CHART_THEMES.includes(raw.chartTheme as (typeof CHART_THEMES)[number])) return null;
    out.chartTheme = raw.chartTheme as (typeof DEFAULTS)["chartTheme"];
  }
  if (raw.showZones !== undefined) {
    if (typeof raw.showZones !== "boolean") return null;
    out.showZones = raw.showZones;
  }
  if (raw.showRunningPnl !== undefined) {
    if (typeof raw.showRunningPnl !== "boolean") return null;
    out.showRunningPnl = raw.showRunningPnl;
  }
  if (raw.showHigherTimeframe !== undefined) {
    if (typeof raw.showHigherTimeframe !== "boolean") return null;
    out.showHigherTimeframe = raw.showHigherTimeframe;
  }
  if (raw.replaySpeed !== undefined) {
    if (typeof raw.replaySpeed !== "number") return null;
    if (!CHART_REPLAY_SPEEDS.includes(raw.replaySpeed as (typeof CHART_REPLAY_SPEEDS)[number])) return null;
    out.replaySpeed = raw.replaySpeed;
  }
  return out;
}

/** The signed-in user's saved chart setup; null means "not saved yet". */
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

/** Save the signed-in user's chart setup. Never accepts a user id. */
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
    timeframe: patch.timeframe ?? current?.timeframe ?? DEFAULTS.timeframe,
    chartStyle: patch.chartStyle ?? current?.chartStyle ?? DEFAULTS.chartStyle,
    chartTheme: patch.chartTheme ?? current?.chartTheme ?? DEFAULTS.chartTheme,
    showZones: patch.showZones ?? current?.showZones ?? DEFAULTS.showZones,
    showRunningPnl: patch.showRunningPnl ?? current?.showRunningPnl ?? DEFAULTS.showRunningPnl,
    showHigherTimeframe:
      patch.showHigherTimeframe ?? current?.showHigherTimeframe ?? DEFAULTS.showHigherTimeframe,
    replaySpeed: patch.replaySpeed ?? current?.replaySpeed ?? DEFAULTS.replaySpeed,
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
        timeframe: values.timeframe,
        chartStyle: values.chartStyle,
        chartTheme: values.chartTheme,
        showZones: values.showZones,
        showRunningPnl: values.showRunningPnl,
        showHigherTimeframe: values.showHigherTimeframe,
        replaySpeed: values.replaySpeed,
        updatedAt: values.updatedAt,
      },
    })
    .returning();

  return Response.json({ preferences: saved });
}
