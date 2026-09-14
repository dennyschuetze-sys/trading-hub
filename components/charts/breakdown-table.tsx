import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BreakdownRow } from "@/lib/stats";
import { formatMoney, formatR } from "@/lib/trading";

/** Tabelle mit eingebettetem Balken (von der Mitte nach links = Verlust, nach rechts = Gewinn). */
export function BreakdownTable({
  title,
  rows,
  currency,
  emptyText = "Noch keine Daten.",
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
  emptyText?: string;
}) {
  const maxAbs = Math.max(1, ...rows.map((r) => Math.abs(r.netPnl)));

  return (
    <Card className="gap-2">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {!rows.length ? (
          <p className="px-6 text-sm text-muted-foreground">{emptyText}</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="pl-6" />
                  <TableHead className="text-right">Trades</TableHead>
                  <TableHead className="text-right">Winrate</TableHead>
                  <TableHead className="hidden w-28 sm:table-cell" aria-hidden />
                  <TableHead className="text-right">Netto</TableHead>
                  <TableHead className="pr-6 text-right">Ø R</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const width = `${(Math.abs(row.netPnl) / maxAbs) * 50}%`;
                  return (
                    <TableRow key={row.key}>
                      <TableCell className="max-w-44 truncate pl-6 font-medium" title={row.label}>
                        {row.label}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.count}</TableCell>
                      <TableCell className="text-right tabular-nums">{Math.round(row.winRate * 100)} %</TableCell>
                      <TableCell className="hidden sm:table-cell" aria-hidden>
                        <div className="relative h-2 w-full">
                          <div className="absolute inset-y-[-2px] left-1/2 w-px bg-border" />
                          {row.netPnl !== 0 && (
                            <div
                              className="absolute inset-y-0"
                              style={{
                                width,
                                left: row.netPnl > 0 ? "calc(50% + 1px)" : undefined,
                                right: row.netPnl < 0 ? "calc(50% + 1px)" : undefined,
                                background: row.netPnl > 0 ? "var(--profit)" : "var(--loss)",
                                borderRadius: row.netPnl > 0 ? "0 4px 4px 0" : "4px 0 0 4px",
                              }}
                            />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatMoney(row.netPnl, currency, true)}
                      </TableCell>
                      <TableCell className="pr-6 text-right tabular-nums text-muted-foreground">{formatR(row.avgR)}</TableCell>
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
