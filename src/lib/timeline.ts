import type { SessionMarker, Trade } from "@/db/schema";

export type TimelineEvent = {
  /** Stable key for React lists. */
  key: string;
  kind: "entry" | "exit" | "marker";
  at: Date;
  /** Running net P&L after this event (markers do not change it). */
  cumulative: number;
  trade?: Trade;
  marker?: SessionMarker;
};

/**
 * Turns a day of trades and pinned notes into one ordered timeline: every
 * entry, every exit and every marker, in the order they happened.
 */
export function buildTimeline(trades: Trade[], markers: SessionMarker[]): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const trade of trades) {
    events.push({ key: `entry-${trade.id}`, kind: "entry", at: trade.openedAt, cumulative: 0, trade });
    if (trade.closedAt) {
      events.push({ key: `exit-${trade.id}`, kind: "exit", at: trade.closedAt, cumulative: 0, trade });
    }
  }

  for (const marker of markers) {
    events.push({ key: `marker-${marker.id}`, kind: "marker", at: marker.at, cumulative: 0, marker });
  }

  events.sort((a, b) => a.at.getTime() - b.at.getTime());

  /* Running P&L follows the exits in chronological order. */
  let running = 0;
  for (const event of events) {
    if (event.kind === "exit" && event.trade) running += event.trade.pnl;
    event.cumulative = Math.round(running * 100) / 100;
  }

  return events;
}

/** The trades of a timeline in the order their exits happened. */
export function timelineTrades(events: TimelineEvent[]): Trade[] {
  const seen = new Set<number>();
  const list: Trade[] = [];
  for (const event of events) {
    if (event.kind !== "exit" || !event.trade) continue;
    if (seen.has(event.trade.id)) continue;
    seen.add(event.trade.id);
    list.push(event.trade);
  }
  return list;
}
