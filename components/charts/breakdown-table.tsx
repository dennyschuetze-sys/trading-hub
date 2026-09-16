import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BreakdownRow } from "@/lib/stats";
import { formatMoney, formatR } from "@/lib/trading";
import { cn } from "@/lib/utils";

const tone = (v: number | null) => (v == null || v === 0 ? "" : v > 0 ? "text-profit" : "text-loss");

/** Tabelle mit eingebettetem Balken (von der Mitte nach links = Verlust, nach rechts = Gewinn). */
export function BreakdownTable({
  title,
  description,
  rows,
  currency,
  emptyText = "Noch keine Daten.",
  firstColumn = "",
}: {
  title: string;
  description?: string;
  rows: BreakdownRow[];
  currency: string;
  emptyText?: string;
  /** Überschrift der ersten Spalte, z. B. „Session“ */
  firstColumn?: string;
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <Card className="gap-3 py-5">
      <CardHeader className="px-5">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {description && <CardDescription className="text-xs">{description}</CardDescription>}
      </CardHeader>
      <CardContent className="px-0">
        {!rows.length ? (
          <p className="px-5 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            {/* Feste Spaltenbreiten: lange Bezeichnungen brechen um, statt die Tabelle zu verbreitern */}
            <Table className="min-w-[26rem] table-fixed">
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  {(
                    [
                      [firstColumn, "pl-5 text-left"],
                      ["Trades", "w-14 text-right"],
                      ["Winrate", "w-[4.25rem] text-right"],
                      ["Netto", "w-24 text-right"],
                      ["Ø R", "w-16 text-right"],
                    ] as const
                  ).map(([label, className]) => (
                    <TableHead
                      key={label || "name"}
                      className={cn("h-8 text-[0.6875rem] font-medium tracking-[0.07em] text-muted-foreground uppercase", className)}
                    >
                      {label}
                    </TableHead>
                  ))}
                  <TableHead className="hidden w-20 pr-5 2xl:table-cell" aria-hidden />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const width = `${(Math.abs(row.netPnl) / maxAbs) * 50}%`;
                  return (
                    <TableRow key={row.key} className="border-foreground/[0.04]">
                      <TableCell className="py-2.5 pl-5 break-words whitespace-normal" title={row.label}>
                        {row.label}
                      </TableCell>
                      <TableCell className="py-2.5 text-right tabular-nums text-muted-foreground">{row.count}</TableCell>
                      <TableCell className="py-2.5 text-right tabular-nums">{Math.round(row.winRate * 100)} %</TableCell>
                      <TableCell className={cn("py-2.5 text-right font-semibold tabular-nums", tone(row.netPnl))}>
                        {formatMoney(row.netPnl, currency, true)}
                      </TableCell>
                      <TableCell className={cn("py-2.5 text-right tabular-nums", tone(row.avgR))}>{formatR(row.avgR)}</TableCell>
                      <TableCell className="hidden py-2.5 pr-5 2xl:table-cell" aria-hidden>
                        <div className="relative h-1.5 w-full rounded-full bg-foreground/[0.04]">
                          <div className="absolute -inset-y-1 left-1/2 w-px bg-border" />
                          {row.netPnl !== 0 && (
                            <div
                              className="absolute inset-y-0 rounded-full"
                              style={{
                                width,
                                left: row.netPnl > 0 ? "calc(50% + 1px)" : undefined,
                                right: row.netPnl < 0 ? "calc(50% + 1px)" : undefined,
                                background: `color-mix(in oklch, var(${row.netPnl > 0 ? "--profit" : "--loss"}) 80%, transparent)`,
                              }}
                            />
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
