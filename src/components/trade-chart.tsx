"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  IChartApi,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { Icon } from "./icons";

const TIMEFRAMES = ["M5", "M15", "H1", "H4", "D1"] as const;
type Timeframe = (typeof TIMEFRAMES)[number];

const BAR_SECONDS: Record<Timeframe, number> = { M5: 300, M15: 900, H1: 3600, H4: 14400, D1: 86400 };

/** App palette (see globals.css). */
const UP = "#199b78";
const DOWN = "#e16a76";
const BRAND = "#0781fe";
const MUTED = "#7c879a";
const LINE = "#e9edf3";
const GRID = "#eef1f6";

type Candle = { time: number; open: number; high: number; low: number; close: number };

export type TradeChartTrade = {
  id: number;
  symbol: string;
  direction: "long" | "short";
  openedAt: string;
  closedAt: string | null;
  entryPrice: number | null;
  exitPrice: number | null;
};

/** Default view follows the trade's duration: scalp -> M5, intraday -> M15, swing -> H1/H4. */
function defaultTimeframe(trade: TradeChartTrade): Timeframe {
  const open = Date.parse(trade.openedAt);
  const end = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const hours = Math.max(0, (end - open) / 3_600_000);
  if (hours <= 1) return "M5";
  if (hours <= 6) return "M15";
  if (hours <= 48) return "H1";
  return "H4";
}

/** Closest existing candle to an instant — markers must sit on a real bar. */
function snapToCandle(candles: Candle[], seconds: number): number {
  let best = candles[0].time;
  let bestDist = Math.abs(best - seconds);
  for (const c of candles) {
    const dist = Math.abs(c.time - seconds);
    if (dist < bestDist) {
      best = c.time;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * Interactive chart pinned to the moment the trade was taken: candles come
 * from the broker (synced into chart_candles by the desktop agent), markers
 * flag entry and exit, and the timeframe switcher re-frames the same trade.
 */
export function TradeChart({ trade }: { trade: TradeChartTrade }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const libRef = useRef<typeof import("lightweight-charts") | null>(null);

  const [ready, setReady] = useState(false);
  const [tf, setTf] = useState<Timeframe>(() => defaultTimeframe(trade));
  /** Last completed fetch; null until one lands (also covers tf switches). */
  const [fetched, setFetched] = useState<{ tf: Timeframe; candles: Candle[]; error: string | null } | null>(null);

  /* Create the chart once; the library is loaded lazily so it never runs
     during server rendering of this client component. */
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let disposed = false;
    let chart: IChartApi | null = null;
    void (async () => {
      const lib = await import("lightweight-charts");
      if (disposed) return;
      libRef.current = lib;
      chart = lib.createChart(container, {
        autoSize: true,
        layout: {
          background: { type: lib.ColorType.Solid, color: "#ffffff" },
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 11,
          textColor: MUTED,
          // TradingView attribution stays on (lightweight-charts license).
          attributionLogo: true,
        },
        grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
        rightPriceScale: { borderColor: LINE },
        timeScale: { borderColor: LINE, timeVisible: true, secondsVisible: false, rightOffset: 4 },
        crosshair: {
          mode: lib.CrosshairMode.Normal,
          vertLine: { color: "#b7c0cd", width: 1, style: lib.LineStyle.Dashed, labelBackgroundColor: BRAND },
          horzLine: { color: "#b7c0cd", width: 1, style: lib.LineStyle.Dashed, labelBackgroundColor: BRAND },
        },
      });
      const series = chart.addSeries(lib.CandlestickSeries, {
        upColor: UP,
        downColor: DOWN,
        borderUpColor: UP,
        borderDownColor: DOWN,
        wickUpColor: UP,
        wickDownColor: DOWN,
      });
      chartRef.current = chart;
      seriesRef.current = series;
      markersRef.current = lib.createSeriesMarkers(series, []);
      setReady(true);
    })();
    return () => {
      disposed = true;
      libRef.current = null;
      markersRef.current = null;
      seriesRef.current = null;
      chartRef.current = null;
      setReady(false);
      if (chart) {
        chart.remove();
        chart = null;
      }
    };
  }, []);

  /* Fetch candles for the selected timeframe (aborts when tf changes).
     The loading state is derived — a fetch for the current tf that has not
     landed yet means "loading" — so no setState runs synchronously here. */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch(`/api/trades/${trade.id}/chart?tf=${tf}`, { signal: controller.signal });
        if (!res.ok) throw new Error(res.status === 404 ? "Trade not found" : "Chart unavailable");
        const data = (await res.json()) as { candles?: Candle[] };
        if (controller.signal.aborted) return;
        setFetched({ tf, candles: Array.isArray(data.candles) ? data.candles : [], error: null });
      } catch (err) {
        if (controller.signal.aborted) return;
        setFetched({ tf, candles: [], error: err instanceof Error && err.message ? err.message : "Chart unavailable" });
      }
    })();
    return () => controller.abort();
  }, [trade.id, tf]);

  const state = fetched && fetched.tf === tf ? fetched : null;
  const candles = state?.candles ?? null;
  const error = state?.error ?? null;

  /* Push candles, markers and price lines into the chart, then frame the trade. */
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    const lib = libRef.current;
    if (!ready || !chart || !series || !lib) return;

    for (const line of series.priceLines()) series.removePriceLine(line);
    series.setData([]);
    markersRef.current?.setMarkers([]);
    if (!candles || candles.length === 0) return;

    series.setData(
      candles.map((c) => ({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close })),
    );

    const openSec = Math.floor(Date.parse(trade.openedAt) / 1000);
    const closeSec = trade.closedAt ? Math.floor(Date.parse(trade.closedAt) / 1000) : null;
    const long = trade.direction === "long";
    const markers: SeriesMarker<Time>[] = [
      {
        time: snapToCandle(candles, openSec) as UTCTimestamp,
        position: long ? "belowBar" : "aboveBar",
        color: long ? UP : DOWN,
        shape: long ? "arrowUp" : "arrowDown",
        text: "Entry",
      },
    ];
    if (closeSec !== null) {
      markers.push({
        time: snapToCandle(candles, closeSec) as UTCTimestamp,
        position: long ? "aboveBar" : "belowBar",
        color: MUTED,
        shape: long ? "arrowDown" : "arrowUp",
        text: "Exit",
      });
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    markersRef.current?.setMarkers(markers);

    if (trade.entryPrice !== null && Number.isFinite(trade.entryPrice)) {
      series.createPriceLine({
        price: trade.entryPrice,
        color: BRAND,
        lineWidth: 1,
        lineStyle: lib.LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Entry",
      });
    }
    if (trade.exitPrice !== null && Number.isFinite(trade.exitPrice)) {
      series.createPriceLine({
        price: trade.exitPrice,
        color: MUTED,
        lineWidth: 1,
        lineStyle: lib.LineStyle.Dotted,
        axisLabelVisible: true,
        title: "Exit",
      });
    }

    // Frame the visible window around the trade, with breathing room.
    const first = candles[0].time;
    const last = candles[candles.length - 1].time;
    const endSec = closeSec ?? Math.floor(Date.now() / 1000);
    const span = Math.max(endSec - openSec, BAR_SECONDS[tf] * 12);
    const pad = Math.round(span * 0.4);
    const from = Math.max(first, Math.min(openSec - pad, last));
    const to = Math.min(last, Math.max(endSec + pad, first));
    if (from < to) chart.timeScale().setVisibleRange({ from: from as UTCTimestamp, to: to as UTCTimestamp });
  }, [ready, candles, trade, tf]);

  /* Download the current view as a PNG snapshot. */
  const savePng = useCallback(() => {
    const chart = chartRef.current;
    if (!chart || !candles?.length) return;
    const canvas = chart.takeScreenshot();
    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = `${trade.symbol}-${tf}-${new Date().toISOString().slice(0, 10)}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
      "image/png",
    );
  }, [candles, tf, trade.symbol]);

  const loading = candles === null;
  const empty = !loading && !error && candles?.length === 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
        <div className="flex items-center gap-2.5">
          <Icon name="chart" size={17} className="text-brand" />
          <h2 className="text-sm font-semibold">Chart snapshot</h2>
          <span className="subtle-tag">Pinned to entry</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg border border-line bg-panel-2 p-1" role="group" aria-label="Chart timeframe">
            {TIMEFRAMES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                aria-pressed={t === tf}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  t === tf ? "bg-white text-brand shadow-[0_1px_2px_rgba(24,36,59,0.08)]" : "text-muted hover:text-fg"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={savePng}
            disabled={!candles?.length}
            title="Save chart as PNG"
            aria-label="Save chart as PNG"
            className="icon-button disabled:opacity-40"
          >
            <Icon name="download" size={15} />
          </button>
        </div>
      </div>
      <div className="p-4">
        <div className="relative h-[320px] w-full overflow-hidden rounded-lg border border-line bg-white">
          <div ref={containerRef} className="absolute inset-0" />
          {(loading || error || empty) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-white/95 px-6 text-center">
              {loading ? (
                <>
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-brand" />
                  <span className="text-xs font-medium text-muted">Loading {tf} candles…</span>
                </>
              ) : error ? (
                <>
                  <Icon name="info" size={22} className="text-dim" />
                  <span className="text-xs font-medium text-muted">{error}</span>
                  <span className="text-[10px] text-dim">Try again after the next MT5 sync.</span>
                </>
              ) : (
                <>
                  <Icon name="chart" size={22} className="text-dim" />
                  <span className="text-xs font-medium text-muted">No {tf} data for this symbol yet</span>
                  <span className="text-[10px] leading-relaxed text-dim">
                    Candles arrive with the next MT5 sync from your terminal.
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        <p className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-dim">
          <span>
            {trade.symbol} · {tf} · broker history via MetaTrader 5
          </span>
          <span>Drag to pan · scroll to zoom</span>
        </p>
      </div>
    </section>
  );
}
