import Link from "next/link";
import { BookOpen, FileText, Pin, Plus, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/layout/page-header";
import { fetchStatTrades } from "@/lib/queries";
import { summarize } from "@/lib/stats";
import { STRATEGY_STATUSES, excerpt } from "@/lib/strategies";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatMoney, labelFor } from "@/lib/trading";
import { cn } from "@/lib/utils";

const param = (v: string | string[] | undefined) => (typeof v === "string" && v.trim() ? v.trim() : undefined);

export default async function StrategiesPage({ searchParams }: PageProps<"/strategies">) {
  const sp = await searchParams;
  const q = param(sp.q);
  const tag = param(sp.tag);

  const supabase = await createClient();

  let notesQuery = supabase
    .from("playbook_notes")
    .select("id, title, content, tags, pinned, updated_at, strategy_id, strategies(name)")
    .order("pinned", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(100);
  if (q) notesQuery = notesQuery.textSearch("search", q, { type: "websearch", config: "german" });
  if (tag) notesQuery = notesQuery.contains("tags", [tag]);

  const [{ data: strategies }, { data: accounts }, { data: notes }, { data: allTags }, trades] = await Promise.all([
    supabase.from("strategies").select("id, name, summary, status, markets, timeframes, strategy_checklist_items(count)").order("status").order("name"),
    supabase.from("accounts").select("id, currency"),
    notesQuery,
    supabase.from("playbook_notes").select("tags"),
    fetchStatTrades(supabase),
  ]);

  const currencyOf = new Map((accounts ?? []).map((a) => [a.id, a.currency]));
  const tags = [...new Set((allTags ?? []).flatMap((n) => n.tags))].sort((a, b) => a.localeCompare(b, "de"));

  return (
    <>
      <PageHeader title="Strategien & Wissen" description="Deine Setups, Regeln und Erkenntnisse an einem Ort.">
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/strategies/notes/new">
              <FileText className="size-4" /> Neuer Artikel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/strategies/new">
              <Plus className="size-4" /> Neue Strategie
            </Link>
          </Button>
        </div>
      </PageHeader>

      <section className="mb-10 grid gap-3" aria-labelledby="strategien">
        <h2 id="strategien" className="text-lg font-semibold">
          Strategien
        </h2>
        {!strategies?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <BookOpen className="size-8 text-muted-foreground" />
              <p className="font-medium">Noch keine Strategie</p>
              <p className="max-w-md text-sm text-muted-foreground">
                Schreib dein Setup mit klaren Regeln und einer Checkliste auf. Danach ordnest du Trades zu und siehst, ob es funktioniert.
              </p>
              <Button asChild>
                <Link href="/strategies/new">Erste Strategie anlegen</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {strategies.map((s) => {
              const own = trades.filter((t) => t.strategy_id === s.id);
              const summary = summarize(own);
              const byCurrency = new Map<string, number>();
              own.forEach((t) => {
                if (t.status !== "closed" || t.net_pnl == null) return;
                const cur = currencyOf.get(t.account_id) ?? "USD";
                byCurrency.set(cur, Math.round(((byCurrency.get(cur) ?? 0) + t.net_pnl) * 100) / 100);
              });
              const checklistCount = s.strategy_checklist_items[0]?.count ?? 0;

              return (
                <Link key={s.id} href={`/strategies/${s.id}`} className="group">
                  <Card className={cn("h-full transition-colors group-hover:border-foreground/20", s.status === "archived" && "opacity-60")}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-2">
                        <CardTitle className="truncate">{s.name}</CardTitle>
                        <Badge variant={s.status === "active" ? "secondary" : "outline"}>{labelFor(STRATEGY_STATUSES, s.status)}</Badge>
                      </div>
                      {s.summary && <CardDescription className="line-clamp-2">{s.summary}</CardDescription>}
                    </CardHeader>
                    <CardContent className="grid gap-3">
                      <dl className="grid grid-cols-3 gap-2 text-sm">
                        <div>
                          <dt className="text-xs text-muted-foreground">Trades</dt>
                          <dd className="font-semibold">{summary.count}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Winrate</dt>
                          <dd className="font-semibold">{summary.winRate == null ? "–" : `${Math.round(summary.winRate * 100)} %`}</dd>
                        </div>
                        <div>
                          <dt className="text-xs text-muted-foreground">Netto</dt>
                          <dd className="truncate font-semibold">
                            {byCurrency.size ? [...byCurrency].map(([cur, v]) => formatMoney(v, cur, true)).join(" · ") : "–"}
                          </dd>
                        </div>
                      </dl>
                      <div className="flex flex-wrap gap-1.5">
                        {[...s.markets, ...s.timeframes].slice(0, 6).map((m) => (
                          <Badge key={m} variant="outline" className="font-normal">
                            {m}
                          </Badge>
                        ))}
                        {checklistCount > 0 && (
                          <Badge variant="outline" className="font-normal">
                            {checklistCount} Checklistenpunkte
                          </Badge>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      <section className="grid scroll-mt-20 gap-3" aria-labelledby="wissen-titel" id="wissen">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="wissen-titel" className="text-lg font-semibold">
            Wissen
          </h2>
          <form action="/strategies" className="flex w-full gap-2 sm:w-auto">
            {tag && <input type="hidden" name="tag" value={tag} />}
            <div className="relative flex-1 sm:w-72">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input name="q" defaultValue={q} placeholder="Artikel durchsuchen …" className="pl-8" aria-label="Artikel durchsuchen" />
            </div>
            <Button type="submit" variant="secondary">
              Suchen
            </Button>
          </form>
        </div>

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Nach Tag filtern">
            <Link
              href={q ? `/strategies?q=${encodeURIComponent(q)}#wissen` : "/strategies#wissen"}
              className={cn("rounded-full border px-3 py-1 text-xs", !tag ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
            >
              Alle
            </Link>
            {tags.map((t) => (
              <Link
                key={t}
                href={`/strategies?${new URLSearchParams({ ...(q ? { q } : {}), tag: t })}#wissen`}
                className={cn("rounded-full border px-3 py-1 text-xs", tag === t ? "bg-secondary font-medium" : "text-muted-foreground hover:text-foreground")}
              >
                {t}
              </Link>
            ))}
          </div>
        )}

        {!notes?.length ? (
          <Card>
            <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
              <FileText className="size-8 text-muted-foreground" />
              <p className="font-medium">{q || tag ? "Keine passenden Artikel" : "Noch keine Artikel"}</p>
              {!q && !tag && (
                <p className="max-w-md text-sm text-muted-foreground">
                  Halte fest, was du lernst: Marktbeobachtungen, Psychologie, Erkenntnisse aus Reviews.
                </p>
              )}
              <Button variant="outline" asChild>
                <Link href="/strategies/notes/new">Artikel schreiben</Link>
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {notes.map((n) => (
              <Link key={n.id} href={`/strategies/notes/${n.id}`} className="group">
                <Card className="h-full gap-2 py-4 transition-colors group-hover:border-foreground/20">
                  <CardHeader className="px-4">
                    <CardTitle className="flex items-center gap-2 text-base">
                      {n.pinned && <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Angeheftet" />}
                      <span className="truncate">{n.title}</span>
                    </CardTitle>
                    <CardDescription className="text-xs">
                      {formatDate(n.updated_at)}
                      {n.strategies?.name && ` · ${n.strategies.name}`}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="grid gap-2 px-4">
                    {n.content && <p className="line-clamp-2 text-sm text-muted-foreground">{excerpt(n.content)}</p>}
                    {n.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {n.tags.map((t) => (
                          <Badge key={t} variant="secondary" className="font-normal">
                            {t}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
