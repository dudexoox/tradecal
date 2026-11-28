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
  CHART_DRAWING_COLORS,
  DrawingPrimitive,
  type ChartDrawing,
  type ChartDrawingTool,
  type DrawingAction,
} from "@/lib/chart-drawings";
import {
  barIndexAt,
  nearestBarTime,
  REPLAY_WINDOW,
  type ChartCandle,
  type ChartStyle,
  type ChartTradeMeta,
} from "@/lib/chart-workspace";
import { Icon, type IconName } from "./icons";

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
  trade: ChartTradeMeta;
  style: ChartStyle;
  theme: ChartTheme;
  showZones: boolean;
  /** Index of the last revealed bar; null shows the whole history. */
  cursor: number | null;
  /** Bumped by the host to ask the chart to fit its content again. */
  fitRequest?: number;
  /** The drawings the user made on this trade. */
  drawings: ChartDrawing[];
  /** Called whenever the user adds, moves or removes a drawing. */
  onDrawingsChange: (drawings: ChartDrawing[], action: DrawingAction) => void;
};

/** The tools in the drawing toolbar, in the order they are shown. */
const TOOLS: { id: ChartDrawingTool; label: string; icon: IconName }[] = [
  { id: "cursor", label: "Select and move drawings", icon: "cursor" },
  { id: "trendline", label: "Trend line", icon: "trendline" },
  { id: "hline", label: "Horizontal line", icon: "hline" },
  { id: "rectangle", label: "Rectangle", icon: "rectangle" },
  { id: "eraser", label: "Erase a drawing", icon: "eraser" },
];

/** What the pointer is doing right now. */
type DragState =
  | { kind: "create"; tool: "trendline" | "rectangle"; start: { time: number; price: number } }
  | {
      kind: "move";
      key: string;
      start: { time: number; price: number };
      points: { time: number; price: number }[];
    }
  | { kind: "resize"; key: string; anchorIndex: number };

/** A key for a drawing that has not been saved yet. */
let drawingCounter = 0;
function newDrawingKey(): string {
  drawingCounter += 1;
  return `new-${drawingCounter}`;
}

/**
 * The replay chart. Broker candles are drawn with lightweight-charts so the
 * trade can be walked bar by bar, with the entry and exit marked on the chart
 * and the plan (stop and target) shaded underneath. A drawing toolbar on the
 * left lets the user mark up the chart.
 */
export function TradeChartCanvas({
  candles,
  trade,
  style,
  theme,
  showZones,
  cursor,
  fitRequest,
  drawings,
  onDrawingsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const mainRef = useRef<ISeriesApi<"Candlestick"> | ISeriesApi<"Line"> | ISeriesApi<"Area"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const zonesRef = useRef<ZonePrimitive | null>(null);
  const drawingRef = useRef<DrawingPrimitive | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const candlesRef = useRef<ChartCandle[]>(candles);
  const dragRef = useRef<DragState | null>(null);
  const [ready, setReady] = useState(false);
  const [version, setVersion] = useState(0);
  const [tool, setTool] = useState<ChartDrawingTool>("cursor");
  const [color, setColor] = useState<string>(CHART_DRAWING_COLORS[0]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

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

      /* The user's drawings ride on the top layer, above the candles. */
      const drawings = new DrawingPrimitive((point) => {
        const currentChart = chartRef.current;
        const currentMain = mainRef.current;
        const bars = candlesRef.current;
        if (!currentChart || !currentMain || bars.length === 0) return null;
        const time = nearestBarTime(bars, point.time);
        const x = currentChart.timeScale().timeToCoordinate(time as UTCTimestamp);
        const y = currentMain.priceToCoordinate(point.price);
        if (x === null || y === null) return null;
        return { x, y };
      }, []);
      main.attachPrimitive(drawings);
      drawingRef.current = drawings;

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
      zonesRef.current = null;
      drawingRef.current = null;
      linesRef.current = [];
      dragRef.current = null;
      setReady(false);
    };
  }, [style, theme]);

  /* Data, markers, plan lines and the visible window. */
  useEffect(() => {
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!ready || !chart || !main || candles.length === 0) return;
    candlesRef.current = candles;

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

    /* visible window */
    const last = cursor === null ? candles.length - 1 : Math.min(cursor, candles.length - 1);
    const first = cursor === null ? Math.max(0, entryIndex - 45) : Math.max(0, last - REPLAY_WINDOW);
    const from = times[first];
    const to = times[last];
    if (from !== undefined && to !== undefined) {
      chart.timeScale().setVisibleRange({ from, to });
    }
  }, [ready, version, cursor, candles, style, theme, trade, showZones]);

  /* The drawings follow the saved list. */
  useEffect(() => {
    drawingRef.current?.setDrawings(drawings);
  }, [drawings, ready, version]);

  /* The picked drawing shows its handles. */
  useEffect(() => {
    drawingRef.current?.setSelected(selectedKey);
  }, [selectedKey, ready, version]);

  /* Drawing tools: create, move, resize and erase. */
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    const main = mainRef.current;
    if (!container || !chart || !main || !ready) return;

    /** The pointer in the chart's own coordinates. */
    const pointAt = (event: MouseEvent) => {
      const pane = chart.panes()[0]?.getHTMLElement();
      if (!pane) return null;
      const rect = pane.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return null;
      const price = main.coordinateToPrice(y);
      if (price === null) return null;
      const bars = candlesRef.current;
      const rawTime = chart.timeScale().coordinateToTime(x);
      const seconds = typeof rawTime === "number" ? rawTime : Math.floor(Date.now() / 1000);
      return { x, y, price, time: nearestBarTime(bars, seconds) };
    };

    const onMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      const pos = pointAt(event);
      if (!pos) return;
      const primitive = drawingRef.current;
      container.focus({ preventScroll: true });

      if (tool === "eraser") {
        /* Keep the chart from panning while erasing. */
        event.stopPropagation();
        const hit = primitive?.pick(pos.x, pos.y);
        if (!hit) return;
        setSelectedKey(null);
        onDrawingsChange(
          drawings.filter((d) => d.key !== hit.drawing.key),
          { type: "delete", id: hit.drawing.id },
        );
        return;
      }

      if (tool === "hline") {
        event.stopPropagation();
        event.preventDefault();
        const drawing: ChartDrawing = {
          id: 0,
          key: newDrawingKey(),
          kind: "hline",
          points: [{ time: pos.time, price: pos.price }],
          color,
        };
        onDrawingsChange([...drawings, drawing], { type: "create", drawing });
        return;
      }

      if (tool === "trendline" || tool === "rectangle") {
        event.stopPropagation();
        event.preventDefault();
        dragRef.current = { kind: "create", tool, start: { time: pos.time, price: pos.price } };
        primitive?.setPreview({
          id: 0,
          key: "preview",
          kind: tool,
          points: [
            { time: pos.time, price: pos.price },
            { time: pos.time, price: pos.price },
          ],
          color,
        });
        return;
      }

      /* The cursor picks a drawing, one of its handles, or clears the pick. */
      const hit = primitive?.pick(pos.x, pos.y) ?? null;
      if (!hit) {
        setSelectedKey(null);
        return;
      }
      setSelectedKey(hit.drawing.key);
      if (hit.anchorIndex >= 0) {
        dragRef.current = { kind: "resize", key: hit.drawing.key, anchorIndex: hit.anchorIndex };
      } else {
        dragRef.current = {
          kind: "move",
          key: hit.drawing.key,
          start: { time: pos.time, price: pos.price },
          points: hit.drawing.points,
        };
      }
      /* The chart must not pan while a drawing is dragged. */
      chart.applyOptions({ handleScroll: { pressedMouseMove: false } });
    };

    const onMouseMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const pos = pointAt(event);
      if (!pos) return;
      const primitive = drawingRef.current;

      if (drag.kind === "create") {
        primitive?.setPreview({
          id: 0,
          key: "preview",
          kind: drag.tool,
          points: [drag.start, { time: pos.time, price: pos.price }],
          color,
        });
        return;
      }

      const drawing = drawings.find((d) => d.key === drag.key);
      if (!drawing) return;

      if (drag.kind === "resize") {
        primitive?.setPreview({
          ...drawing,
          points: drawing.points.map((point, index) =>
            index === drag.anchorIndex ? { time: pos.time, price: pos.price } : point,
          ),
        });
        return;
      }

      /* Moving keeps the shape and shifts every anchor by the same amount. */
      const movePrice = pos.price - drag.start.price;
      const moveTime = pos.time - drag.start.time;
      primitive?.setPreview({
        ...drawing,
        points: drag.points.map((point) => ({
          time: drawing.kind === "hline" ? point.time : nearestBarTime(candlesRef.current, point.time + moveTime),
          price: point.price + movePrice,
        })),
      });
    };

    const finishDrag = () => {
      const drag = dragRef.current;
      dragRef.current = null;
      chart.applyOptions({ handleScroll: { pressedMouseMove: true } });
      const preview = drawingRef.current?.getPreview() ?? null;
      drawingRef.current?.setPreview(null);
      if (!drag || !preview) return;

      if (drag.kind === "create") {
        const start = drag.start;
        const end = preview.points[preview.points.length - 1];
        if (start.time === end.time && Math.abs(start.price - end.price) < 1e-9) return;
        const drawing: ChartDrawing = {
          id: 0,
          key: newDrawingKey(),
          kind: preview.kind,
          points: preview.points,
          color,
        };
        onDrawingsChange([...drawings, drawing], { type: "create", drawing });
        return;
      }

      const drawing = drawings.find((d) => d.key === drag.key);
      if (!drawing) return;
      const moved = preview.points.some(
        (point, index) =>
          point.price !== drawing.points[index]?.price || point.time !== drawing.points[index]?.time,
      );
      if (!moved) return;
      const next = { ...drawing, points: preview.points };
      onDrawingsChange(
        drawings.map((d) => (d.key === drag.key ? next : d)),
        { type: "update", drawing: next },
      );
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.tagName === "INPUT" || active.tagName === "TEXTAREA" || active.isContentEditable)
      ) {
        return;
      }
      const drawing = drawings.find((d) => d.key === selectedKey);
      if (!drawing) return;
      event.preventDefault();
      setSelectedKey(null);
      onDrawingsChange(
        drawings.filter((d) => d.key !== drawing.key),
        { type: "delete", id: drawing.id },
      );
    };

    /* The capture phase lets the drawing tools take the mouse before the
       chart sees it, so the chart never pans while a shape is drawn. */
    container.addEventListener("mousedown", onMouseDown, true);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", finishDrag);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      container.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", finishDrag);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [ready, version, tool, color, drawings, candles, selectedKey, onDrawingsChange]);

  /* Fit content on demand. */
  useEffect(() => {
    const chart = chartRef.current;
    if (!ready || !chart || !fitRequest) return;
    chart.timeScale().fitContent();
  }, [ready, version, fitRequest]);

  const removeAll = () => {
    setSelectedKey(null);
    onDrawingsChange([], { type: "clear" });
  };

  const cycleColor = () => {
    const index = CHART_DRAWING_COLORS.indexOf(color as (typeof CHART_DRAWING_COLORS)[number]);
    setColor(CHART_DRAWING_COLORS[(index + 1) % CHART_DRAWING_COLORS.length]);
  };

  return (
    <div className="relative h-full w-full">
      <div
        ref={containerRef}
        tabIndex={0}
        aria-label="Replay chart. Use the drawing toolbar on the left to mark up the chart."
        className="h-full w-full outline-none"
      />

      {/* ------------------------------------------------- drawing toolbar */}
      <div className="absolute left-2 top-2 z-20 flex flex-col items-center gap-0.5 rounded-xl border border-line bg-white/95 p-1 shadow-sm backdrop-blur">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTool(entry.id)}
            title={entry.label}
            aria-label={entry.label}
            aria-pressed={tool === entry.id}
            className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
              tool === entry.id
                ? "bg-brand text-white"
                : "text-muted hover:bg-panel-2 hover:text-fg"
            }`}
          >
            <Icon name={entry.icon} size={14} />
          </button>
        ))}

        <span className="my-0.5 h-px w-5 bg-line-2" />

        <button
          type="button"
          onClick={cycleColor}
          title="Drawing colour"
          aria-label="Change the drawing colour"
          className="flex h-7 w-7 items-center justify-center rounded-lg transition-colors hover:bg-panel-2"
        >
          <span
            className="h-3.5 w-3.5 rounded-full ring-1 ring-black/10"
            style={{ backgroundColor: color }}
          />
        </button>

        <button
          type="button"
          onClick={removeAll}
          disabled={drawings.length === 0}
          title="Remove every drawing"
          aria-label="Remove every drawing"
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-panel-2 hover:text-down disabled:opacity-35"
        >
          <Icon name="trash" size={14} />
        </button>
      </div>
    </div>
  );
}
