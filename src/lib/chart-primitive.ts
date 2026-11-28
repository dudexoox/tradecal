import type {
  IPrimitivePaneView,
  ISeriesPrimitive,
  SeriesAttachedParameter,
  Time,
  UTCTimestamp,
} from "lightweight-charts";

/** The canvas target lightweight-charts hands to a primitive renderer. */
type CanvasTarget = {
  useMediaCoordinateSpace<T>(
    scope: (space: { context: CanvasRenderingContext2D }) => T,
  ): T;
};

/** A translucent zone drawn between two prices over a time span. */
export type ZoneBox = {
  fromTime: number;
  toTime: number;
  topPrice: number;
  bottomPrice: number;
  color: string;
  border?: string;
  label?: string;
};

/** Only the bits of a series the drawing needs. */
type PriceConverter = {
  priceToCoordinate(price: number): number | null;
};

/**
 * Draws the risk / reward zones of a trade straight onto the chart canvas.
 * TradingView's widget cannot do this, so the replay chart renders the plan
 * (stop zone and target zone) the way a trading terminal does.
 */
export class ZonePrimitive implements ISeriesPrimitive<Time> {
  private _series: PriceConverter;
  private _boxes: ZoneBox[];
  private _chart: SeriesAttachedParameter<Time>["chart"] | null = null;
  private _requestUpdate: (() => void) | null = null;
  private _views: IPrimitivePaneView[];

  constructor(series: PriceConverter, boxes: ZoneBox[]) {
    this._series = series;
    this._boxes = boxes;
    const self = this;
    this._views = [
      {
        zOrder: () => "bottom",
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

  setBoxes(boxes: ZoneBox[]) {
    this._boxes = boxes;
    this._requestUpdate?.();
  }

  private _draw(target: CanvasTarget) {
    const chart = this._chart;
    if (!chart || this._boxes.length === 0) return;
    const series = this._series;
    const timeScale = chart.timeScale();
    try {
      target.useMediaCoordinateSpace((scope) => {
        const ctx = scope.context;
        for (const box of this._boxes) {
          const x1 = timeScale.timeToCoordinate(box.fromTime as UTCTimestamp);
          const x2 = timeScale.timeToCoordinate(box.toTime as UTCTimestamp);
          const y1 = series.priceToCoordinate(box.topPrice);
          const y2 = series.priceToCoordinate(box.bottomPrice);
          if (x1 === null || x2 === null || y1 === null || y2 === null) continue;
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const top = Math.min(y1, y2);
          const bottom = Math.max(y1, y2);
          if (right <= left || bottom <= top) continue;
          ctx.save();
          ctx.fillStyle = box.color;
          ctx.fillRect(left, top, right - left, bottom - top);
          if (box.border) {
            ctx.strokeStyle = box.border;
            ctx.lineWidth = 1;
            ctx.strokeRect(left + 0.5, top + 0.5, right - left - 1, bottom - top - 1);
          }
          if (box.label) {
            ctx.fillStyle = box.border ?? box.color;
            ctx.font = "600 10px Inter, sans-serif";
            ctx.textBaseline = "bottom";
            ctx.fillText(box.label, left + 6, top + 12);
          }
          ctx.restore();
        }
      });
    } catch {
      // A drawing problem must never break the chart itself.
    }
  }
}
