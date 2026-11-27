const moneyCache = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string, digits = 2) {
  const key = `${currency}:${digits}`;
  let f = moneyCache.get(key);
  if (!f) {
    f = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    moneyCache.set(key, f);
  }
  return f;
}

export function fmtMoney(value: number, currency = "USD", digits = 2) {
  return moneyFormatter(currency, digits).format(value);
}

/** Signed money, e.g. +$1,250.00 / −$340.00 */
export function fmtSignedMoney(value: number, currency = "USD", digits = 2) {
  const abs = moneyFormatter(currency, digits).format(Math.abs(value));
  if (value > 0) return `+${abs}`;
  if (value < 0) return `−${abs}`;
  return abs;
}

export function fmtNum(value: number | null | undefined, maxDigits = 2) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDigits }).format(value);
}

export function fmtPrice(value: number | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const digits = Math.abs(value) >= 100 ? 2 : 5;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: Math.min(2, digits),
    maximumFractionDigits: digits,
  }).format(value);
}

export function fmtPct(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function fmtRatio(value: number, digits = 2) {
  if (!Number.isFinite(value)) return "∞";
  return value.toFixed(digits);
}

/** R-multiple, e.g. +1.80R / −0.65R. */
export function fmtR(value: number | null | undefined, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${Math.abs(value).toFixed(digits)}R`;
}

export function fmtDate(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

export function fmtDateShort(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" }).format(date);
}

export function fmtTime(d: Date | string) {
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}

export function fmtDateTime(d: Date | string) {
  return `${fmtDate(d)} · ${fmtTime(d)}`;
}

/** Local YYYY-MM-DD key for grouping by day. */
export function dayKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** YYYY-MM-DDTHH:mm for <input type="datetime-local"> in local time. */
export function toLocalInput(d: Date | null | undefined) {
  if (!d) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function fmtDuration(from: Date, to: Date | null) {
  if (!to) return "Open";
  const ms = Math.max(0, to.getTime() - from.getTime());
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hours < 24) return rem ? `${hours}h ${rem}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}

export function pnlColor(value: number) {
  if (value > 0) return "text-up";
  if (value < 0) return "text-down";
  return "text-muted";
}

/** "just now", "4m ago", "3h ago", "2d ago" — for sync timestamps. */
export function fmtRelative(value: Date | string | null | undefined) {
  if (!value) return "never";
  const date = typeof value === "string" ? new Date(value) : value;
  const diff = Date.now() - date.getTime();
  if (!Number.isFinite(diff)) return "never";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(date);
}
