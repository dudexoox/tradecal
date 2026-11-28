"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { ChartTimeframe } from "@/db/schema";
import {
  CHART_STYLES,
  CHART_TIMEFRAMES,
  chartPlannedRR,
  chartPriceOffset,
  chartTradeR,
  defaultTimeframe,
  moneyPerPriceUnit,
  REPLAY_SPEEDS,
  replayPlan,
  shiftCandles,
  type ChartCandle,
  type ChartStyle,
  type ChartTradeMeta,
} from "@/lib/chart-workspace";
import type { ChartDrawing, DrawingAction } from "@/lib/chart-drawings";
import { fmtDuration, fmtMoney, fmtNum, fmtPrice, fmtR, fmtSignedMoney, fmtTime } from "@/lib/format";
import { Icon } from "./icons";
import { TradeChartCanvas, type ChartTheme } from "./trade-chart-canvas";

type Setup = {
  timeframe: ChartTimeframe;
  chartStyle: ChartStyle;
  chartTheme: ChartTheme;
  showZones: boolean;
  replaySpeed: number;
};

const DEFAULT_SETUP: Setup = {
  timeframe: "M15",
  chartStyle: "candles",
  chartTheme: "light",
  showZones: true,
  replaySpeed: 1,
};

function isChartTimeframe(value: unknown): value is ChartTimeframe {
  return typeof value === "string" && CHART_TIMEFRAMES.some((t) => t.value === value);
}

function isChartStyle(value: unknown): value is ChartStyle {
  return typeof value === "string" && (CHART_STYLES as readonly string[]).includes(value);
}

function isTheme(value: unknown): value is ChartTheme {
  return value === "light" || value === "dark";
}

/**
 * The TradeZella-style replay workspace: the trade's candles with the entry
 * and exit marked, the plan shaded in, a running P&L strip and bar-by-bar
 * playback controls.
 */
export function TradeChartWorkspace({
  trade,
  onOpenTradingView,
}: {
  trade: ChartTradeMeta;
  onOpenTradingView: () => void;
}) {
  const [setup, setSetup] = useState<Setup>({ ...DEFAULT_SETUP, timeframe: defaultTimeframe(trade) });
  const [candles, setCandles] = useState<ChartCandle[]>([]);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [fitRequest, setFitRequest] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  /* Load the saved chart setup once. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/chart-preferences", { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { preferences?: Partial<Setup> | null };
        const p = data.preferences;
        if (!p || controller.signal.aborted) return;
        setSetup({
          timeframe: isChartTimeframe(p.timeframe) ? p.timeframe : defaultTimeframe(trade),
          chartStyle: isChartStyle(p.chartStyle) ? p.chartStyle : DEFAULT_SETUP.chartStyle,
          chartTheme: isTheme(p.chartTheme) ? p.chartTheme : DEFAULT_SETUP.chartTheme,
          showZones: typeof p.showZones === "boolean" ? p.showZones : DEFAULT_SETUP.showZones,
          replaySpeed: typeof p.replaySpeed === "number" && p.replaySpeed > 0 ? p.replaySpeed : DEFAULT_SETUP.replaySpeed,
        });
      } catch {
        // Defaults still give a usable chart.
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [trade]);

  /* Candles for the selected timeframe. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/trades/${trade.id}/chart?tf=${setup.timeframe}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error("Could not load the candles for this trade");
        const data = (await res.json()) as { candles?: ChartCandle[] };
        if (controller.signal.aborted) return;
        setCandles(data.candles ?? []);
        setError(null);
      } catch {
        if (!controller.signal.aborted) {
          setCandles([]);
          setError("Could not load the candles for this trade.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [trade.id, setup.timeframe]);

  /* The drawings the user made on this trade. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/trades/${trade.id}/drawings`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { drawings?: ChartDrawing[] };
        if (controller.signal.aborted) return;
        setDrawings((data.drawings ?? []).map((drawing) => ({ ...drawing, key: `d${drawing.id}` })));
      } catch {
        // A trade without drawings still shows a clean chart.
      }
    })();
    return () => controller.abort();
  }, [trade.id]);

  const plan = useMemo(() => replayPlan(candles, trade), [candles, trade]);
  const unit = useMemo(() => moneyPerPriceUnit(trade), [trade]);
  const rMultiple = useMemo(() => chartTradeR(trade), [trade]);
  const plannedRR = useMemo(() => chartPlannedRR(trade), [trade]);

  /* Candles are pulled by symbol and time window, so they can sit on another
     price level than the trade. The chart shifts them to line the trade up. */
  const offset = useMemo(() => chartPriceOffset(candles, trade), [candles, trade]);
  const chartCandles = useMemo(() => shiftCandles(candles, offset), [candles, offset]);

  /* Playback: one bar per tick, faster with a higher speed. */
  useEffect(() => {
    if (!playing || cursor === null || !plan) return;
    const timer = setTimeout(() => {
      setCursor((current) => {
        if (current === null) return current;
        const next = current + 1;
        if (next >= plan.endIndex) {
          setPlaying(false);
          return plan.endIndex;
        }
        return next;
      });
    }, 650 / setup.replaySpeed);
    return () => clearTimeout(timer);
  }, [playing, cursor, plan, setup.replaySpeed]);

  const update = <K extends keyof Setup>(key: K, value: Setup[K]) => {
    setSetup((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setMessage(null);
  };

  /* Changing the timeframe restarts the replay from the top. */
  const changeTimeframe = (value: ChartTimeframe) => {
    setSetup((prev) => ({ ...prev, timeframe: value }));
    setCursor(null);
    setPlaying(false);
    setLoading(true);
    setError(null);
    setDirty(true);
    setMessage(null);
  };

  /* Drawings are saved per trade, so they come back with the trade. */
  const onDrawingsChange = useCallback(
    (next: ChartDrawing[], action: DrawingAction) => {
      setDrawings(next);
      setMessage(null);
      const url = `/api/trades/${trade.id}/drawings`;
      void (async () => {
        try {
          if (action.type === "create") {
            const res = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                kind: action.drawing.kind,
                points: action.drawing.points,
                color: action.drawing.color,
              }),
            });
            if (!res.ok) throw new Error("save");
            const data = (await res.json()) as { drawing?: ChartDrawing };
            const saved = data.drawing;
            if (!saved) return;
            setDrawings((current) =>
              current.map((drawing) =>
                drawing.key === action.drawing.key ? { ...saved, key: drawing.key } : drawing,
              ),
            );
            return;
          }
          if (action.type === "update") {
            const res = await fetch(url, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                id: action.drawing.id,
                points: action.drawing.points,
                color: action.drawing.color,
              }),
            });
            if (!res.ok) throw new Error("save");
            return;
          }
          if (action.type === "delete") {
            const res = await fetch(url, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ id: action.id }),
            });
            if (!res.ok) throw new Error("save");
            return;
          }
          const res = await fetch(url, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ all: true }),
          });
          if (!res.ok) throw new Error("save");
        } catch {
          setMessage("Could not save the drawing.");
        }
      })();
    },
    [trade.id],
  );

  const save = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/chart-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(setup),
      });
      if (!res.ok) throw new Error(res.status === 401 ? "Sign in required" : "Could not save the chart setup");
      setDirty(false);
      setMessage("Chart setup saved for every trade.");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Could not save the chart setup");
    } finally {
      setSaving(false);
    }
  }, [setup]);

  const startReplay = () => {
    if (!plan) return;
    setCursor(plan.startIndex);
    setPlaying(true);
  };

  const step = (delta: number) => {
    if (!plan || candles.length === 0) return;
    setPlaying(false);
    setCursor((current) => {
      const base = current ?? plan.startIndex;
      return Math.min(candles.length - 1, Math.max(0, base + delta));
    });
  };

  const jumpTo = (index: number) => {
    if (!plan) return;
    setPlaying(false);
    setCursor(Math.min(candles.length - 1, Math.max(0, index)));
  };

  const lastIndex = candles.length - 1;
  const activeIndex = cursor ?? lastIndex;
  const revealedCandle = cursor === null ? null : chartCandles[cursor] ?? null;

  /* The running P&L only exists once the trade is open: before the entry
     there is nothing to show, after the exit it holds the realised result. */
  const runningPnl = useMemo(() => {
    if (!revealedCandle || unit === null || trade.entryPrice === null || !plan) return null;
    if (activeIndex < plan.entryIndex) return null;
    if (activeIndex >= plan.exitIndex && trade.closedAt) return trade.pnl;
    const move =
      trade.direction === "long"
        ? revealedCandle.close - trade.entryPrice
        : trade.entryPrice - revealedCandle.close;
    return move * unit;
  }, [revealedCandle, unit, trade, plan, activeIndex]);

  const toggle = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-medium transition-colors ${
        active
          ? "border-brand/30 bg-brand/8 text-brand"
          : "border-line-2 bg-white text-muted hover:bg-panel-2 hover:text-fg"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-white">
      {/* ---------------------------------------------------------- toolbar */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-panel-2/50 px-3 py-2">
        <div className="flex items-center gap-1 rounded-lg border border-line-2 bg-white p-0.5">
          {CHART_TIMEFRAMES.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => changeTimeframe(option.value)}
              title={option.label}
              className={`num h-7 rounded-md px-2.5 text-[11px] font-semibold transition-colors ${
                setup.timeframe === option.value
                  ? "bg-brand text-white"
                  : "text-muted hover:bg-panel-2 hover:text-fg"
              }`}
            >
              {option.short}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 rounded-lg border border-line-2 bg-white p-0.5">
          {CHART_STYLES.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => update("chartStyle", option)}
              className={`h-7 rounded-md px-2.5 text-[11px] font-medium capitalize transition-colors ${
                setup.chartStyle === option ? "bg-panel-2 text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {toggle("Zones", setup.showZones, () => update("showZones", !setup.showZones))}
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setFitRequest((v) => v + 1)}
            className="icon-button h-8 w-8"
            aria-label="Fit the chart to the data"
            title="Fit"
          >
            <Icon name="fit" size={14} />
          </button>
          <button
            type="button"
            onClick={() => update("chartTheme", setup.chartTheme === "light" ? "dark" : "light")}
            className="icon-button h-8 w-8"
            aria-label={`Switch to ${setup.chartTheme === "light" ? "dark" : "light"} chart`}
            title={setup.chartTheme === "light" ? "Dark chart" : "Light chart"}
          >
            <Icon name={setup.chartTheme === "light" ? "moon" : "sun"} size={14} />
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving || !loaded || !dirty}
            className="btn-primary h-8 px-3 text-[11px]"
          >
            {saving ? "Saving…" : dirty ? "Save setup" : loaded ? "Saved" : "Loading…"}
          </button>
        </div>
      </div>

      {/* ----------------------------------------------------------- content */}
      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <div
            className={`relative min-h-0 flex-1 ${setup.chartTheme === "dark" ? "bg-[#0d1117]" : "bg-white"}`}
          >
            {loading && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-white/70">
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-brand" />
                <span className="text-xs font-medium text-muted">Loading candles…</span>
              </div>
            )}
            {!loading && candles.length === 0 && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white px-6 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand/7 text-brand">
                  <Icon name="chart" size={21} />
                </span>
                <p className="text-sm font-semibold">No broker candles for this trade</p>
                <p className="max-w-sm text-[12px] leading-relaxed text-muted">
                  {error ?? "Sync the account to pull the candles around this trade, or open the TradingView chart instead."}
                </p>
                <button type="button" onClick={onOpenTradingView} className="btn-ghost h-9 px-3 text-[12px]">
                  <Icon name="chart" size={13} />
                  Open TradingView
                </button>
              </div>
            )}
            {candles.length > 0 && (
              <TradeChartCanvas
                candles={chartCandles}
                trade={trade}
                style={setup.chartStyle}
                theme={setup.chartTheme}
                showZones={setup.showZones}
                cursor={cursor}
                fitRequest={fitRequest}
                drawings={drawings}
                onDrawingsChange={onDrawingsChange}
              />
            )}
            {offset !== 0 && candles.length > 0 && (
              <p className="absolute bottom-3 left-3 z-10 rounded-lg border border-line bg-white/90 px-2.5 py-1.5 text-[10px] text-muted shadow-sm">
                Synced candles sit {fmtPrice(Math.abs(offset))} away from this trade&apos;s prices — the chart is
                shifted so the entry, stop and exit line up.
              </p>
            )}
          </div>

          {/* ------------------------------------------------------- replay */}
          <div className="border-t border-line bg-panel-2/40 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => jumpTo(plan?.startIndex ?? 0)}
                  disabled={!plan}
                  className="icon-button h-8 w-8"
                  aria-label="Back to the start"
                  title="Start"
                >
                  <Icon name="skipStart" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => step(-1)}
                  disabled={!plan}
                  className="icon-button h-8 w-8"
                  aria-label="Previous bar"
                  title="Previous bar"
                >
                  <Icon name="stepBack" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => (playing ? setPlaying(false) : startReplay())}
                  disabled={!plan}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:bg-brand-2 disabled:opacity-50"
                  aria-label={playing ? "Pause the replay" : "Replay the trade"}
                  title={playing ? "Pause" : "Replay"}
                >
                  <Icon name={playing ? "pause" : "play"} size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => step(1)}
                  disabled={!plan}
                  className="icon-button h-8 w-8"
                  aria-label="Next bar"
                  title="Next bar"
                >
                  <Icon name="stepForward" size={13} />
                </button>
                <button
                  type="button"
                  onClick={() => jumpTo(plan?.endIndex ?? lastIndex)}
                  disabled={!plan}
                  className="icon-button h-8 w-8"
                  aria-label="Jump to the end"
                  title="End"
                >
                  <Icon name="skipEnd" size={13} />
                </button>
              </div>

              <div className="flex min-w-[180px] flex-1 items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, lastIndex)}
                    value={activeIndex}
                    onChange={(e) => {
                      setPlaying(false);
                      setCursor(Number(e.target.value));
                    }}
                    disabled={candles.length === 0}
                    aria-label="Replay position"
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-line-2 accent-brand disabled:opacity-40"
                  />
                  {plan && (
                    <span className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2">
                      <span
                        className="absolute h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-up"
                        style={{
                          left: `${(plan.entryIndex / Math.max(1, lastIndex)) * 100}%`,
                        }}
                        title="Entry"
                      />
                      <span
                        className="absolute h-2.5 w-0.5 -translate-x-1/2 rounded-full bg-down"
                        style={{
                          left: `${(plan.exitIndex / Math.max(1, lastIndex)) * 100}%`,
                        }}
                        title="Exit"
                      />
                    </span>
                  )}
                </div>
                <span className="num w-[112px] shrink-0 text-right text-[10px] text-muted">
                  {revealedCandle
                    ? `${new Date(revealedCandle.time * 1000).toLocaleDateString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        timeZone: "UTC",
                      })} ${new Date(revealedCandle.time * 1000).toLocaleTimeString("en-GB", {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                        timeZone: "UTC",
                      })} UTC`
                    : `${candles.length} bars`}
                </span>
              </div>

              <div className="flex items-center gap-1 rounded-lg border border-line-2 bg-white p-0.5">
                {REPLAY_SPEEDS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => update("replaySpeed", option)}
                    className={`num h-7 rounded-md px-2 text-[11px] font-semibold transition-colors ${
                      setup.replaySpeed === option
                        ? "bg-panel-2 text-fg"
                        : "text-muted hover:bg-fg hover:text-fg"
                    }`}
                  >
                    {option}x
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.1em] text-dim">Running P&L</span>
                <span
                  className={`num text-[13px] font-semibold ${
                    runningPnl === null
                      ? "text-muted"
                      : runningPnl > 0
                        ? "text-up"
                        : runningPnl < 0
                          ? "text-down"
                          : "text-fg"
                  }`}
                >
                  {runningPnl === null ? "—" : fmtSignedMoney(runningPnl, trade.currency)}
                </span>
              </div>
            </div>
            {message && <p className="mt-1.5 text-[10px] text-muted">{message}</p>}
          </div>
        </div>

        {/* ---------------------------------------------------- side panel */}
        <aside className="hidden w-[286px] shrink-0 flex-col gap-4 overflow-y-auto border-l border-line bg-white px-4 py-4 xl:flex">
          <section>
            <div className="flex items-center justify-between">
              <h3 className="section-eyebrow">The trade</h3>
              <span
                className={`inline-flex h-[22px] items-center rounded-md px-2 text-[10px] font-medium capitalize ${
                  trade.direction === "long" ? "bg-up/8 text-up" : "bg-down/8 text-down"
                }`}
              >
                {trade.direction}
              </span>
            </div>
            <dl className="mt-3 space-y-2.5">
              {[
                { label: "Entry", value: fmtPrice(trade.entryPrice) },
                { label: "Stop loss", value: fmtPrice(trade.stopLoss) },
                { label: "Take profit", value: fmtPrice(trade.takeProfit) },
                { label: "Exit", value: fmtPrice(trade.exitPrice) },
                { label: "Size", value: trade.size !== null ? `${fmtNum(trade.size)} lots` : "—" },
                { label: "Time in trade", value: fmtDuration(new Date(trade.openedAt), trade.closedAt ? new Date(trade.closedAt) : null) },
              ].map((row) => (
                <div key={row.label} className="flex items-baseline justify-between gap-3">
                  <dt className="text-[11px] text-muted">{row.label}</dt>
                  <dd className="num text-[12px] font-medium">{row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="rounded-xl border border-line bg-panel-2/40 p-3.5">
            <h3 className="section-eyebrow">Result</h3>
            <p
              className={`num mt-2 text-[24px] font-semibold leading-none tracking-[-0.7px] ${
                trade.pnl > 0 ? "text-up" : trade.pnl < 0 ? "text-down" : "text-fg"
              }`}
            >
              {fmtSignedMoney(trade.pnl, trade.currency)}
            </p>
            <div className="mt-3 flex items-center justify-between text-[11px]">
              <span className="text-muted">R multiple</span>
              <span className="num font-medium">{fmtR(rMultiple)}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted">Planned R:R</span>
              <span className="num font-medium">{plannedRR === null ? "—" : `1 : ${plannedRR.toFixed(2)}`}</span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[11px]">
              <span className="text-muted">Planned risk</span>
              <span className="num font-medium">
                {trade.riskAmount !== null ? fmtMoney(trade.riskAmount, trade.currency) : "—"}
              </span>
            </div>
          </section>

          <section>
            <h3 className="section-eyebrow">Executions</h3>
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={() => plan && jumpTo(plan.entryIndex)}
                disabled={!plan}
                className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-panel-2/50 disabled:opacity-50"
              >
                <span className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-up" />
                  <span className="text-[11px] font-medium">Entry</span>
                </span>
                <span className="num text-[10px] text-muted">
                  {fmtTime(trade.openedAt)} · {fmtPrice(trade.entryPrice)}
                </span>
              </button>
              {trade.closedAt && (
                <button
                  type="button"
                  onClick={() => plan && jumpTo(plan.exitIndex)}
                  disabled={!plan}
                  className="flex w-full items-center justify-between gap-2 rounded-lg border border-line bg-white px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-panel-2/50 disabled:opacity-50"
                >
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-down" />
                    <span className="text-[11px] font-medium">Exit</span>
                  </span>
                  <span className="num text-[10px] text-muted">
                    {fmtTime(trade.closedAt)} · {fmtPrice(trade.exitPrice)}
                  </span>
                </button>
              )}
            </div>
          </section>

          <section>
            <h3 className="section-eyebrow">Chart legend</h3>
            <ul className="mt-3 space-y-2">
              {[
                { color: "#0781fe", label: "Entry" },
                { color: "#e16a76", label: "Stop loss" },
                { color: "#199b78", label: "Take profit" },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-2 text-[11px] text-muted">
                  <span className="h-0.5 w-4 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[10px] leading-relaxed text-dim">
              Candles come from your broker sync. The replay walks the chart bar by bar the way a trading terminal does.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}
