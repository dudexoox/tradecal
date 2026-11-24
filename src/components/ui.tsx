import Link from "next/link";
import type { ReactNode } from "react";
import type { AccountPhase, Mood } from "@/db/schema";
import { fmtSignedMoney, pnlColor } from "@/lib/format";
import { Icon } from "./icons";

export function PageTitle({ title, subtitle, action }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode }) {
  return <div className="mb-7 flex flex-wrap items-center justify-between gap-4"><div><h1 className="text-[26px] font-semibold leading-tight tracking-[-0.9px]">{title}</h1>{subtitle && <div className="mt-2 text-[13px] leading-relaxed text-muted">{subtitle}</div>}</div>{action}</div>;
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-[13px] font-semibold tracking-[-0.15px]">{children}</h2>{action}</div>;
}

export function Stat({ label, value, hint, tone = "default" }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "default" | "up" | "down" | "brand" }) {
  const color = tone === "up" ? "text-up" : tone === "down" ? "text-down" : tone === "brand" ? "text-brand" : "text-fg";
  return <div className="card px-5 py-4"><div className="text-xs font-medium text-muted">{label}</div><div className={`num mt-3 text-[25px] font-semibold leading-none tracking-[-0.8px] ${color}`}>{value}</div>{hint && <div className="mt-2.5 text-[11px] text-muted">{hint}</div>}</div>;
}

export function Pnl({ value, currency, className = "" }: { value: number; currency: string; className?: string }) {
  return <span className={`num ${pnlColor(value)} ${className}`}>{fmtSignedMoney(value, currency)}</span>;
}

export function SidePill({ side }: { side: "long" | "short" }) {
  return <span className={`inline-flex h-[22px] items-center rounded-md px-2 text-[10px] font-medium capitalize ${side === "long" ? "bg-up/8 text-up" : "bg-down/8 text-down"}`}>{side}</span>;
}

const PHASE_LABEL: Record<AccountPhase, string> = { challenge: "Challenge", verification: "Verification", funded: "Funded", personal: "Personal" };
export function PhasePill({ phase }: { phase: AccountPhase }) {
  return <span className="inline-flex h-5 items-center rounded-md border border-line bg-panel-2 px-1.5 text-[10px] text-muted">{PHASE_LABEL[phase]}</span>;
}

export function Rating({ value }: { value: number | null }) {
  if (!value) return <span className="text-xs text-dim">Not rated</span>;
  return <span className="inline-flex items-center gap-1.5" aria-label={`${value} of 5`}><span className="inline-flex gap-0.5">{Array.from({ length: 5 }).map((_, i) => <span key={i} className={`h-3 w-1 rounded-sm ${i < value ? "bg-brand/65" : "bg-line"}`}/>)}</span><span className="num ml-1 text-[10px] text-muted">{value}/5</span></span>;
}

export function MoodPill({ mood }: { mood: Mood | null }) {
  if (!mood) return null;
  const tone = mood === "calm" || mood === "focused" ? "bg-brand/7 text-brand" : mood === "confident" ? "bg-up/8 text-up" : mood === "frustrated" || mood === "anxious" ? "bg-down/8 text-down" : "bg-panel-2 text-muted";
  return <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-medium capitalize ${tone}`}><Icon name="smile" size={12}/>{mood}</span>;
}

export function Empty({ title, body, action }: { title: string; body?: string; action?: { href: string; label: string } }) {
  return <div className="card flex flex-col items-center justify-center px-6 py-16 text-center"><span className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/7 text-brand"><Icon name="book" size={23}/></span><p className="text-sm font-semibold">{title}</p>{body && <p className="mt-2 max-w-sm text-[13px] leading-relaxed text-muted">{body}</p>}{action && <Link href={action.href} className="btn-primary mt-6">{action.label}<Icon name="arrow" size={14}/></Link>}</div>;
}
