"use client";

import { useId, useState } from "react";
import type { DayPnl, EquityPoint } from "@/lib/stats";
import { fmtDateShort, fmtMoney, fmtSignedMoney } from "@/lib/format";

function axisMoney(value: number, currency: string) {
  return fmtMoney(value, currency, 0);
}

export function PnlChart({ start, points, currency }: { start: number; points: EquityPoint[]; currency: string }) {
  const id = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);
  if (!points.length) return <div className="flex h-[220px] items-center justify-center text-xs text-muted">Your progress starts with your first trade.</div>;
  const data = [{ equity: start, date: points[0].date }, ...points];
  const values = data.map((p) => p.equity - start);
  const min = Math.min(0, ...values);
  const max = Math.max(100, ...values);
  const range = max - min || 100;
  const low = min - range * 0.08;
  const high = max + range * 0.1;
  const W = 720, H = 240, L = 64, R = 12, T = 10, B = 30;
  const x = (i: number) => L + i / (data.length - 1) * (W - L - R);
  const y = (v: number) => T + (high - v) / (high - low) * (H - T - B);
  const coords = values.map((v, i) => [x(i), y(v)]);
  const line = coords.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(2)},${b.toFixed(2)}`).join(" ");
  const fill = `${line} L${x(data.length - 1)},${H - B} L${L},${H - B} Z`;
  const ticks = Array.from({length: 5}, (_, i) => min + (max - min) * i / 4);
  const selected = hover === null ? null : data[hover];
  const labels = [...new Set([0, Math.floor((data.length - 1) / 3), Math.floor((data.length - 1) * 2 / 3), data.length - 1])];
  return <div className="relative mt-3">
    {selected && hover !== null && <div className="pointer-events-none absolute right-3 top-0 z-10 rounded-lg border border-line bg-white/95 px-3 py-2 text-[10px] shadow-sm"><span className="text-muted">{fmtDateShort(selected.date)}</span><span className="ml-3 font-semibold text-brand">{fmtSignedMoney(selected.equity - start, currency)}</span></div>}
    <svg viewBox={`0 0 ${W} ${H}`} className="h-[226px] w-full overflow-visible" role="img" aria-label="Cumulative net profit and loss, with trade-by-trade values" onMouseLeave={() => setHover(null)}>
      <defs><linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0781fe" stopOpacity="0.16"/><stop offset="100%" stopColor="#0781fe" stopOpacity="0.005"/></linearGradient></defs>
      {ticks.map((v, i) => <g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke="#edf0f5" strokeDasharray="3 5"/><text x={L-13} y={y(v)+3.5} textAnchor="end" fill="#9da7b7" fontSize="10" fontFamily="inherit">{axisMoney(v, currency)}</text></g>)}
      <path d={fill} fill={`url(#fill-${id})`}/><path d={line} stroke="#0781fe" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" fill="none"/>
      {labels.map((i) => <text key={i} x={x(i)} y={H-5} textAnchor={i === 0 ? "start" : i === data.length - 1 ? "end" : "middle"} fill="#9da7b7" fontSize="10" fontFamily="inherit">{fmtDateShort(data[i].date)}</text>)}
      {coords.map(([px, py], i) => <g key={i} onMouseEnter={() => setHover(i)}><rect x={px - (W-L-R)/(data.length-1)/2} y={T} width={(W-L-R)/(data.length-1)} height={H-T-B} fill="transparent"><title>{`${fmtDateShort(data[i].date)}: ${fmtSignedMoney(values[i], currency)}`}</title></rect>{(i === data.length - 1 || hover === i) && <><circle cx={px} cy={py} r="6" fill="#0781fe" fillOpacity="0.12"/><circle cx={px} cy={py} r="3.5" fill="#0781fe" stroke="white" strokeWidth="2"/></>}</g>)}
      {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} stroke="#0781fe" strokeOpacity="0.3" strokeDasharray="3 4" pointerEvents="none"/>}
    </svg>
  </div>;
}

export function DailyPnlChart({ days, currency }: { days: DayPnl[]; currency: string }) {
  if (!days.length) return <div className="flex h-[226px] items-center justify-center text-xs text-muted">Your daily results will appear here.</div>;
  const W=460, H=240, L=56, R=10, T=10, B=30;
  const max = Math.max(100, ...days.map((d) => d.pnl));
  const min = Math.min(-100, ...days.map((d) => d.pnl));
  const upper = max * 1.18, lower = min * 1.18;
  const y = (v: number) => T + (upper-v)/(upper-lower)*(H-T-B);
  const step = (W-L-R)/days.length;
  const width = Math.min(19, step * 0.56);
  const tickValues = [max, max / 2, 0, min];
  const labels = [...new Set([0, Math.floor((days.length-1)/2), days.length-1])];
  return <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-[226px] w-full" role="img" aria-label="Net profit and loss for each trading day">
    {tickValues.map((v,i) => <g key={i}><line x1={L} x2={W-R} y1={y(v)} y2={y(v)} stroke={v===0 ? "#dfe5ed" : "#edf0f5"} strokeDasharray={v===0 ? undefined : "3 5"}/><text x={L-10} y={y(v)+3} textAnchor="end" fill="#9da7b7" fontSize="10" fontFamily="inherit">{axisMoney(v,currency)}</text></g>)}
    {days.map((d,i) => <a key={d.key} href={`/day-view?date=${d.key}`} aria-label={`${fmtDateShort(d.date)}: ${fmtSignedMoney(d.pnl,currency)}. Review this session.`}><rect x={L+i*step+(step-width)/2} y={Math.min(y(0),y(d.pnl))} width={width} height={Math.max(2,Math.abs(y(0)-y(d.pnl)))} rx="2.5" fill={d.pnl>=0 ? "#48bfa0" : "#ed8a94"} className="transition-opacity hover:opacity-70"><title>{`${fmtDateShort(d.date)} · ${fmtSignedMoney(d.pnl,currency)} · ${d.trades} trades`}</title></rect></a>)}
    {labels.map((i) => <text key={i} x={L+i*step+step/2} y={H-5} textAnchor={i===0 ? "start" : i===days.length-1 ? "end" : "middle"} fill="#9da7b7" fontSize="10" fontFamily="inherit">{fmtDateShort(days[i].date)}</text>)}
  </svg>;
}
