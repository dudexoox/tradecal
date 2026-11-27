"use client";

import { useActionState, useId, useRef, useState } from "react";
import Link from "next/link";
import type { Trade, TradeTag } from "@/db/schema";
import type { FormState } from "@/app/actions";
import { fmtR } from "@/lib/format";
import { Icon } from "./icons";
import { CriteriaChecklist } from "./criteria-checklist";
import { TagPicker } from "./tag-picker";

// Kept local so this client bundle never imports the server-side upload module.
const ACCEPT = "image/png,image/jpeg,image/webp";
const MAX_BYTES = 5 * 1024 * 1024;

export type StrategyOption = { id: number; name: string; criteria: string[] };

export function TradeForm({action,trade,accountId,setups,symbols,strategies,allTags,cancelHref,submitLabel,defaultTime="",openTime,closeTime}:{action:(prev:FormState,fd:FormData)=>Promise<FormState>;trade?:Trade&{tags?:TradeTag[]};accountId:number;setups:string[];symbols:string[];strategies:StrategyOption[];allTags:TradeTag[];cancelHref:string;submitLabel:string;defaultTime?:string;openTime?:string;closeTime?:string;}) {
  const [state,formAction,pending]=useActionState(action,null);
  const [direction,setDirection]=useState<"long"|"short">(trade?.direction??"long");
  const [rating,setRating]=useState(trade?.rating??0);
  const [strategyId,setStrategyId]=useState<string>(trade?.strategyId?String(trade.strategyId):"");
  const [chartMode,setChartMode]=useState<"upload"|"link">(trade?.tradingviewUrl&&!trade?.chartImageUrl?"link":"upload");
  const [chartPreview,setChartPreview]=useState<string|null>(trade?.chartImageUrl??null);
  const [setupPreview,setSetupPreview]=useState<string|null>(trade?.setupImageUrl??null);
  const [chartRemoved,setChartRemoved]=useState(false);
  const [setupRemoved,setSetupRemoved]=useState(false);
  const [mediaError,setMediaError]=useState<string|null>(null);
  const [entry,setEntry]=useState(trade?.entryPrice!=null?String(trade.entryPrice):"");
  const [stop,setStop]=useState(trade?.stopLoss!=null?String(trade.stopLoss):"");
  const [target,setTarget]=useState(trade?.takeProfit!=null?String(trade.takeProfit):"");
  const [exit,setExit]=useState(trade?.exitPrice!=null?String(trade.exitPrice):"");
  const [risk,setRisk]=useState(trade?.riskAmount!=null?String(trade.riskAmount):"");
  const [pnl,setPnl]=useState(trade?.pnl!=null?String(trade.pnl):"");

  const chosen=strategies.find((s)=>String(s.id)===strategyId);
  const entryN=Number(entry),stopN=Number(stop),targetN=Number(target),exitN=Number(exit),riskN=Number(risk),pnlN=Number(pnl);
  const pricesReady=entry.trim()!==""&&stop.trim()!==""&&Number.isFinite(entryN)&&Number.isFinite(stopN)&&Math.abs(entryN-stopN)>0;
  const planned= pricesReady&&target.trim()!==""&&Number.isFinite(targetN) ? Math.abs(targetN-entryN)/Math.abs(entryN-stopN) : null;
  const realized= risk.trim()!==""&&Number.isFinite(riskN)&&riskN>0&&pnl.trim()!==""&&Number.isFinite(pnlN)
    ? pnlN/riskN
    : pricesReady&&exit.trim()!==""&&Number.isFinite(exitN)
      ? (direction==="long"?exitN-entryN:entryN-exitN)/Math.abs(entryN-stopN)
      : null;
  const stopWarning= pricesReady&&((direction==="long"&&stopN>=entryN)||(direction==="short"&&stopN<=entryN));
  const targetWarning= pricesReady&&target.trim()!==""&&Number.isFinite(targetN)&&((direction==="long"&&targetN<=entryN)||(direction==="short"&&targetN>=entryN));

  const pickImage=(file:File|undefined,set:(url:string)=>void)=>{
    if(!file)return;
    if(file.size>MAX_BYTES){setMediaError("Images must be 5MB or smaller.");return;}
    if(!ACCEPT.split(",").includes(file.type)){setMediaError("Use a PNG, JPEG or WebP image.");return;}
    setMediaError(null);
    set(URL.createObjectURL(file));
  };

  return <form action={formAction} className="card overflow-hidden">
    <input type="hidden" name="accountId" value={accountId}/><input type="hidden" name="direction" value={direction}/><input type="hidden" name="rating" value={rating||""}/>
    <div className="flex items-center gap-2.5 border-b border-line px-6 py-4"><Icon name="list" size={17} className="text-brand"/><h2 className="text-sm font-semibold">Trade details</h2><span className="ml-auto hidden text-[10px] text-muted sm:inline">The numbers are just the beginning.</span></div>
    <div className="grid gap-5 p-6 sm:grid-cols-2">
      <div><label className="label" htmlFor="symbol">Symbol <span className="text-brand">*</span></label><input id="symbol" name="symbol" list="symbols" required maxLength={20} defaultValue={trade?.symbol??""} placeholder="e.g. EURUSD" autoComplete="off" className="field uppercase placeholder:normal-case"/><datalist id="symbols">{symbols.map((s)=><option key={s} value={s}/>)}</datalist></div>
      <div><span className="label">Direction</span><div className="grid h-11 grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">{(["long","short"] as const).map((d)=><button key={d} type="button" aria-pressed={direction===d} onClick={()=>setDirection(d)} className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-medium capitalize transition-colors ${direction===d?d==="long"?"bg-white text-up shadow-sm":"bg-white text-down shadow-sm":"text-muted hover:text-fg"}`}><Icon name="arrowUp" size={13} className={d==="short"?"rotate-90":""}/>{d}</button>)}</div></div>
      <div><label className="label" htmlFor="openedAt">Open time <span className="text-[10px] text-dim">(UTC)</span></label><input id="openedAt" name="openedAt" type="datetime-local" required defaultValue={trade?openTime:defaultTime} className="field"/></div>
      <div><label className="label" htmlFor="closedAt">Close time <span className="text-[10px] text-dim">(UTC, optional)</span></label><input id="closedAt" name="closedAt" type="datetime-local" defaultValue={trade?closeTime:defaultTime} className="field"/></div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-3">
        <RiskField name="entryPrice" label="Entry price" value={entry} onChange={setEntry} placeholder="1.0850"/>
        <RiskField name="stopLoss" label="Stop loss" value={stop} onChange={setStop} placeholder="1.0820" hint="Initial invalidation"/>
        <RiskField name="takeProfit" label="Take profit" value={target} onChange={setTarget} placeholder="1.0920" hint="Planned target"/>
        <RiskField name="exitPrice" label="Exit price" value={exit} onChange={setExit} placeholder="1.0890"/>
        <NumberField name="size" label="Size (lots)" value={trade?.size} placeholder="1.00"/>
        <RiskField name="riskAmount" label="Planned risk (1R)" value={risk} onChange={setRisk} placeholder="250.00" hint="In account currency"/>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:col-span-2">
        <RiskField name="pnl" label="Net P&L" value={pnl} onChange={setPnl} placeholder="0.00" required/>
        <NumberField name="fees" label="Fees / swap" value={trade?.fees} placeholder="0.00"/>
      </div>
      <div className="rounded-lg border border-line bg-panel-2/50 px-4 py-3 sm:col-span-2">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[11px]">
          <span className="text-muted">Planned R:R <strong className="num ml-1 font-semibold text-fg">{planned!==null?`1 : ${planned.toFixed(2)}`:"—"}</strong></span>
          <span className="text-muted">Result <strong className={`num ml-1 font-semibold ${realized===null?"text-fg":realized>0?"text-up":realized<0?"text-down":"text-fg"}`}>{fmtR(realized)}</strong></span>
          <span className="text-muted">Stop &amp; target <strong className="ml-1 font-semibold text-fg">{pricesReady?"Set":"Not set"}</strong></span>
        </div>
        {(stopWarning||targetWarning)&&<p className="mt-2 text-[10px] text-down">For a {direction} trade, the stop should sit {direction==="long"?"below":"above"} entry and the target {direction==="long"?"above":"below"} it. Double-check the prices.</p>}
        <p className="mt-2 text-[10px] leading-relaxed text-muted">Enter the final net result in your account currency. Planned risk is the amount you were willing to lose — it turns P&amp;L into R-multiples for your reports.</p>
      </div>
    </div>

    {/* ------------------------------------------------ beyond the numbers */}
    <div className="border-t border-line bg-[#fbfcff] p-6"><div className="mb-5 flex items-start gap-2.5"><span className="mt-0.5 text-brand"><Icon name="notebook" size={18}/></span><div><h2 className="text-sm font-semibold">Beyond the numbers</h2><p className="mt-1 text-[11px] text-muted">Capture your process while it’s fresh.</p></div></div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="strategyId">Strategy from your playbook</label>
          <select id="strategyId" name="strategyId" value={strategyId} onChange={(e)=>setStrategyId(e.target.value)} className="field">
            <option value="">No strategy linked</option>
            {strategies.map((s)=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          {strategies.length===0&&<p className="mt-2 text-[10px] text-muted">Write a strategy first — <Link href="/playbook?new=strategy" className="text-brand-2 hover:underline">create one in the playbook</Link>.</p>}
        </div>
        <div><label className="label" htmlFor="setup">Setup / strategy</label><input id="setup" name="setup" list="setups" defaultValue={trade?.setup??""} placeholder="e.g. Breakout, pullback..." autoComplete="off" className="field"/><datalist id="setups">{setups.map((s)=><option key={s} value={s}/>)}</datalist></div>
        <div><span className="label">How well did you execute?</span><div className="flex h-11 items-center gap-1.5">{[1,2,3,4,5].map((n)=><button key={n} type="button" aria-label={`${n} of 5`} aria-pressed={rating===n} onClick={()=>setRating(rating===n?0:n)} className={`h-9 w-9 rounded-lg border text-xs transition-colors ${n<=rating?"border-brand/30 bg-brand/7 text-brand":"border-line-2 bg-white text-dim hover:border-brand/30"}`}>{n}</button>)}</div></div>
        <div><label className="label" htmlFor="notes">Trade review</label><textarea id="notes" name="notes" rows={5} defaultValue={trade?.notes??""} placeholder={"What was your thesis? Did you follow your plan?\nWhat went well, and what would you do differently?"} className="field h-auto resize-y py-3 text-[13px] leading-relaxed"/></div>
        <div className="sm:col-span-2"><span className="label">Tags</span><TagPicker allTags={allTags} selected={trade?.tags?.map((tag)=>tag.name)??[]}/><p className="mt-2 text-[10px] leading-relaxed text-muted">Label mistakes, emotions, conditions or anything else you want to compare in reports. New tags are created when you save the trade.</p></div>
      </div>

      {chosen&&chosen.criteria.length>0&&(
        <div className="mt-5">
          <CriteriaChecklist items={chosen.criteria} label={`${chosen.name} — confirm before saving`}/>
        </div>
      )}
    </div>

    {/* -------------------------------------------------- chart & setup media */}
    <div className="border-t border-line p-6">
      <div className="mb-5 flex items-start gap-2.5"><span className="mt-0.5 text-brand"><Icon name="chart" size={18}/></span><div><h2 className="text-sm font-semibold">Chart &amp; setup</h2><p className="mt-1 text-[11px] text-muted">Show the trade, not just the numbers — a chart screenshot or your TradingView link, plus a picture of the setup.</p></div></div>
      <input type="hidden" name="existingChartImage" value={chartRemoved?"":(trade?.chartImageUrl??"")}/>
      <input type="hidden" name="existingSetupImage" value={setupRemoved?"":(trade?.setupImageUrl??"")}/>
      {chartRemoved&&<input type="hidden" name="removeChart" value="on"/>}
      {setupRemoved&&<input type="hidden" name="removeSetup" value="on"/>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <span className="label">Chart</span>
          <div className="mb-3 grid h-10 grid-cols-2 gap-1 rounded-lg border border-line-2 bg-panel-2/60 p-1">
            <button type="button" aria-pressed={chartMode==="upload"} onClick={()=>setChartMode("upload")} className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${chartMode==="upload"?"bg-white text-fg shadow-sm":"text-muted hover:text-fg"}`}><Icon name="image" size={14}/>Screenshot</button>
            <button type="button" aria-pressed={chartMode==="link"} onClick={()=>setChartMode("link")} className={`flex items-center justify-center gap-1.5 rounded-md text-xs font-medium transition-colors ${chartMode==="link"?"bg-white text-fg shadow-sm":"text-muted hover:text-fg"}`}><Icon name="link" size={14}/>TradingView link</button>
          </div>
          {/* The link input stays mounted in both modes so switching modes never drops it. */}
          {chartMode==="upload"&&<ImageDrop label="Chart screenshot" inputName="chartImage" preview={chartPreview} onPick={(f)=>pickImage(f,setChartPreview)} onRemove={()=>{setChartRemoved(true);setChartPreview(null);setMediaError(null);}} hint="Drag an image, or click to browse · PNG, JPEG or WebP · max 5MB"/>}
          <label className={chartMode==="link"?"label":"sr-only"} htmlFor="tradingviewUrl">Link to your chart</label>
          <input id="tradingviewUrl" name="tradingviewUrl" type="url" inputMode="url" defaultValue={trade?.tradingviewUrl??""} placeholder="https://www.tradingview.com/chart/…" className={chartMode==="link"?"field":"hidden"}/>
          {chartMode==="link"&&<p className="mt-2 text-[10px] leading-relaxed text-muted">Paste a share link from TradingView (or anywhere else). Opening a saved trade will show a shortcut straight to your chart.</p>}
        </div>
        <div>
          <span className="label">Setup picture</span>
          <ImageDrop label="Setup picture" inputName="setupImage" preview={setupPreview} onPick={(f)=>pickImage(f,setSetupPreview)} onRemove={()=>{setSetupRemoved(true);setSetupPreview(null);setMediaError(null);}} hint="Your marked-up chart, level screenshot or playbook image · max 5MB"/>
        </div>
      </div>
      {mediaError&&<p role="alert" className="mt-3 rounded-md bg-down/8 px-3 py-2 text-[11px] text-down">{mediaError}</p>}
    </div>

    {state?.error && <p role="alert" className="mx-6 mt-4 rounded-lg bg-down/8 px-3 py-2 text-xs text-down">{state.error}</p>}
    <div className="flex items-center justify-end gap-2 border-t border-line px-6 py-4"><Link href={cancelHref} className="btn-ghost">Cancel</Link><button type="submit" disabled={pending} className="btn-primary"><Icon name="check" size={15}/>{pending?"Saving…":submitLabel}</button></div>
  </form>;
}

/**
 * The file input stays mounted for the lifetime of the component (it sits
 * outside both visual branches), so the chosen file survives the switch from
 * dropzone to thumbnail and is still in FormData on submit.
 */
function ImageDrop({label,inputName,hint,preview,onPick,onRemove}:{label:string;inputName:string;hint:string;preview:string|null;onPick:(file:File|undefined)=>void;onRemove:()=>void;}) {
  const id=useId();
  const inputRef=useRef<HTMLInputElement>(null);
  const [drag,setDrag]=useState(false);

  const handleChange=(e:React.ChangeEvent<HTMLInputElement>)=>onPick(e.target.files?.[0]);
  const handleRemove=()=>{if(inputRef.current)inputRef.current.value="";onRemove();};
  const handleDrop=(e:React.DragEvent<HTMLLabelElement>)=>{
    e.preventDefault();
    setDrag(false);
    const file=e.dataTransfer.files?.[0];
    if(file&&inputRef.current){inputRef.current.files=e.dataTransfer.files;onPick(file);}
  };

  return <div>
    {preview
      ? <div className="overflow-hidden rounded-lg border border-line bg-panel-2">
          {/* Preview uses a blob: URL for the not-yet-uploaded file — next/image can't optimize it. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt={label} className="h-36 w-full object-contain bg-panel-2"/>
          <div className="flex items-center justify-between gap-2 border-t border-line bg-white px-3 py-2">
            <span className="truncate text-[10px] text-muted">Image ready to save</span>
            <span className="flex shrink-0 items-center gap-1">
              <label htmlFor={id} className="cursor-pointer rounded-md px-2 py-1 text-[10px] font-medium text-brand transition-colors hover:bg-brand/6">Replace</label>
              <button type="button" onClick={handleRemove} className="rounded-md px-2 py-1 text-[10px] text-muted transition-colors hover:text-down">Remove</button>
            </span>
          </div>
        </div>
      : <label htmlFor={id} onDragOver={(e)=>{e.preventDefault();setDrag(true);}} onDragLeave={()=>setDrag(false)} onDrop={handleDrop} className={`flex h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-4 text-center transition-colors ${drag?"border-brand bg-brand/5":"border-line-2 bg-panel-2/50 hover:border-brand/50 hover:bg-brand/4"}`}>
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-brand shadow-[0_1px_3px_#1c416312]"><Icon name="image" size={17}/></span>
          <span className="text-xs font-medium">Drop a screenshot or click to browse</span>
          <span className="text-[10px] leading-relaxed text-muted">{hint}</span>
        </label>}
    <input ref={inputRef} id={id} name={inputName} data-testid={inputName} type="file" accept={ACCEPT} className="sr-only" onChange={handleChange}/>
  </div>;
}

function NumberField({name,label,value,placeholder,required=false}:{name:string;label:string;value?:number|null;placeholder:string;required?:boolean}) {
  return <div><label className="label" htmlFor={name}>{label}{required&&<span className="text-brand"> *</span>}</label><input id={name} name={name} type="number" step="any" inputMode="decimal" required={required} defaultValue={value??""} placeholder={placeholder} className="field num"/></div>;
}

function RiskField({name,label,value,onChange,placeholder,required=false,hint}:{name:string;label:string;value:string;onChange:(value:string)=>void;placeholder:string;required?:boolean;hint?:string}) {
  return <div><label className="label" htmlFor={name}>{label}{required&&<span className="text-brand"> *</span>}</label><input id={name} name={name} type="number" step="any" inputMode="decimal" required={required} value={value} onChange={(event)=>onChange(event.target.value)} placeholder={placeholder} className="field num"/>{hint&&<p className="mt-1.5 text-[10px] text-dim">{hint}</p>}</div>;
}
