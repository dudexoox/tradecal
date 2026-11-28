"use client";

import { useEffect, useRef, useState } from "react";
import type {
  AreaData,
  CandlestickData,
  CreatePriceLineOptions,
  IChartApi,
  IPriceLine,
  ISeriesApi,
  ISeriesMarkersPluginApi,
  LineData,
  SeriesMarker,
  Time,
  UTCTimestamp,
} from "lightweight-charts";
import { ZonePrimitive, type ZoneBox } from "@/lib/chart-primitive";
import {
  barIndexAt,
  moneyPerPriceUnit,
  REPLAY_WINDOW,
  runningPnlSeries,
  type ChartCandle,
  type ChartStyle,
  type ChartTradeMeta,
} from "@/lib/chart-workspace";

const THEME = {
  light: {
    bg: "#ffffff",
    grid: "#eef1f6",
    line: "#e9edf3",
    text: "#5b6577",
    up: "#199b78",
    down: "#e16a76",
    brand: "#0781fe",
    pnl: "#0781fe",
  },
  dark: {
    bg: "#0d1117",
    grid: "#1b2130",
    line: "#232a38",
    text: "#9aa4b5",
    up: "#26a69a",
    down: "#ef5350",
    brand: "#4c9ffe",
    pnl: "#4c9ffe",
  },
} as const;

export type ChartTheme = keyof typeof THEME;

/** LineStyle.Dashed — inlined so the module stays free of runtime imports. */
const LINE_STYLE_DASHED = 2;

/** UTC label for the time axis — the journal stores and shows UTC. */
function utcLabel(time: Time): string {
  if (typeof time !== "number") return String(time);
  const date = new Date(time * 1000);
  const day = date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", timeZone: "UTC" });
  const hours = date.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${day} ${hours}`;
}

/** The parts of a series the overlay code needs. */
type PriceLineHost = {
  createPriceLine(options: CreatePriceLineOptions): IPriceLine;
  removePriceLine(line: IPriceLine): void;
};

type Props = {
  candles: ChartCandle[];
  higherCandles?: ChartCandle[] | null;
  trade: ChartTradeMeta;
  style: ChartStyle;
  theme: ChartTheme;
  showZones: boolean;
  showRunningPnl: boolean;
  showHigher: boolean;
  /** Index of the last revealed bar; null shows the whole history. */
  cursor: number | null;
  /** Bumped by the host to ask the chart to fit its content again. */
  fitRequest?: number;
};

/**
 * The replay chart. Broker candles are drawn with lightweight-charts so the
 * trade can be walked bar by bar, with the entry and exit marked on the chart
 * and the plan (stop and target) shaded underneath.
 */
export function TradeChartCanvas({
  candles,
  higherCandles,
  trade,
  style,
  theme,
  showZones,
  showRunningPnl,
  showHigher,
  cursor,
  fitRequest,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const pnlRef = useRef<ISeriesApi<"Line"> | null>(null);
  const higherRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const zonesRef = useRef<ZonePrimitive | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);

  /* Build (or rebuild) the chart whenever the layout changes. The candles are
     pushed in by the effect below, so a new timeframe never rebuilds the
     chart (and never makes it flash). */
  useEffect(() => {
    let disposed = false;
    const container = containerRef.current;
    if (!container) return;

    const build = async () => {
      const lw = await import("lightweight-charts");
      if (disposed || !containerRef.current) return;
      const colors = THEME[theme];

      const chart = lw.createChart(containerRef.current, {
        autoSize: true,
        layout: {
          background: { type: lw.ColorType.Solid, color: colors.bg },
          textColor: colors.text,
          fontSize: 11,
          fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
          attributionLogo: true,
        },
        grid: {
          vertLines: { color: colors.grid },
          horzLines: { color: colors.grid },
        },
        rightPriceScale: { borderColor: colors.line, scaleMargins: { top: 0.12, bottom: 0.12 } },
        leftPriceScale: { visible: false },
        timeScale: {
          borderColor: colors.line,
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 6,
          barSpacing: 8,
        },
        crosshair: {
          mode: lw.CrosshairMode.Normal,
          vertLine: { color: colors.brand, width: 1, style: lw.LineStyle.Dashed, labelBackgroundColor: colors.brand },
          horzLine: { color: colors.brand, width: 1, style: lw.LineStyle.Dashed, labelBackgroundColor: colors.brand },
        },
        localization: { locale: "en-GB", timeFormatter: (time: Time) => utcLabel(time) },
      });
      chartRef.current = chart;

      /* main series */
      const main =
        style === "candles"
          ? chart.addSeries(
              lw.CandlestickSeries,
              {
                upColor: colors.up,
                downColor: colors.down,
                borderUpColor: colors.up,
                borderDownColor: colors.down,
                wickUpColor: colors.up,
                wickDownColor: colors.down,
                priceLineColor: colors.brand,
              },
              0,
            )
          : style === "line"
            ? chart.addSeries(
                lw.LineSeries,
                { color: colors.brand, lineWidth: 2, priceLineColor: colors.brand },
                0,
              )
            : chart.addSeries(
                lw.AreaSeries,
                {
                  lineColor: colors.brand,
                  topColor: "rgba(7,129,254,0.20)",
                  bottomColor: "rgba(7,129,254,0.02)",
                  lineWidth: 2,
                  priceLineColor: colors.brand,
                },
                0,
              );
      mainRef.current = main;

      zonesRef.current = new ZonePrimitive(main, []);
      main.attachPrimitive(zonesRef.current);

      /* running P&L pane */
      if (showRunningPnl) {
        const pnl = chart.addSeries(
          lw.LineSeries,
          {
            color: colors.pnl,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: true,
            priceScaleId: "left",
          },
          1,
        );
        chart.priceScale("left", 1).applyOptions({
          visible: true,
          borderColor: colors.line,
          scaleMargins: { top: 0.15, bottom: 0.15 },
        });
        pnlRef.current = pnl;
        chart.panes()[1]?.setHeight(130);
      }

      /* higher timeframe context pane */
      if (showHigher) {
        const pane = showRunningPnl ? 2 : 1;
        const higher = chart.addSeries(
          lw.CandlestickSeries,
          {
            upColor: colors.up,
            downColor: colors.down,
            borderUpColor: colors.up,
            borderDownColor: colors.down,
            wickUpColor: colors.up,
            wickDownColor: colors.down,
            priceLineVisible: false,
            lastValueVisible: false,
          },
          pane,
        );
        higherRef.current = higher;
        chart.panes()[pane]?.setHeight(130);
      }

      /* The markers ride on the top layer so the entry and exit arrows stay
         visible above the candles and the shaded plan. */
      markersRef.current = lw.createSeriesMarkers(main, [], { zOrder: "top" });
      setReady(true);
      setVersion((v) => v + 1);
    };

    void build();
    return () => {
      disposed = true;
      chartRef.current?.remove();
      chartRef.current = null;
      mainRef.current = null;
      markersRef.current = null;
      pnlRef.current = null;
      higherRef.current = null;
      zonesRef.current = null;
      linesRef.current = [];
      setReady(false);
    };
  }, [style, theme, showRunningPnl, showHigher]);

  /* Data, markers, plan lines and the visible window. */
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!ready || !chart || !main || candles.length === 0) return;

    const times = candles.map((c) => c.time as UTCTimestamp);
    if (style === "candles") {
      (main as ISeriesApi<"Candlestick">).setData(
        candles.map(
          (c): CandlestickData<Time> => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }),
        ),
      );
    } else if (style === "line") {
      (main as ISeriesApi<"Line">).setData(
        candles.map((c): LineData<Time> => ({ time: c.time as UTCTimestamp, value: c.close })),
      );
    } else {
      (main as ISeriesApi<"Area">).setData(
        candles.map((c): AreaData<Time> => ({ time: c.time as UTCTimestamp, value: c.close })),
      );
    }

    const higher = higherRef.current;
    if (higher && higherCandles && higherCandles.length > 0) {
      higher.setData(
        higherCandles.map(
          (c): CandlestickData<Time> => ({
            time: c.time as UTCTimestamp,
            open: c.open,
            high: c.high,
            low: c.low,
            close: c.close,
          }),
        ),
      );
    }

    /* plan lines: entry, stop and target */
    const host = main as unknown as PriceLineHost;
    for (const line of linesRef.current) {
      try {
        host.removePriceLine(line);
      } catch {
        // the series may already be gone
      }
    }
    linesRef.current = [];
    const colors = THEME[theme];
    const addLine = (price: number | null, color: string, title: string) => {
      if (price === null) return;
      linesRef.current.push(
        host.createPriceLine({
          price,
          color,
          lineWidth: 1,
          lineStyle: LINE_STYLE_DASHED,
          axisLabelVisible: true,
          title,
        }),
      );
    };
    addLine(trade.entryPrice, colors.brand, "Entry");
    addLine(trade.stopLoss, colors.down, "Stop");
    addLine(trade.takeProfit, colors.up, "Target");

    /* markers for the entry and the exit */
    const markers: SeriesMarker<Time>[] = [];
    const openSec = Math.floor(Date.parse(trade.openedAt) / 1000);
    const closeSec = trade.closedAt ? Math.floor(Date.parse(trade.closedAt) / 1000) : null;
    const entryIndex = Math.max(0, barIndexAt(candles, openSec));
    const exitIndex = closeSec === null ? candles.length - 1 : Math.max(entryIndex, barIndexAt(candles, closeSec));
    const revealed = cursor === null ? candles.length - 1 : cursor;
    if (entryIndex <= revealed) {
      markers.push({
        time: times[entryIndex],
        position: trade.direction === "long" ? "belowBar" : "aboveBar",
        shape: trade.direction === "long" ? "arrowUp" : "arrowDown",
        color: colors.up,
        text: "Entry",
        size: 1.4,
      });
    }
    if (closeSec !== null && exitIndex <= revealed) {
      markers.push({
        time: times[exitIndex],
        position: trade.direction === "long" ? "aboveBar" : "belowBar",
        shape: trade.direction === "long" ? "arrowDown" : "arrowUp",
        color: colors.down,
        text: "Exit",
        size: 1.4,
      });
    }
    markersRef.current?.setMarkers(markers);

    /* risk / reward zones */
    const zones = zonesRef.current;
    if (zones) {
      const entry = trade.entryPrice;
      const stop = trade.stopLoss;
      const target = trade.takeProfit;
      const boxes: ZoneBox[] = [];
      const fromTime = times[entryIndex];
      const toTime = times[Math.min(revealed, exitIndex)];
      if (entry !== null && stop !== null && target !== null && fromTime !== undefined && toTime !== undefined) {
        boxes.push({
          fromTime,
          toTime,
          topPrice: Math.max(entry, stop),
          bottomPrice: Math.min(entry, stop),
          color: "rgba(225,106,118,0.13)",
          border: "rgba(225,106,118,0.45)",
          label: "Risk",
        });
        boxes.push({
          fromTime,
          toTime,
          topPrice: Math.max(entry, target),
          bottomPrice: Math.min(entry, target),
          color: "rgba(25,155,120,0.13)",
          border: "rgba(25,155,120,0.45)",
          label: "Reward",
        });
      } else if (entry !== null && trade.exitPrice !== null && fromTime !== undefined && toTime !== undefined) {
        const win = trade.pnl >= 0;
        boxes.push({
          fromTime,
          toTime,
          topPrice: Math.max(entry, trade.exitPrice),
          bottomPrice: Math.min(entry, trade.exitPrice),
          color: win ? "rgba(25,155,120,0.12)" : "rgba(225,106,118,0.12)",
          border: win ? "rgba(25,155,120,0.4)" : "rgba(225,106,118,0.4)",
          label: win ? "Profit" : "Loss",
        });
      }
      zones.setBoxes(showZones ? boxes : []);
    }

    /* running P&L line */
    const pnl = pnlRef.current;
    if (pnl) {
      const unit = moneyPerPriceUnit(trade);
      const series = runningPnlSeries(candles, trade);
      if (unit === null || series.length === 0) {
        pnl.setData([]);
      } else {
        const edge = times[revealed] ?? series[series.length - 1].time;
        const visible = series.filter((point) => point.time <= edge);
        pnl.setData(
          visible.map((point): LineData<Time> => ({ time: point.time as UTCTimestamp, value: point.value })),
        );
      }
    }

    /* visible window */
    const last = cursor === null ? candles.length - 1 : Math.min(cursor, candles.length - 1);
    const first = cursor === null ? Math.max(0, entryIndex - 45) : Math.max(0, last - REPLAY_WINDOW);
    const from = times[first];
    const to = times[last];
    if (from !== undefined && to !== undefined) {
      chart.timeScale().setVisibleRange({ from, to });
    }
  }, [ready, version, cursor, candles, higherCandles, style, theme, trade, showZones]);

  /* Fit content on demand. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart || !fitRequest) return;
    chart.timeScale().fitContent();
  }, [ready, version, fitRequest]);

  return <div ref={containerRef} className="h-full w-full" />;
}
