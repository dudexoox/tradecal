import Link from "next/link";
import { Icon } from "./icons";
import { ProgressRing } from "./progress-ring";

export function RoutineWidget({
  done,
  total,
  pct,
  streak,
  planSaved,
  reviewSaved,
}: {
  done: number;
  total: number;
  pct: number;
  streak: number;
  planSaved: boolean;
  reviewSaved: boolean;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand/7 text-brand">
            <Icon name="sparkles" size={15} />
          </span>
          Start My Day
        </span>
        <Link href="/routine" className="text-link text-[10px]">
          Open<Icon name="arrow" size={11} />
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
          <ProgressRing value={pct} size={56} stroke={5} />
          <span className="num absolute inset-0 flex items-center justify-center text-xs font-semibold">
            {Math.round(pct)}%
          </span>
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium">
            {done} of {total} rules
          </p>
          <p className="mt-1 text-[10px] text-muted">
            {total === 0
              ? "Build your first routine"
              : done === total
                ? "Complete day. Well done."
                : "Keep the process moving"}
          </p>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-brand/75" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className={`subtle-tag ${planSaved ? "border-brand/20 bg-brand/5 text-brand" : ""}`}>
          <Icon name={planSaved ? "checkCircle" : "flag"} size={11} />
          {planSaved ? "Plan saved" : "Plan pending"}
        </span>
        <span className={`subtle-tag ${reviewSaved ? "border-up/20 bg-up/5 text-up" : ""}`}>
          <Icon name={reviewSaved ? "checkCircle" : "notebook"} size={11} />
          {reviewSaved ? "Reviewed" : "Review pending"}
        </span>
      </div>

      <p className="mt-3 border-t border-line pt-3 text-[10px] text-muted">
        <span className="font-medium text-fg">{streak}-day streak</span> of completed routines
      </p>
    </section>
  );
}
