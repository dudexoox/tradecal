import type { HeatmapDay } from "@/lib/routine";
import { dayKey, fmtDate } from "@/lib/format";

function tone(day: HeatmapDay) {
  if (day.inFuture) return "bg-panel-2/40";
  if (day.total === 0) return "bg-panel-2";
  if (day.pct >= 100) return "bg-brand";
  if (day.pct >= 75) return "bg-brand/70";
  if (day.pct >= 50) return "bg-brand/50";
  if (day.pct >= 25) return "bg-brand/30";
  if (day.pct > 0) return "bg-brand/15";
  return "bg-panel-2";
}

export function RoutineHeatmap({ days }: { days: HeatmapDay[] }) {
  const weeks: HeatmapDay[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  const today = dayKey(new Date());
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        <div
          className="grid shrink-0 gap-1 pr-0.5 text-[9px] leading-3 text-dim"
          style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
          aria-hidden="true"
        >
          <span>Mon</span>
          <span />
          <span>Wed</span>
          <span />
          <span>Fri</span>
          <span />
          <span>Sun</span>
        </div>
        <div className="flex gap-1">
          {weeks.map((week, weekIndex) => (
            <div
              key={weekIndex}
              className="grid gap-1"
              style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
            >
              {week.map((day) => (
                <span
                  key={day.key}
                  title={`${fmtDate(day.date)} · ${day.checked}/${day.total} rules${day.hasPlan ? " · plan saved" : ""}${day.hasReview ? " · reviewed" : ""}`}
                  className={`h-3 w-3 rounded-[3px] ${tone(day)} ${day.key === today ? "ring-1 ring-brand/60" : ""}`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-muted">
        <span>Less</span>
        <span className="h-2.5 w-2.5 rounded-[2px] bg-panel-2" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-brand/30" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-brand/60" />
        <span className="h-2.5 w-2.5 rounded-[2px] bg-brand" />
        <span>More</span>
      </div>
    </div>
  );
}
