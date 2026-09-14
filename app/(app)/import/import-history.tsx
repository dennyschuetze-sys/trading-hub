"use client";

import { useTransition } from "react";
import { Undo2 } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDateTime } from "@/lib/trading";
import { undoImport } from "./actions";

export type ImportBatchView = {
  id: string;
  created_at: string;
  file_name: string;
  source: string;
  imported_count: number;
  skipped_count: number;
  account_name: string;
  remaining: number;
};

const SOURCE_LABEL: Record<string, string> = { mt5: "MT5", mt4: "MT4", tradingview: "TradingView" };

export function ImportHistory({ batches }: { batches: ImportBatchView[] }) {
  const [pending, startTransition] = useTransition();
  if (!batches.length) return null;

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Bisherige Importe</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead>Datei</TableHead>
              <TableHead>Account</TableHead>
              <TableHead className="text-right">Importiert</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {batches.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="whitespace-nowrap">{formatDateTime(b.created_at)}</TableCell>
                <TableCell className="max-w-56">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{SOURCE_LABEL[b.source] ?? b.source}</Badge>
                    <span className="truncate" title={b.file_name}>
                      {b.file_name}
                    </span>
                  </div>
                </TableCell>
                <TableCell>{b.account_name}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {b.imported_count}
                  {b.skipped_count > 0 && <span className="text-muted-foreground"> (+{b.skipped_count} übersprungen)</span>}
                </TableCell>
                <TableCell className="text-right">
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="sm" disabled={pending || b.remaining === 0}>
                        <Undo2 className="size-4" /> Rückgängig
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Import rückgängig machen?</AlertDialogTitle>
                        <AlertDialogDescription>
                          {b.remaining} Trades aus „{b.file_name}“ werden gelöscht – auch Notizen und Screenshots, die du
                          inzwischen ergänzt hast. Der Account bleibt bestehen.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Abbrechen</AlertDialogCancel>
                        <AlertDialogAction
                          variant="destructive"
                          onClick={() =>
                            startTransition(async () => {
                              try {
                                await undoImport(b.id);
                                toast.success("Import rückgängig gemacht");
                              } catch {
                                toast.error("Rückgängig machen fehlgeschlagen");
                              }
                            })
                          }
                        >
                          Trades löschen
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
