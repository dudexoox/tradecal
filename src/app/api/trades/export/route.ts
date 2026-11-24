import { getActiveAccount, getTrades } from "@/lib/data";

export const dynamic = "force-dynamic";

function cell(value: unknown) {
  if(value===null||value===undefined) return '""';
  let text=value instanceof Date?value.toISOString():String(value);
  if(typeof value==="string" && /^[=+\-@\t\r]/.test(text)) text=`'${text}`;
  return `"${text.replace(/"/g,'""')}"`;
}

export async function GET() {
  const {account}=await getActiveAccount();
  if(!account) return Response.json({error:"No account selected"},{status:404});
  const trades=await getTrades(account.id);
  const header=["Symbol","Direction","Opened","Closed","Entry","Exit","Size","Net P&L","Fees","Currency","Setup","Rating","Notes","Chart image","TradingView link"];
  const rows=trades.map((t)=>[t.symbol,t.direction,t.openedAt,t.closedAt,t.entryPrice,t.exitPrice,t.size,t.pnl,t.fees,account.currency,t.setup,t.rating,t.notes,t.chartImageUrl?new URL(t.chartImageUrl,"http://localhost").pathname:"",t.tradingviewUrl]);
  const csv="\uFEFF"+[header,...rows].map((r)=>r.map(cell).join(",")).join("\r\n");
  return new Response(csv,{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":'attachment; filename="journal-trades.csv"',"Cache-Control":"no-store"}});
}
