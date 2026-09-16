import Link from "next/link";
import { ArrowRight, NotebookPen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { formatDateTime, formatMoney, formatR, pnlClass } from "@/lib/trading";
import { cn } from "@/lib/utils";

export type RecentTrade = {
  id: string;
  symbol: string;
  direction: string;
  closedAt: string;
  netPnl: number;
  r: number | null;
  currency: string;
  tags: string[];
  /** nur bei mehreren Accounts */
  account?: string;
};

/** Die letzten abgeschlossenen Trades, kompakt mit Session und Setup. */
export function RecentTradesCard({ trades }: { trades: RecentTrade[] }) {
  return (
    <Card className="gap-0 py-0">
      <CardContent className="grid content-start gap-1 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold">Letzte Trades</p>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/journal">
              Alle Trades <ArrowRight className="size-4" />
            </Link>
          </Button>
        </div>
        {trades.length ? (
          <ul className="divide-y">
            {trades.map((t) => (
              <li key={t.id}>
                <Link href={`/journal/${t.id}`} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-foreground/[0.04]">
                  <span
                    className={cn(
                      "w-14 shrink-0 rounded-md py-0.5 text-center text-[0.65625rem] font-bold tracking-wider",
                      t.direction === "long" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                    )}
                  >
                    {t.direction === "long" ? "LONG" : "SHORT"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{t.symbol}</p>
                    <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="shrink-0 tabular-nums">
                        {formatDateTime(t.closedAt)}
                        {t.account && ` · ${t.account}`}
                      </span>
                      {t.tags.map((tag) => (
                        <span key={tag} className="truncate rounded bg-foreground/[0.06] px-1.5 py-px">
                          {tag}
                        </span>
                      ))}
                    </p>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <p className={cn("font-semibold", pnlClass(t.netPnl))}>{formatMoney(t.netPnl, t.currency, true)}</p>
                    {t.r != null && <p className={cn("text-xs", pnlClass(t.r))}>{formatR(t.r)}</p>}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-sm text-muted-foreground">
            <NotebookPen className="size-6" aria-hidden /> Noch keine abgeschlossenen Trades
          </div>
        )}
      </CardContent>
    </Card>
  );
}
