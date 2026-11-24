import Link from "next/link";
import { deleteJournalEntry } from "@/app/actions";
import { DeleteButton } from "@/components/delete-button";
import { JournalForm } from "@/components/journal-form";
import { Empty, MoodPill, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { getJournalEntries, getJournalEntryByDate } from "@/lib/data";
import { dayKey } from "@/lib/format";
import { parseDay } from "@/lib/period";

export const dynamic="force-dynamic";
type Search={date?:string;new?:string;q?:string;mood?:string;saved?:string};

export default async function NotebookPage({searchParams}:{searchParams:Promise<Search>}) {
  const sp=await searchParams;
  const date=parseDay(sp.date);
  const editDate=date?dayKey(date):null;
  const editing=editDate?await getJournalEntryByDate(editDate):null;
  if(sp.new || editDate) return <div className="mx-auto max-w-[850px]"><Link href="/journal" className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted hover:text-brand"><Icon name="arrow" size={13} className="rotate-180"/>Back to notebook</Link><PageTitle title={editing?"Edit reflection":"New reflection"} subtitle="Make space for the thoughts behind your trades."/><JournalForm key={editing?.id??editDate??"new"} entry={editing} defaultDate={editDate??dayKey(new Date())}/></div>;
  const entries=await getJournalEntries();
  const positive=entries.filter((e)=>["calm","focused","confident"].includes(e.mood??""));
  const lessons=entries.filter((e)=>["anxious","frustrated","tired"].includes(e.mood??""));
  let selected=sp.mood==="positive"?positive:sp.mood==="lessons"?lessons:entries;
  const q=sp.q?.trim().toLowerCase()??"";
  if(q) selected=selected.filter((e)=>e.content.toLowerCase().includes(q)||e.entryDate.includes(q));
  const folders=[{label:"All reflections",href:"/journal",count:entries.length,key:"all",icon:"notebook" as const},{label:"A positive mindset",href:"/journal?mood=positive",count:positive.length,key:"positive",icon:"smile" as const},{label:"Lessons learned",href:"/journal?mood=lessons",count:lessons.length,key:"lessons",icon:"flag" as const}];
  return <>
    <PageTitle title="Notebook" subtitle="Your thoughts are part of the data. Keep them here." action={<Link href="/journal?new=1" className="btn-primary"><Icon name="pen" size={15}/>New reflection</Link>}/>
    {sp.saved && <div role="status" className="mb-5 flex items-center gap-2 rounded-lg border border-up/15 bg-up/5 px-4 py-3 text-xs text-up"><Icon name="checkCircle" size={15}/>Reflection saved. One more lesson to carry forward.</div>}
    <div className="grid items-start gap-6 xl:grid-cols-[190px_minmax(0,1fr)]">
      <aside><p className="section-eyebrow mb-3 pl-3">Your notebook</p><nav className="flex flex-wrap gap-1 xl:flex-col" aria-label="Notebook filters">{folders.map((f)=><Link key={f.key} href={f.href} className={`flex items-center gap-2.5 rounded-lg px-3 py-3 text-xs ${(!sp.mood&&f.key==="all")||sp.mood===f.key?"bg-brand/7 font-medium text-brand":"text-muted hover:bg-white"}`}><Icon name={f.icon} size={16}/>{f.label}<span className="ml-auto text-[10px] opacity-65">{f.count}</span></Link>)}</nav><div className="mt-8 hidden rounded-xl border border-dashed border-line-2 px-4 py-5 xl:block"><span className="text-2xl text-brand/50">“</span><p className="text-xs leading-relaxed text-muted">You don’t learn from the trade. You learn from reflecting on the trade.</p><span className="mt-4 block h-0.5 w-5 rounded-full bg-brand/35"/></div></aside>
      <section><div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-[13px] font-semibold">{sp.mood==="positive"?"A positive mindset":sp.mood==="lessons"?"Lessons learned":"All reflections"}<span className="ml-2 text-[11px] font-normal text-muted">{selected.length}</span></h2><form action="/journal" method="get" className="relative">{sp.mood && <input type="hidden" name="mood" value={sp.mood}/>}<input name="q" aria-label="Search reflections" defaultValue={sp.q??""} placeholder="Search your thoughts..." className="h-9 w-[220px] rounded-lg border border-line-2 bg-white pl-9 pr-3 text-xs outline-none placeholder:text-dim focus:border-brand"/><button aria-label="Search notebook" type="submit" className="absolute inset-y-0 left-0 flex w-9 items-center justify-center text-muted"><Icon name="search" size={14}/></button></form></div>
      {selected.length?<div className="grid gap-4 md:grid-cols-2">{selected.map((e)=>{
        const date=parseDay(e.entryDate)!;
        const dateTitle=new Intl.DateTimeFormat("en-US",{month:"long",day:"numeric"}).format(date);
        const weekday=new Intl.DateTimeFormat("en-US",{weekday:"long",year:"numeric"}).format(date);
        const wordCount=e.content.trim().split(/\s+/).length;
        return <article key={e.id} className="card group flex flex-col overflow-hidden transition-all hover:border-brand/25 hover:shadow-[0_4px_16px_#1c416308]"><Link href={`/journal?date=${e.entryDate}`} className="block flex-1 p-5"><div className="mb-5 flex items-start justify-between gap-2"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand/6 text-brand"><Icon name="notebook" size={17}/></span><MoodPill mood={e.mood}/></div><h3 className="text-[16px] font-semibold tracking-[-0.4px]">{dateTitle}</h3><span className="mt-1 block text-[10px] text-muted">{weekday} · Session reflection</span><p className="mt-4 line-clamp-4 whitespace-pre-wrap text-xs leading-[1.85] text-muted">{e.content}</p></Link><div className="flex items-center justify-between border-t border-line px-5 py-3"><span className="flex items-center gap-1.5 text-[9px] text-dim"><Icon name="clock" size={11}/>{wordCount} words</span><div className="flex items-center gap-2"><DeleteButton action={deleteJournalEntry.bind(null,e.id)} confirmText="Delete this reflection?" className="px-1 text-[10px] text-dim opacity-100 transition-colors hover:text-down sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"/><Link href={`/journal?date=${e.entryDate}`} className="text-link text-[10px]">Open note<Icon name="arrow" size={12}/></Link></div></div></article>;
      })}</div>:<Empty title={q?"No reflections found":"A blank page is a good place to start"} body={q?"Try searching for a different word or date.":"Capture what went well, what didn’t, and what you want to do differently."} action={{href:"/journal?new=1",label:"Write a reflection"}}/>}</section>
    </div>
  </>;
}
