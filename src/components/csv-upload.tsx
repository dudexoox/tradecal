"use client";

import { useId, useRef, useState } from "react";
import { describeCsv, parseTradeCsv } from "@/lib/csv";
import { Icon } from "./icons";

type Status =
  | { kind: "idle" }
  | { kind: "ok"; name: string; count: number; skipped: number; first: string; coverage: { label: string; ok: boolean }[] }
  | { kind: "error"; name: string; message: string };

/**
 * CSV picker with a live local preview: the exact same parser runs in the
 * browser, so the row count the user sees is what the server will import.
 */
export function CsvImport() {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [defaultSymbol, setDefaultSymbol] = useState("");
  const textRef = useRef<string>("");
  const fileNameRef = useRef<string>("");

  const parse = (text: string, symbol: string, name: string) => {
    const result = parseTradeCsv(text, { defaultSymbol: symbol });
    if (result.error) setStatus({ kind: "error", name, message: result.error });
    else {
      const first = result.rows[0];
      setStatus({
        kind: "ok",
        name,
        count: result.rows.length,
        skipped: result.skipped,
        first: first ? `${first.symbol} · ${first.direction} · ${first.openedAt.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}` : "",
        coverage: describeCsv(result),
      });
    }
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setStatus({ kind: "error", name: file.name, message: "That file is larger than 8MB." });
      return;
    }
    const text = await file.text();
    textRef.current = text;
    fileNameRef.current = file.name;
    parse(text, defaultSymbol, file.name);
  };

  const clear = () => {
    textRef.current = "";
    fileNameRef.current = "";
    setStatus({ kind: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <div>
      <input type="hidden" name="csvDefaultSymbol" value={defaultSymbol} />
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFile(e.dataTransfer.files?.[0]); }}
        className={`rounded-xl border border-dashed p-5 transition-colors ${drag ? "border-brand bg-brand/4" : "border-line-2 bg-panel-2/40"}`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-brand shadow-[0_1px_3px_#1c416312]">
              <Icon name="download" size={19} />
            </span>
            <div>
              <p className="text-[13px] font-medium">Trade history CSV</p>
              <p className="text-[10px] text-muted">MT4 · MT5 · cTrader · broker statements · max 8MB</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {status.kind !== "idle" && (
              <button type="button" onClick={clear} className="text-[11px] text-muted transition-colors hover:text-down">Remove</button>
            )}
            <label htmlFor={id} className="btn-ghost h-9 cursor-pointer text-xs">
              {status.kind === "idle" ? "Choose CSV file" : "Change file"}
            </label>
          </div>
        </div>
        {/* The value is never cleared on change: an emptied file input would
            drop the file from FormData on submit. "Remove" clears it instead. */}
        <input ref={inputRef} id={id} name="csvFile" data-testid="csvFile" type="file" accept=".csv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => { void handleFile(e.target.files?.[0]); }} />
      </div>

      {status.kind === "error" && (
        <div role="alert" className="mt-3 flex gap-2 rounded-lg bg-down/8 px-3 py-2.5 text-[11px] leading-relaxed text-down">
          <Icon name="info" size={14} className="mt-0.5 shrink-0" />
          <span><strong className="font-medium">{status.name}</strong> — {status.message}</span>
        </div>
      )}

      {status.kind === "ok" && (
        <div className="mt-3 rounded-lg border border-line bg-white p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 text-[12px] font-medium"><Icon name="checkCircle" size={15} className="text-up" />{status.count} {status.count === 1 ? "trade" : "trades"} ready to import</span>
            <span className="truncate text-[10px] text-muted">{status.name}</span>
          </div>
          {status.first && <p className="mt-2 text-[10px] text-muted">First row: <span className="text-fg">{status.first}</span></p>}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {status.coverage.map((c) => (
              <span key={c.label} className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-1 text-[9px] ${c.ok ? "border-up/20 bg-up/6 text-up" : "border-line text-dim"}`}>
                <Icon name={c.ok ? "check" : "chevron"} size={9} />{c.label}
              </span>
            ))}
          </div>
          {status.skipped > 0 && <p className="mt-3 text-[10px] text-muted">{status.skipped} non-trade rows (balance operations or unreadable dates) will be skipped.</p>}
          <div className="mt-4 grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
            <div>
              <label htmlFor={`${id}-symbol`} className="label mb-1">Symbol when the file has none</label>
              <input id={`${id}-symbol`} value={defaultSymbol} onChange={(e) => { const v = e.target.value.toUpperCase(); setDefaultSymbol(v); if (textRef.current) parse(textRef.current, v, fileNameRef.current); }} placeholder="e.g. XAUUSD" className="field uppercase h-9" />
            </div>
            <p className="self-end text-[10px] leading-relaxed text-muted">Rows are matched by position, so importing the same file twice updates trades instead of duplicating them.</p>
          </div>
        </div>
      )}
    </div>
  );
}
