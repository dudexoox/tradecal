import Link from "next/link";
import { Icon } from "./icons";

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
        <span className="text-xs font-semibold">Routine</span>
        <Link href="/routine" className="text-link text-[10px]">
          Open<Icon name="arrow" size={11} />
        </Link>
      </div>

      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11px] text-muted">
          {total === 0 ? "No rules yet" : `${done} of ${total} rules`}
        </span>
        <span className="num text-[10px] text-muted">{Math.round(pct)}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-panel-2">
        <div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} />
      </div>

      <div className="mt-4 flex items-center gap-4 border-t border-line pt-3 text-[10px] text-muted">
        <span className="flex items-center gap-1.5">
          <Icon name="sparkles" size={11} className="text-dim" />
          <span className="font-medium text-fg">{streak}-day streak</span>
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name={planSaved ? "checkCircle" : "flag"} size={11} className="text-dim" />
          {planSaved ? "Plan saved" : "Plan pending"}
        </span>
        <span className="flex items-center gap-1.5">
          <Icon name={reviewSaved ? "checkCircle" : "notebook"} size={11} className="text-dim" />
          {reviewSaved ? "Reviewed" : "Review pending"}
        </span>
      </div>
    </section>
  );
}
