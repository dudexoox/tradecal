"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { TimelineEvent } from "@/lib/timeline";
import { fmtDuration, fmtMoney, fmtR, fmtTime } from "@/lib/format";
import { tradeR } from "@/lib/stats";
import { Icon } from "./icons";

const MARKER_TONE: Record<string, string> = {
  note: "border-brand/25 bg-brand/5 text-brand",
  plan: "border-line bg-panel-2 text-muted",
  mistake: "border-down/25 bg-down/5 text-down",
  win: "border-up/25 bg-up/5 text-up",
};

export function SessionTimeline({ events, currency }: { events: TimelineEvent[]; currency: string }) {
  const [replay, setReplay] = useState<{ step: number | null; playing: boolean }>({
    step: null,
    playing: false,
  });

  const total = events.length;
  const step = replay.step;
  const visible = step === null ? events : events.slice(0, step);

  /* The timer advances one event at a time and stops at the end. */
  useEffect(() => {
    if (!replay.playing || replay.step === null) return;
    const timer = setTimeout(() => {
      setReplay((current) => {
        if (current.step === null) return current;
        const next = Math.min(total, current.step + 1);
        return { step: next, playing: next < total };
      });
    }, 900);
    return () => clearTimeout(timer);
  }, [replay, total]);

  const start = () => setReplay({ step: 1, playing: true });
  const reset = () => setReplay({ step: null, playing: false });
  const back = () => setReplay((current) => ({ step: Math.max(1, (current.step ?? total) - 1), playing: false }));
  const forward = () =>
    setReplay((current) => ({ step: Math.min(total, (current.step ?? 0) + 1), playing: false }));

  const running = visible.length ? visible[visible.length - 1].cumulative : 0;

  return (
    <section className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <Icon name="clock" size={16} className="text-brand" />
          <h2 className="text-xs font-semibold">Session replay</h2>
          <span className="num text-[10px] text-muted">
            {step === null ? `${total} events` : `${visible.length} / ${total}`}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {step === null ? (
            <button type="button" onClick={start} disabled={total === 0} className="btn-ghost h-8 px-3 text-[11px]">
              <Icon name="arrow" size={13} />
              Replay
            </button>
          ) : (
            <>
              <button type="button" onClick={reset} className="btn-ghost h-8 px-3 text-[11px]">
                Show all
              </button>
              <button
                type="button"
                onClick={back}
                disabled={step <= 1}
                className="icon-button h-8 w-8"
                aria-label="Previous event"
              >
                <Icon name="chevron" size={13} className="rotate-180" />
              </button>
              <button
                type="button"
                onClick={() => (replay.playing ? setReplay((current) => ({ ...current, playing: false })) : forward())}
                className="icon-button h-8 w-8"
                aria-label={replay.playing ? "Pause replay" : "Next event"}
              >
                <Icon name={replay.playing ? "clock" : "chevron"} size={13} />
              </button>
            </>
          )}
        </div>
      </div>

      {total === 0 ? (
        <p className="px-5 py-8 text-center text-xs text-muted">
          Nothing happened in this session yet. Log a trade or pin a note to build the timeline.
        </p>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 border-b border-line bg-panel-2/40 px-5 py-2.5">
            <span className="text-[10px] uppercase tracking-[0.1em] text-dim">Running P&L</span>
            <span className={`num text-sm font-semibold ${running > 0 ? "text-up" : running < 0 ? "text-down" : "text-fg"}`}>
              {running > 0 ? "+" : running < 0 ? "−" : ""}
              {fmtMoney(Math.abs(running), currency)}
            </span>
          </div>

          <ol className="relative px-5 py-4">
            <span className="absolute bottom-6 left-[26px] top-7 w-px bg-line" aria-hidden="true" />
            {visible.map((event) => (
              <TimelineRow key={event.key} event={event} currency={currency} />
            ))}
          </ol>
        </>
      )}
    </section>
  );
}

function TimelineRow({ event, currency }: { event: TimelineEvent; currency: string }) {
  if (event.kind === "marker" && event.marker) {
    const marker = event.marker;
    return (
      <li className="relative flex gap-3 py-2.5">
        <span className="z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-white">
          <span className={`h-1.5 w-1.5 rounded-full ${marker.kind === "mistake" ? "bg-down" : marker.kind === "win" ? "bg-up" : "bg-brand"}`} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="num text-[10px] text-dim">{fmtTime(marker.at)}</span>
            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-medium capitalize ${MARKER_TONE[marker.kind] ?? MARKER_TONE.note}`}>
              {marker.kind}
            </span>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-fg">{marker.note}</p>
        </div>
      </li>
    );
  }

  const trade = event.trade;
  if (!trade) return null;
  const isExit = event.kind === "exit";
  const r = tradeR(trade);

  return (
    <li className="relative flex gap-3 py-2.5">
      <span
        className={`z-10 mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border bg-white ${
          isExit ? (trade.pnl >= 0 ? "border-up/40" : "border-down/40") : "border-line-2"
        }`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${isExit ? (trade.pnl >= 0 ? "bg-up" : "bg-down") : "bg-line-2"}`} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className="num text-[10px] text-dim">{fmtTime(event.at)}</span>
          <Link href={`/trades/${trade.id}`} className="text-xs font-semibold hover:text-brand">
            {trade.symbol}
          </Link>
          <span className="text-[10px] capitalize text-muted">{trade.direction}</span>
          <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-medium ${isExit ? "bg-panel-2 text-muted" : "bg-brand/7 text-brand"}`}>
            {isExit ? "Exit" : "Entry"}
          </span>
          {isExit && (
            <span className={`num text-[11px] font-medium ${trade.pnl > 0 ? "text-up" : trade.pnl < 0 ? "text-down" : "text-muted"}`}>
              {trade.pnl > 0 ? "+" : trade.pnl < 0 ? "−" : ""}
              {fmtMoney(Math.abs(trade.pnl), currency)}
            </span>
          )}
          {isExit && r !== null && <span className="num text-[10px] text-muted">{fmtR(r)}</span>}
          {isExit && <span className="num text-[10px] text-dim">{fmtDuration(trade.openedAt, trade.closedAt)}</span>}
        </div>
        {!isExit && trade.setup && <p className="mt-1 text-[11px] text-muted">{trade.setup}</p>}
        {isExit && trade.notes?.trim() && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{trade.notes}</p>
        )}
      </div>
    </li>
  );
}
