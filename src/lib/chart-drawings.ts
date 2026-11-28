import type {
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
} from "lightweight-charts";
import type { ChartDrawingKind, ChartDrawingPoint } from "@/db/schema";

/** A drawing on the chart. */
export type ChartDrawing = {
  /** Server id — 0 until the drawing has been saved. */
  id: number;
  /** Stable client key, so a selection survives the save round-trip. */
  key: string;
  kind: ChartDrawingKind;
  /** Anchors as { time, price }; the time is absolute (unix seconds). */
  points: ChartDrawingPoint[];
  color: string;
};

/** A drawing as the API returns it. */
export type ChartDrawingRow = Omit<ChartDrawing, "key">;

/** The tools in the drawing toolbar. */
export const CHART_DRAWING_TOOLS = ["cursor", "trendline", "hline", "rectangle", "eraser"] as const;
export type ChartDrawingTool = (typeof CHART_DRAWING_TOOLS)[number];

/** Colours offered for new drawings. */
export const CHART_DRAWING_COLORS = ["#0781fe", "#e16a76", "#199b78", "#e08c1a", "#7c5cd6"] as const;

/** How the host is told that the drawings changed. */
export type DrawingAction =
  | { type: "create"; drawing: ChartDrawing }
  | { type: "update"; drawing: ChartDrawing }
  | { type: "delete"; id: number }
  | { type: "clear" };

/** The canvas target lightweight-charts hands to a primitive renderer. */
type CanvasTarget = {
  useMediaCoordinateSpace<T>(
    scope: (space: { context: CanvasRenderingContext2D }) => T,
  ): T;
};

/** Turns an anchor into a position on the chart. */
export type DrawingResolver = (point: ChartDrawingPoint) => { x: number; y: number } | null;

/** A position on the chart. */
export type DrawingAnchor = { x: number; y: number };

/** What the pointer hit. `anchorIndex` is -1 when the body was hit. */
export type DrawingHit = { drawing: ChartDrawing; anchorIndex: number };

/** Half the size of a selection handle. */
const HANDLE_SIZE = 5;
/** How close the pointer must be to grab a drawing. */
const HIT_TOLERANCE = 6;

/** Turn a hex colour into a translucent version of it. */
export function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  if (value.length !== 6) return hex;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return hex;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Distance from a point to a line segment. */
function distanceToSegment(x: number, y: number, a: DrawingAnchor, b: DrawingAnchor): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSq = dx * dx + dy * dy;
  if (lengthSq === 0) return Math.hypot(x - a.x, y - a.y);
  let t = ((x - a.x) * dx + (y - a.y) * dy) / lengthSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(x - (a.x + t * dx), y - (a.y + t * dy));
}

/**
 * Draws the user's drawings straight onto the chart canvas: trend lines,
 * horizontal lines and rectangles. The anchors are kept in absolute time and
 * price, so a drawing keeps its place when the timeframe or the zoom changes.
 */
export class DrawingPrimitive implements ISeriesPrimitive<Time> {
  private _resolver: DrawingResolver;
  private _drawings: ChartDrawing[];
  private _preview: ChartDrawing | null = null;
  private _selectedKey: string | null = null;
  private _chart: SeriesAttachedParameter<Time>["chart"] | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _views: IPrimitivePaneView[];

  constructor(resolver: DrawingResolver, drawings: ChartDrawing[] = []) {
    this._resolver = resolver;
    this._drawings = drawings;
    const self = this;
    this._views = [
      {
        zOrder: () => "top",
        renderer: () => ({
          draw(target: CanvasTarget) {
            self._draw(target);
          },
        }),
      },
    ];
  }

  attached(param: SeriesAttachedParameter<Time>) {
    this._chart = param.chart;
    this._requestUpdate = param.requestUpdate;
  }

  detached() {
    this._chart = null;
    this._requestUpdate = null;
  }

  updateAllViews() {}

  paneViews() {
    return this._views;
  }

  /** The saved drawings. */
  setDrawings(drawings: ChartDrawing[]) {
    this._drawings = drawings;
    this._requestUpdate?.();
  }

  /** The drawing being dragged, drawn on top of the saved ones. */
  setPreview(drawing: ChartDrawing | null) {
    this._preview = drawing;
    this._requestUpdate?.();
  }

  getPreview(): ChartDrawing | null {
    return this._preview;
  }

  /** The drawing the user picked, shown with handles. */
  setSelected(key: string | null) {
    this._selectedKey = key;
    this._requestUpdate?.();
  }

  getSelected(): string | null {
    return this._selectedKey;
  }

  /** The screen position of every anchor of a drawing. */
  anchors(drawing: ChartDrawing): DrawingAnchor[] {
    const out: DrawingAnchor[] = [];
    for (const point of drawing.points) {
      const anchor = this._resolver(point);
      if (anchor) out.push(anchor);
    }
    return out;
  }

  /** The drawing under the pointer, or null when the pointer is on empty chart. */
  pick(x: number, y: number): DrawingHit | null {
    const selected = this._drawings.find((d) => d.key === this._selectedKey);
    if (selected) {
      const anchors = this.anchors(selected);
      for (let i = 0; i < anchors.length; i += 1) {
        if (
          Math.abs(anchors[i].x - x) <= HIT_TOLERANCE &&
          Math.abs(anchors[i].y - y) <= HIT_TOLERANCE
        ) {
          return { drawing: selected, anchorIndex: i };
        }
      }
    }

    /* The drawing drawn last sits on top, so hit-test backwards. */
    for (let i = this._drawings.length - 1; i >= 0; i -= 1) {
      const drawing = this._drawings[i];
      const anchors = this.anchors(drawing);
      if (anchors.length === 0) continue;
      if (drawing.kind === "hline") {
        if (Math.abs(anchors[0].y - y) <= HIT_TOLERANCE) return { drawing, anchorIndex: -1 };
        continue;
      }
      if (anchors.length < 2) continue;
      if (drawing.kind === "rectangle") {
        const left = Math.min(anchors[0].x, anchors[1].x);
        const right = Math.max(anchors[0].x, anchors[1].x);
        const top = Math.min(anchors[0].y, anchors[1].y);
        const bottom = Math.max(anchors[0].y, anchors[1].y);
        if (
          x >= left - HIT_TOLERANCE &&
          x <= right + HIT_TOLERANCE &&
          y >= top - HIT_TOLERANCE &&
          y <= bottom + HIT_TOLERANCE
        ) {
          return { drawing, anchorIndex: -1 };
        }
        continue;
      }
      if (distanceToSegment(x, y, anchors[0], anchors[1]) <= HIT_TOLERANCE) {
        return { drawing, anchorIndex: -1 };
      }
    }
    return null;
  }

  private _draw(target: CanvasTarget) {
    const chart = this._chart;
    if (!chart) return;
    const drawings = this._preview
      ? [...this._drawings, this._preview]
      : this._drawings;
    if (drawings.length === 0) return;
    const width = chart.timeScale().width();
    try {
      target.useMediaCoordinateSpace((scope) => {
        const ctx = scope.context;
        for (const drawing of drawings) {
          const anchors = this.anchors(drawing);
          if (anchors.length === 0) continue;
          ctx.save();
          ctx.strokeStyle = drawing.color;
          ctx.fillStyle = drawing.color;
          ctx.lineWidth = 2;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          if (drawing.kind === "hline") {
            const y = anchors[0].y;
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
          } else if (drawing.kind === "rectangle" && anchors.length >= 2) {
            const left = Math.min(anchors[0].x, anchors[1].x);
            const right = Math.max(anchors[0].x, anchors[1].x);
            const top = Math.min(anchors[0].y, anchors[1].y);
            const bottom = Math.max(anchors[0].y, anchors[1].y);
            ctx.fillStyle = withAlpha(drawing.color, 0.12);
            ctx.fillRect(left, top, right - left, bottom - top);
            ctx.strokeStyle = drawing.color;
            ctx.strokeRect(left, top, right - left, bottom - top);
          } else if (anchors.length >= 2) {
            ctx.beginPath();
            ctx.moveTo(anchors[0].x, anchors[0].y);
            ctx.lineTo(anchors[1].x, anchors[1].y);
            ctx.stroke();
          }

          /* The picked drawing shows its handles, so it can be moved. */
          if (drawing.key === this._selectedKey || drawing === this._preview) {
            ctx.fillStyle = "#ffffff";
            ctx.strokeStyle = drawing.color;
            ctx.lineWidth = 1.5;
            for (const anchor of anchors) {
              ctx.beginPath();
              ctx.rect(
                anchor.x - HANDLE_SIZE / 2,
                anchor.y - HANDLE_SIZE / 2,
                HANDLE_SIZE,
                HANDLE_SIZE,
              );
              ctx.fill();
              ctx.stroke();
            }
          }
          ctx.restore();
        }
      });
    } catch {
      // A drawing problem must never break the chart itself.
    }
  }
}
