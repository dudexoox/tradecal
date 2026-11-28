import Link from "next/link";
import { createTemplate, deleteTemplate, updateTemplate } from "@/app/template-actions";
import { DeleteButton } from "@/components/delete-button";
import { Icon } from "@/components/icons";
import { TemplateForm } from "@/components/template-form";
import { Empty, PageTitle, SectionTitle } from "@/components/ui";
import { db } from "@/db";
import { strategies } from "@/db/schema";
import { getTags, getTradeTemplates } from "@/lib/data";
import { requireUser } from "@/lib/auth";
import { fmtMoney, fmtPrice } from "@/lib/format";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  const sp = await searchParams;
  const userId = await requireUser();
  const [templates, allTags, strategyRows] = await Promise.all([
    getTradeTemplates(),
    getTags(),
    db
      .select({ id: strategies.id, name: strategies.name })
      .from(strategies)
      .where(eq(strategies.userId, userId))
      .orderBy(strategies.name),
  ]);

  const editing = sp.edit ? templates.find((template) => template.id === Number(sp.edit)) : undefined;

  return (
    <>
      <PageTitle
        title="Setup templates"
        subtitle="Save a setup once. Log the same trade again in a single click."
        action={
          <Link href="/trades/new" className="btn-primary">
            <Icon name="plus" size={16} />
            Log a trade
          </Link>
        }
      />

      <div className="space-y-5">
        {templates.length === 0 && !editing && (
          <Empty
            title="No templates yet"
            body="Create a template with your symbol, stop, target and risk — then every trade of that setup is one click away."
            action={{ href: "/templates?edit=new", label: "Create a template" }}
          />
        )}

        {editing ? (
          <TemplateForm
            action={updateTemplate.bind(null, editing.id)}
            template={editing}
            allTags={allTags}
            strategies={strategyRows}
          />
        ) : (
          <TemplateForm action={createTemplate} allTags={allTags} strategies={strategyRows} />
        )}

        {templates.length > 0 && (
          <section>
            <SectionTitle>Your templates</SectionTitle>
            <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {templates.map((template) => (
                <li key={template.id} className="card px-4 py-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold">{template.name}</p>
                      <p className="mt-1 text-[10px] text-muted">
                        <span className="num font-medium text-fg">{template.symbol}</span>
                        <span className="mx-1.5 text-line-2">·</span>
                        <span className="capitalize">{template.direction}</span>
                        {template.setup && (
                          <>
                            <span className="mx-1.5 text-line-2">·</span>
                            {template.setup}
                          </>
                        )}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-md border border-line bg-panel-2 px-1.5 py-0.5 text-[9px] uppercase text-muted">
                      {template.direction}
                    </span>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-line pt-3 text-[10px]">
                    <div className="flex justify-between gap-2">
                      <dt className="text-dim">Stop</dt>
                      <dd className="num">{fmtPrice(template.stopLoss)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-dim">Target</dt>
                      <dd className="num">{fmtPrice(template.takeProfit)}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-dim">Risk</dt>
                      <dd className="num">{template.riskAmount !== null ? fmtMoney(template.riskAmount) : "—"}</dd>
                    </div>
                    <div className="flex justify-between gap-2">
                      <dt className="text-dim">Size</dt>
                      <dd className="num">{template.size !== null ? template.size : "—"}</dd>
                    </div>
                  </dl>

                  {template.tags.length > 0 && (
                    <p className="mt-2 truncate text-[10px] text-dim">{template.tags.join(" · ")}</p>
                  )}

                  <div className="mt-3 flex items-center gap-2 border-t border-line pt-3">
                    <Link href={`/trades/new?template=${template.id}`} className="btn-primary h-8 px-3 text-[11px]">
                      <Icon name="sparkles" size={12} />
                      Use
                    </Link>
                    <Link href={`/templates?edit=${template.id}`} className="btn-ghost h-8 px-3 text-[11px]">
                      Edit
                    </Link>
                    <DeleteButton
                      action={deleteTemplate.bind(null, template.id)}
                      label="Delete"
                      confirmText={`Delete the template “${template.name}”?`}
                      className="ml-auto rounded-md px-2 py-1 text-[10px] font-medium text-muted transition-colors hover:bg-down/10 hover:text-down"
                    />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
