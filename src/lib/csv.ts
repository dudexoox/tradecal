/**
 * CSV trade import — deliberately shared by client (live preview) and server
 * (actual import), so what the user sees before submitting is exactly what
 * gets written.
 *
 * Handles real-world broker/platform exports: quoted fields, comma, semicolon
 * or tab delimiters, BOMs, European/US/ISO date formats, currency symbols and
 * "(1,234.56)" negatives. Position-based files (MT5/MT4 deal history) are
 * grouped back into one trade per position.
 */

export type CsvTrade = {
  externalId: string;
  symbol: string;
  direction: "long" | "short";
  openedAt: Date;
  closedAt: Date | null;
  entryPrice: number | null;
  exitPrice: number | null;
  size: number | null;
  pnl: number;
  fees: number;
};

export type CsvParseResult = {
  rows: CsvTrade[];
  columns: string[];
  error: string | null;
  skipped: number;
};

type Detected = Partial<{
  symbol: number;
  side: number;
  openTime: number;
  closeTime: number;
  price: number;
  closePrice: number;
  size: number;
  profit: number;
  commission: number;
  swap: number;
  position: number;
  note: number;
}>;

const ALIASES: Record<keyof Detected, string[]> = {
  symbol: ["symbol", "instrument", "market", "pair", "ticker", "asset", "security", "product"],
  side: ["type", "side", "direction", "action", "buysell", "transactiontype", "tradetype", "seite", "sens", "lado", "lato"],
  openTime: ["opentime", "opendate", "entrytime", "entrydate", "filledtime", "time", "date", "datetime", "openedat", "timestamp", "datum"],
  closeTime: ["closetime", "closedate", "exittime", "exitdate", "closedat", "timeclosed", "closingdate", "closingtime"],
  price: ["openprice", "entryprice", "priceopened", "fillprice", "openingprice", "avgprice", "price", "entry"],
  closePrice: ["closeprice", "exitprice", "priceclosed", "closingprice", "avgexit", "exit"],
  size: ["volume", "size", "qty", "quantity", "lots", "units", "shares", "contracts", "amount", "volumen", "menge", "quantite"],
  profit: ["profit", "netprofit", "pnl", "netpnl", "result", "gainloss", "gainlossusd", "realizedpl", "profitloss", "pl", "gewinn", "gewinnverlust", "resultat", "beneficio", "resultado", "lucro"],
  commission: ["commission", "commissions", "commissionfee", "provision", "provisionen", "frais"],
  swap: ["swap", "overnight", "rollover"],
  position: ["positionid", "position", "posid", "tradeid", "orderticket", "ticket", "orderid", "id"],
  note: ["comment", "note", "notes", "description", "strategy", "tag"],
};

const MAX_ROWS = 5000;

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Quote-aware CSV splitting with automatic delimiter detection. */
export function splitCsv(text: string): { header: string[]; rows: string[][]; delimiter: string } {
  const clean = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const firstLine = clean.slice(0, clean.indexOf("\n") === -1 ? undefined : clean.indexOf("\n"));
  const counts: [string, number][] = [
    [";", (firstLine.match(/;/g) ?? []).length],
    [",", (firstLine.match(/,/g) ?? []).length],
    ["\t", (firstLine.match(/\t/g) ?? []).length],
  ];
  counts.sort((a, b) => b[1] - a[1]);
  const delimiter = counts[0][1] > 0 ? counts[0][0] : ",";

  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { value += '"'; i++; } else quoted = false;
      } else value += c;
      continue;
    }
    if (c === '"') { quoted = true; continue; }
    if (c === delimiter) { row.push(value); value = ""; continue; }
    if (c === "\n") { row.push(value); rows.push(row); row = []; value = ""; continue; }
    value += c;
  }
  if (value.length || row.length) { row.push(value); rows.push(row); }

  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  const header = (nonEmpty.shift() ?? []).map((h) => h.trim());
  return { header, rows: nonEmpty, delimiter };
}

function detect(header: string[], delimiter: string): Detected {
  const used = new Set<number>();
  const find = (aliases: string[]): number => {
    for (const pass of [0, 1]) {
      for (const alias of aliases) {
        // Short aliases (e.g. "id") may only match a column exactly — otherwise
        // "id" is found inside "Side" and the wrong column gets picked up.
        if (pass === 1 && alias.length < 4) continue;
        for (let i = 0; i < header.length; i++) {
          if (used.has(i)) continue;
          const h = norm(header[i]);
          if (pass === 0 ? h === alias : h.includes(alias)) { used.add(i); return i; }
        }
      }
    }
    return -1;
  };
  const d: Detected = {};
  d.profit = find(ALIASES.profit);
  d.position = find(ALIASES.position);
  d.symbol = find(ALIASES.symbol);
  d.side = find(ALIASES.side);
  d.closeTime = find(ALIASES.closeTime);
  d.openTime = find(ALIASES.openTime);
  d.closePrice = find(ALIASES.closePrice);
  d.price = find(ALIASES.price);
  d.size = find(ALIASES.size);
  d.commission = find(ALIASES.commission);
  d.swap = find(ALIASES.swap);
  d.note = find(ALIASES.note);
  void delimiter;
  return d;
}

export function parseNum(raw: string | undefined | null, delimiter = ","): number | null {
  if (raw === undefined || raw === null) return null;
  let s = String(raw).trim();
  if (!s) return null;
  let negative = false;
  if (/^\(.*\)$/.test(s)) { negative = true; s = s.slice(1, -1); }
  s = s.replace(/[$€£¥%]/g, "").replace(/\s|\u00a0/g, "").replace(/^[+-]/, (m) => (m === "-" ? "-" : ""));
  if (s.includes("(")) negative = true;
  s = s.replace(/[^\d.,\-]/g, "");
  if (!s || s === "-" || s === ".") return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // last separator is the decimal mark
    if (lastDot > lastComma) s = s.replace(/,/g, "");
    else s = s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const grouped = /^-?\d{1,3}(,\d{3})+$/.test(s);
    if (delimiter === "," && grouped) s = s.replace(/,/g, "");
    else if (decimals > 0 && decimals !== 3) s = s.replace(",", ".");
    else if (decimals === 3 && grouped) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Parses the date/time formats seen in MT4/MT5 and broker CSV exports. */
export function parseDateTime(raw: string | undefined | null): Date | null {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})(?:[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));

  m = s.match(/^(\d{1,2})[.](\d{1,2})[.](\d{4})(?:[ T,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));

  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T,]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?/);
  if (m) {
    const [a, b] = [+m[1], +m[2]];
    // D/M/Y or M/D/Y when one of them can only be a day; M/D/Y (US) when ambiguous.
    const day = a > 12 ? a : b;
    const month = a > 12 ? b : a;
    return new Date(+m[3], month - 1, day, +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0));
  }

  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
}

function fnv1a(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) { h ^= input.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

type Leg = {
  symbol: string | null; side: string; time: Date | null; closeTime: Date | null;
  price: number | null; closePrice: number | null; volume: number | null;
  profit: number; commission: number; swap: number; position: string; note: string | null; index: number;
};

export function parseTradeCsv(text: string, opts: { defaultSymbol?: string } = {}): CsvParseResult {
  const empty: CsvParseResult = { rows: [], columns: [], error: null, skipped: 0 };
  if (!text.trim()) return { ...empty, error: "That file is empty." };

  const { header, rows, delimiter } = splitCsv(text);
  if (header.length === 0 || rows.length === 0) return { ...empty, error: "No rows found in that file." };
  if (rows.length > MAX_ROWS) return { ...empty, columns: header, error: `That file has ${rows.length.toLocaleString()} rows — please export at most ${MAX_ROWS.toLocaleString()} trades at a time.` };

  const d = detect(header, delimiter);
  if (d.profit === undefined || d.profit < 0)
    return { ...empty, columns: header, error: `We couldn't find a profit or P&L column. Export your history with a profit column — the file has: ${header.slice(0, 12).join(", ")}${header.length > 12 ? "…" : ""}.` };
  if (d.openTime === undefined || d.openTime < 0)
    return { ...empty, columns: header, error: "We couldn't find a date or time column." };

  const fallbackSymbol = (opts.defaultSymbol?.trim().toUpperCase() || "TRADE").slice(0, 20);
  const legs: Leg[] = [];
  let skipped = 0;

  rows.forEach((cells, index) => {
    const get = (i?: number) => (i === undefined || i < 0 ? "" : (cells[i] ?? "").trim());
    const sideRaw = get(d.side).toLowerCase();
    // MT5/MT4 balance operations are not trades
    if (/balance|deposit|withdraw|credit|bonus/.test(sideRaw)) { skipped++; return; }
    const time = parseDateTime(get(d.openTime));
    if (!time) { skipped++; return; }
    const profit = parseNum(get(d.profit), delimiter);
    if (profit === null) { skipped++; return; }

    const position = get(d.position);
    legs.push({
      symbol: (get(d.symbol).toUpperCase() || fallbackSymbol).slice(0, 20),
      // values seen in English, German, French, Spanish and Portuguese exports
      side: /sell|short|verkauf|vente|venta|venda|corto/.test(sideRaw) ? "short" : "long",
      time,
      closeTime: parseDateTime(get(d.closeTime)),
      price: parseNum(get(d.price), delimiter),
      closePrice: parseNum(get(d.closePrice), delimiter),
      volume: parseNum(get(d.size), delimiter),
      profit,
      commission: parseNum(get(d.commission), delimiter) ?? 0,
      swap: parseNum(get(d.swap), delimiter) ?? 0,
      position: position || `row-${index}`,
      note: get(d.note) || null,
      index,
    });
  });

  if (legs.length === 0) return { ...empty, columns: header, skipped, error: "No trade rows could be read from that file." };

  // one trade per position when the file lists deal legs, otherwise one per row
  const groups = new Map<string, Leg[]>();
  for (const leg of legs) {
    const list = groups.get(leg.position) ?? [];
    list.push(leg);
    groups.set(leg.position, list);
  }

  const rowsOut: CsvTrade[] = [];
  for (const [key, group] of groups) {
    const ordered = [...group].sort((a, b) => (a.time?.getTime() ?? 0) - (b.time?.getTime() ?? 0) || a.index - b.index);
    const open = ordered[0];
    const close = ordered.length > 1 ? ordered[ordered.length - 1] : null;
    const single = ordered.length === 1;
    const sum = (f: (l: Leg) => number) => ordered.reduce((n, l) => n + f(l), 0);

    const openedAt = open.time as Date;
    const closedAt = close && close !== open ? close.time : (single ? open.closeTime : null);
    const pnl = Math.round(sum((l) => l.profit + l.commission + l.swap) * 100) / 100;

    rowsOut.push({
      // Stable across re-imports: the hash ignores cosmetic fields like the
      // fallback symbol, so uploading the same file twice updates in place.
      externalId: `csv:${fnv1a(`${key}|${openedAt.getTime()}|${pnl}`)}`,
      symbol: open.symbol || fallbackSymbol,
      direction: open.side === "short" ? "short" : "long",
      openedAt,
      closedAt: closedAt && closedAt.getTime() > openedAt.getTime() ? closedAt : null,
      entryPrice: open.price ?? (single ? open.price : null),
      exitPrice: close ? (close.price ?? close.closePrice) : single ? (open.closePrice ?? null) : null,
      size: open.volume ?? null,
      pnl,
      fees: Math.round(sum((l) => Math.abs(l.commission)) * 100) / 100,
    });
  }

  rowsOut.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());
  return { rows: rowsOut, columns: header, error: null, skipped };
}

/** Column coverage used by the client-side preview. */
export function describeCsv(result: CsvParseResult): { label: string; ok: boolean }[] {
  const text = result.columns.map(norm).join("|");
  const has = (...keys: string[]) => keys.some((k) => text.includes(k));
  return [
    { label: "Symbol", ok: has("symbol", "instrument", "ticker") },
    { label: "Side", ok: has("side", "type", "direction") },
    { label: "Open time", ok: has("time", "date") },
    { label: "Size", ok: has("volume", "size", "lots", "qty") },
    { label: "Profit", ok: has("profit", "pnl", "result", "gainloss") },
  ];
}
