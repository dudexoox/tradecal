"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MOODS, type JournalEntry, type Mood } from "@/db/schema";
import { saveJournalEntry } from "@/app/actions";
import { Icon } from "./icons";

const TEMPLATES={
  session:"Before the session\nHow am I feeling? What is my plan?\n\nWhat went well\n\n\nWhat I could improve\n\n\nOne lesson for tomorrow\n",
  weekly:"This week in perspective\n\n\nMy best decisions\n\n\nPatterns I noticed\n\n\nOne thing to focus on next week\n",
};

export function JournalForm({entry,defaultDate,returnTo="journal"}:{entry?:JournalEntry|null;defaultDate:string;returnTo?:"journal"|"day-view"}) {
  const [state,formAction,pending]=useActionState(saveJournalEntry,null);
  const [content,setContent]=useState(entry?.content??"");
  const [mood,setMood]=useState<Mood|"">(entry?.mood??"");
  const cancel=returnTo==="day-view"?`/day-view?date=${defaultDate}`:"/journal";
  function applyTemplate(key:keyof typeof TEMPLATES) {
    if(content.trim() && !window.confirm("Replace this draft with a writing template?")) return;
    setContent(TEMPLATES[key]);
  }
  return <form action={formAction} className="card overflow-hidden">
    <input type="hidden" name="mood" value={mood}/><input type="hidden" name="returnTo" value={returnTo}/>
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line px-5 py-4 sm:px-7"><div className="flex items-center gap-2.5"><Icon name="notebook" size={17} className="text-brand"/><span className="text-sm font-semibold">{entry?"Your reflection":"A fresh page"}</span></div><label className="flex items-center gap-2 text-xs text-muted"><span className="sr-only">Reflection date</span><input name="entryDate" type="date" required defaultValue={entry?.entryDate??defaultDate} className="rounded-md border border-line bg-white px-2.5 py-1.5 text-xs text-fg outline-none focus:border-brand"/></label></div>
    <div className="p-5 sm:p-7">
      <fieldset><legend className="mb-3 text-xs font-medium text-muted">How did you feel?</legend><div className="flex flex-wrap gap-2">{MOODS.map((m)=><button type="button" key={m} aria-pressed={mood===m} onClick={()=>setMood(mood===m?"":m)} className={`rounded-full border px-3 py-1.5 text-[11px] capitalize transition-colors ${mood===m?"border-brand/35 bg-brand/6 text-brand":"border-line text-muted hover:border-line-2 hover:text-fg"}`}>{m}</button>)}</div></fieldset>
      {!entry && <div className="mt-6 flex flex-wrap items-center gap-2 border-y border-line py-3"><span className="mr-1 flex items-center gap-1.5 text-[10px] text-muted"><Icon name="sparkles" size={13}/>Need a starting point?</span><button type="button" onClick={()=>applyTemplate("session")} className="rounded-md bg-panel-2 px-2.5 py-1.5 text-[10px] font-medium text-muted transition-colors hover:bg-brand/7 hover:text-brand">Session review</button><button type="button" onClick={()=>applyTemplate("weekly")} className="rounded-md bg-panel-2 px-2.5 py-1.5 text-[10px] font-medium text-muted transition-colors hover:bg-brand/7 hover:text-brand">Weekly reflection</button></div>}
      <label htmlFor="content" className="sr-only">Your reflection</label><textarea id="content" name="content" required rows={entry?9:10} value={content} onChange={(e)=>setContent(e.target.value)} placeholder={"What did the market teach you today?\n\nThe numbers tell one part of the story. This space is for the rest."} className="mt-5 min-h-[200px] w-full resize-y border-0 bg-white text-[13px] leading-[1.9] text-fg outline-none placeholder:text-dim"/>
      {state?.error && <p role="alert" className="mt-4 rounded-lg bg-down/7 px-3 py-2 text-xs text-down">{state.error}</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line bg-panel-2/30 px-5 py-4 sm:px-7"><span className="text-[10px] text-muted">{content.trim()?`${content.trim().split(/\s+/).length} words · `:""}One reflection per day. Always yours.</span><div className="flex gap-2"><Link href={cancel} className="btn-ghost h-9">Cancel</Link><button type="submit" disabled={pending} className="btn-primary h-9"><Icon name="check" size={14}/>{pending?"Saving…":entry?"Save changes":"Save reflection"}</button></div></div>
  </form>;
}
