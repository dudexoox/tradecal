"use client";

import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TvChartType,
  TvInterval,
  TvTheme,
  TvTimezone,
} from "@/db/schema";
import { Icon } from "./icons";
import type { TradeChartTrade } from "./trade-chart";

const WIDGET_SCRIPT = "https://widgets.tradingview-widget.com/w/en/tv-advanced-chart.js";
const WIDGET_TAG = "tv-advanced-chart";

const INTERVALS: { value: TvInterval; label: string }[] = [
  { value: "1", label: "1 min" },
  { value: "3", label: "3 min" },
  { value: "5", label: "5 min" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 hour" },
  { value: "120", label: "2 hours" },
  { value: "180", label: "3 hours" },
  { value: "240", label: "4 hours" },
  { value: "D", label: "1 day" },
  { value: "W", label: "1 week" },
];

const CHART_TYPES: { value: TvChartType; label: string }[] = [
  { value: "candles", label: "Candles" },
  { value: "bars", label: "Bars" },
  { value: "hollow-candles", label: "Hollow candles" },
  { value: "heikin-ashi", label: "Heikin Ashi" },
  { value: "line", label: "Line" },
  { value: "area", label: "Area" },
];

const THEMES: { value: TvTheme; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
];

const TIMEZONES: { value: TvTimezone; label: string }[] = [
  { value: "Etc/UTC", label: "UTC" },
  { value: "exchange", label: "Exchange" },
];

type Settings = {
  interval: TvInterval;
  theme: TvTheme;
  chartType: TvChartType;
  timezone: TvTimezone;
  showDrawingToolbar: boolean;
};

const DEFAULTS: Settings = {
  interval: "15",
  theme: "light",
  chartType: "candles",
  timezone: "Etc/UTC",
  showDrawingToolbar: true,
};

/** Broker symbols differ from TradingView's; keep the chart on the same market. */
export function toTradingViewSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/\s+/g, "");
  if (!s) return s;
  if (s.includes(":")) return s;

  if (s.startsWith("XAUUSD")) return "OANDA:XAUUSD";
  if (s.startsWith("XAGUSD")) return "OANDA:XAGUSD";
  if (/^(NAS|US100|NDX)/.test(s)) return "OANDA:NAS100USD";
  if (/^(US500|SP500|SPX)/.test(s)) return "SP:SPX";
  if (/^(US30|DOW|DJI)/.test(s)) return "OANDA:US30USD";
  if (/^(BTC|ETH|SOL)/.test(s)) return `OANDA:${s}`;

  for (const pair of [
    "EURUSD", "GBPUSD", "USDJPY", "USDCHF", "USDCAD",
    "AUDUSD", "NZDUSD", "EURJPY", "GBPJPY", "EURGBP",
  ]) {
    if (s.startsWith(pair)) return `OANDA:${pair}`;
  }
  return /^[A-Z]{6}$/.test(s) ? `OANDA:${s}` : s;
}

/** No saved setup yet: start where the pinned snapshot would start. */
function defaultInterval(trade: TradeChartTrade): TvInterval {
  const open = Date.parse(trade.openedAt);
  const end = trade.closedAt ? Date.parse(trade.closedAt) : Date.now();
  const hours = Math.max(0, (end - open) / 3_600_000);
  if (hours <= 1) return "5";
  if (hours <= 6) return "15";
  if (hours <= 48) return "60";
  return "240";
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && values.includes(value as T);
}

function setBoolAttribute(el: HTMLElement, name: string, value: boolean) {
  if (value) el.setAttribute(name, "");
  else el.removeAttribute(name);
}

/** TradingView web components use kebab-case attributes (chartType -> chart-type). */
function applyWidgetAttributes(el: HTMLElement, symbol: string, settings: Settings) {
  el.setAttribute("symbol", symbol);
  el.setAttribute("interval", settings.interval);
  el.setAttribute("theme", settings.theme);
  el.setAttribute("chart-type", settings.chartType);
  el.setAttribute("timezone", settings.timezone);
  setBoolAttribute(el, "show-drawing-toolbar", settings.showDrawingToolbar);
}

/**
 * Full TradingView Advanced Chart on the trade page. The widget supplies the
 * drawing tools, indicators and chart settings; we persist only the wrapper
 * options TradingView exposes as live attributes.
 */
export function TradeAnalyze({ trade }: { trade: TradeChartTrade }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetRef = useRef<HTMLElement | null>(null);
  const [scriptReady, setScriptReady] = useState(
    () => typeof customElements !== "undefined" && Boolean(customElements.get(WIDGET_TAG)),
  );
  const [settings, setSettings] = useState<Settings>({ ...DEFAULTS, interval: defaultInterval(trade) });
  const [loaded, setLoaded] = useState(false);
  const [hasSaved, setHasSaved] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const tvSymbol = toTradingViewSymbol(trade.symbol);
  const settingsRef = useRef(settings);
  const symbolRef = useRef(tvSymbol);

  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);
  useEffect(() => {
    symbolRef.current = tvSymbol;
  }, [tvSymbol]);

  /* The widget script is a module; wait for the custom element definition
     whether Script loaded it now or it was already cached on the page. */
  useEffect(() => {
    if (customElements.get(WIDGET_TAG)) return;
    let cancelled = false;
    void customElements.whenDefined(WIDGET_TAG).then(() => {
      if (!cancelled) setScriptReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const res = await fetch("/api/chart-preferences", { signal: controller.signal });
        if (!res.ok) throw new Error("Could not load saved chart setup");
        const data = (await res.json()) as { preferences?: Partial<Settings> | null };
        const p = data.preferences;
        if (controller.signal.aborted) return;
        setHasSaved(Boolean(p));
        if (!p) return;
        setSettings({
          interval: oneOf(INTERVALS.map((i) => i.value), p.interval) ? p.interval : defaultInterval(trade),
          theme: oneOf(THEMES.map((t) => t.value), p.theme) ? p.theme : DEFAULTS.theme,
          chartType: oneOf(CHART_TYPES.map((c) => c.value), p.chartType) ? p.chartType : DEFAULTS.chartType,
          timezone: oneOf(TIMEZONES.map((t) => t.value), p.timezone) ? p.timezone : DEFAULTS.timezone,
          showDrawingToolbar: typeof p.showDrawingToolbar === "boolean" ? p.showDrawingToolbar : DEFAULTS.showDrawingToolbar,
        });
        setDirty(false);
      } catch {
        // Defaults still give a usable chart; saving later reports real errors.
      } finally {
        if (!controller.signal.aborted) setLoaded(true);
      }
    })();
    return () => controller.abort();
  }, [trade]);

  useEffect(() => {
    const container = containerRef.current;
    if (!scriptReady || !container) return;
    const initial = settingsRef.current;
    const el = document.createElement(WIDGET_TAG);
    applyWidgetAttributes(el, symbolRef.current, initial);
    el.style.display = "block";
    el.style.width = "100%";
    el.style.height = "100%";
    container.appendChild(el);
    widgetRef.current = el;
    return () => {
      el.remove();
      widgetRef.current = null;
    };
    // Recreate only when the script arrives; attribute changes are applied below.
  }, [scriptReady]);

  useEffect(() => {
    const el = widgetRef.current;
    if (!el) return;
    applyWidgetAttributes(el, tvSymbol, settings);
  }, [settings, tvSymbol, scriptReady]);

  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
    setMessage(null);
  };

  const save = useCallback(
    async (next: Settings = settings) => {
      setSaving(true);
      setMessage(null);
      try {
        const res = await fetch("/api/chart-preferences", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(next),
        });
        if (!res.ok) throw new Error(res.status === 401 ? "Sign in required" : "Could not save chart setup");
        setSettings(next);
        setHasSaved(true);
        setDirty(false);
        setMessage("Chart setup saved for all your trades.");
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Could not save chart setup");
      } finally {
        setSaving(false);
      }
    },
    [settings],
  );

  const reset = () => {
    const next = { ...DEFAULTS, interval: defaultInterval(trade) };
    setSettings(next);
    setDirty(true);
    void save(next);
  };

  return (
    <div className="p-4">
      <Script id="tv-advanced-chart-script" src={WIDGET_SCRIPT} strategy="afterInteractive" type="module" />

      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-line bg-panel-2/40 p-2.5">
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
          Interval
          <select
            aria-label="TradingView chart interval"
            className="h-8 rounded-md border border-line-2 bg-white px-2 text-[11px] font-semibold text-fg outline-none focus:border-brand"
            value={settings.interval}
            onChange={(e) => update("interval", e.target.value as TvInterval)}
          >
            {INTERVALS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
          Style
          <select
            aria-label="TradingView chart style"
            className="h-8 rounded-md border border-line-2 bg-white px-2 text-[11px] font-semibold text-fg outline-none focus:border-brand"
            value={settings.chartType}
            onChange={(e) => update("chartType", e.target.value as TvChartType)}
          >
            {CHART_TYPES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
          Theme
          <select
            aria-label="TradingView chart theme"
            className="h-8 rounded-md border border-line-2 bg-white px-2 text-[11px] font-semibold text-fg outline-none focus:border-brand"
            value={settings.theme}
            onChange={(e) => update("theme", e.target.value as TvTheme)}
          >
            {THEMES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
          Time
          <select
            aria-label="TradingView chart timezone"
            className="h-8 rounded-md border border-line-2 bg-white px-2 text-[11px] font-semibold text-fg outline-none focus:border-brand"
            value={settings.timezone}
            onChange={(e) => update("timezone", e.target.value as TvTimezone)}
          >
            {TIMEZONES.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1.5 text-[10px] font-medium text-muted">
          <input
            type="checkbox"
            checked={settings.showDrawingToolbar}
            onChange={(e) => update("showDrawingToolbar", e.target.checked)}
            className="h-3.5 w-3.5 accent-brand"
          />
          Drawing tools
        </label>
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={reset} disabled={saving} className="btn-ghost h-8 px-3 text-[11px]">
            Reset
          </button>
          <button type="button" onClick={() => void save()} disabled={saving || !loaded} className="btn-primary h-8 px-3 text-[11px]">
            {saving ? "Saving…" : "Save setup"}
          </button>
        </div>
      </div>

      <div className="relative h-[600px] w-full rounded-lg border border-line bg-white">
        <div ref={containerRef} className="absolute inset-0" />
        {!scriptReady && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-line-2 border-t-brand" />
            <span className="text-xs font-medium text-muted">Loading TradingView…</span>
          </div>
        )}
      </div>

      <p className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[10px] text-dim">
        <span>
          {trade.symbol} → {tvSymbol} · market data by TradingView
        </span>
        <span aria-live="polite">
          {message ?? (dirty ? "Unsaved changes" : hasSaved ? "Setup saved to your account" : "Using defaults")}
        </span>
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-dim">
        Indicators and drawings are controlled inside the widget. Saved setup applies to every trade you open.
      </p>
    </div>
  );
}
