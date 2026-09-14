import Link from "next/link";
import { ArrowLeft, NotebookText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/layout/page-header";
import { isPeriodType, periodLabel } from "@/lib/periods";
import { createClient } from "@/lib/supabase/server";
import { formatMoney, plural } from "@/lib/trading";

type StoredStats = {
  trades?: number;
  pnlByCurrency?: [string, number][];
  discipline?: number | null;
  violations?: number;
};

function readStats(value: unknown): StoredStats {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as StoredStats) : {};
}

export default async function ReviewsPage() {
  const supabase = await createClient();
  const { data: reviews } = await supabase
    .from("reviews")
    .select("*")
    .order("period_start", { ascending: false })
    .order("period_type")
    .limit(200);
  const list = (reviews ?? []).filter((r) => isPeriodType(r.period_type));

  return (
    <>
      <PageHeader title="Alle Reviews" description={`${list.length} ${list.length === 1 ? "Review" : "Reviews"}`}>
        <Button variant="outline" asChild>
          <Link href="/goals">
            <ArrowLeft className="size-4" /> Ziele & Reviews
          </Link>
        </Button>
      </PageHeader>

      {!list.length ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <NotebookText className="size-8 text-muted-foreground" />
            <p className="font-medium">Noch keine Wochen- oder Monatsreviews</p>
            <Button asChild>
              <Link href="/goals">Erstes Review schreiben</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.map((r) => {
            const type = r.period_type as "week" | "month";
            const stats = readStats(r.stats);
            const pnl = Array.isArray(stats.pnlByCurrency) ? stats.pnlByCurrency : [];
            return (
              <Card key={r.id} className="gap-3">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground">{type === "week" ? "Wochen-Review" : "Monats-Review"}</p>
                      <CardTitle>
                        <Link href={`/goals?period=${type}&start=${r.period_start}`} className="hover:underline">
                          {periodLabel(r.period_start, type)}
                        </Link>
                      </CardTitle>
                    </div>
                    {r.rating && (
                      <span className="text-sm whitespace-nowrap" aria-label={`Bewertung ${r.rating} von 5`}>
                        {"★".repeat(r.rating)}
                        <span className="text-muted-foreground">{"★".repeat(5 - r.rating)}</span>
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground tabular-nums">
                    {[
                      pnl.length ? pnl.map(([c, v]) => formatMoney(Number(v), String(c), true)).join(" · ") : null,
                      typeof stats.trades === "number" ? plural(stats.trades, "Trade", "Trades") : null,
                      typeof stats.discipline === "number" ? `Disziplin ${stats.discipline}` : null,
                      typeof stats.violations === "number" && stats.violations > 0 ? `${stats.violations} mit Regelverstoß` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                </CardHeader>
                <CardContent className="grid gap-3 text-sm">
                  {(
                    [
                      ["Was lief gut?", r.went_well],
                      ["Was mache ich besser?", r.to_improve],
                      ["Lektionen", r.lessons],
                      ["Fokus danach", r.next_focus],
                    ] as const
                  ).map(([title, body]) =>
                    body ? (
                      <div key={title}>
                        <p className="text-xs font-medium text-muted-foreground">{title}</p>
                        <p className="line-clamp-4 whitespace-pre-wrap">{body}</p>
                      </div>
                    ) : null,
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
