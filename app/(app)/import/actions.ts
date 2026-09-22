"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { guessSession } from "@/lib/trading";
import type { TablesInsert } from "@/lib/database.types";
import type { ImportSource, TradeImportRow } from "@/lib/importers/types";

const SOURCES: ImportSource[] = ["mt4", "mt5", "tradingview"];
const MAX_CHUNK = 500;

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  return supabase;
}

// Server Actions sind öffentliche Endpunkte: Eingaben vom Browser nie ungeprüft übernehmen
const finiteOrNull = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const isIso = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

function validateRow(row: TradeImportRow, index: number): Omit<TablesInsert<"trades">, "account_id"> {
  const fail = (msg: string) => {
    throw new Error(`Zeile ${index + 1}: ${msg}`);
  };
  if (typeof row.external_id !== "string" || !row.external_id || row.external_id.length > 100) fail("ungültige ID");
  if (typeof row.symbol !== "string" || !row.symbol || row.symbol.length > 30) fail("ungültiges Symbol");
  if (row.direction !== "long" && row.direction !== "short") fail("ungültige Richtung");
  if (!isIso(row.entry_time)) fail("ungültige Einstiegszeit");
  if (row.exit_time != null && !isIso(row.exit_time)) fail("ungültige Ausstiegszeit");
  const quantity = finiteOrNull(row.quantity);
  if (quantity == null || quantity <= 0) fail("ungültige Menge");
  const riskAmount = finiteOrNull(row.risk_amount);

  return {
    external_id: row.external_id,
    symbol: row.symbol.toUpperCase(),
    direction: row.direction,
    status: row.exit_time ? "closed" : "open",
    entry_time: row.entry_time,
    exit_time: row.exit_time ?? null,
    entry_price: finiteOrNull(row.entry_price),
    exit_price: finiteOrNull(row.exit_price),
    quantity: quantity!,
    stop_loss: finiteOrNull(row.stop_loss),
    take_profit: finiteOrNull(row.take_profit),
    pnl: finiteOrNull(row.pnl),
    commission: finiteOrNull(row.commission) ?? 0,
    swap: finiteOrNull(row.swap) ?? 0,
    risk_amount: riskAmount != null && riskAmount > 0 ? riskAmount : null,
    session: guessSession(row.entry_time),
  };
}

/** Liefert die IDs, die für diesen Account und diese Quelle schon importiert wurden. */
export async function findExistingExternalIds(accountId: string, source: ImportSource, externalIds: string[]) {
  const supabase = await requireUser();
  const existing = new Set<string>();
  for (let i = 0; i < externalIds.length; i += MAX_CHUNK) {
    const { data, error } = await supabase
      .from("trades")
      .select("external_id")
      .eq("account_id", accountId)
      .eq("source", source)
      .in("external_id", externalIds.slice(i, i + MAX_CHUNK));
    if (error) throw new Error(error.message);
    data.forEach((d) => d.external_id && existing.add(d.external_id));
  }
  return [...existing];
}

export async function createImportBatch(input: {
  accountId: string;
  source: ImportSource;
  fileName: string;
  totalCount: number;
}): Promise<{ batchId: string }> {
  const supabase = await requireUser();
  if (!SOURCES.includes(input.source)) throw new Error("Unbekannte Quelle");

  const { data, error } = await supabase
    .from("import_batches")
    .insert({
      account_id: input.accountId,
      source: input.source,
      file_name: String(input.fileName).slice(0, 200),
      total_count: Math.max(0, Math.floor(input.totalCount)),
    })
    .select("id")
    .single();
  if (error) throw new Error(`Import konnte nicht gestartet werden: ${error.message}`);
  return { batchId: data.id };
}

/**
 * Speichert einen Teil der Trades; bereits vorhandene (gleiche ID) werden übersprungen.
 * Bei vorhandenen Trades werden Risiko und Stop Loss nur dort ergänzt, wo das jeweilige
 * Feld noch leer ist – manuell eingetragene Werte bleiben unangetastet.
 */
export async function importTradeChunk(input: {
  batchId: string;
  rows: TradeImportRow[];
}): Promise<{ imported: number; skipped: number; completed: number }> {
  const supabase = await requireUser();
  if (!Array.isArray(input.rows) || input.rows.length > MAX_CHUNK) throw new Error("Ungültige Datenmenge");

  const { data: batch, error: batchError } = await supabase
    .from("import_batches")
    .select("id, account_id, source, imported_count, skipped_count")
    .eq("id", input.batchId)
    .single();
  if (batchError) throw new Error("Import nicht gefunden");

  const rows = input.rows.map((row, i) => ({
    ...validateRow(row, i),
    account_id: batch.account_id,
    source: batch.source,
    import_batch_id: batch.id,
  }));

  const { data, error } = await supabase
    .from("trades")
    .upsert(rows, { onConflict: "account_id,source,external_id", ignoreDuplicates: true })
    .select("id, external_id");
  if (error) throw new Error(`Speichern fehlgeschlagen: ${error.message}`);

  const imported = data.length;
  const skipped = rows.length - imported;

  const insertedIds = new Set(data.map((d) => d.external_id));
  const existing = rows.filter((r) => !insertedIds.has(r.external_id!));

  /**
   * Bestehende Trades nur dort ergänzen, wo das jeweilige Feld noch leer ist.
   * Jede Spalte braucht ihre eigene Bedingung – sonst würde ein erneuter Import
   * einen von Hand eingetragenen Stop Loss überschreiben, nur weil das Risiko fehlt.
   */
  const fill = async (column: "risk_amount" | "stop_loss") => {
    const pending = existing.filter((r) => r[column] != null);
    let filled = 0;
    for (let i = 0; i < pending.length; i += 25) {
      const results = await Promise.all(
        pending.slice(i, i + 25).map((r) =>
          supabase
            .from("trades")
            .update(column === "risk_amount" ? { risk_amount: r.risk_amount } : { stop_loss: r.stop_loss })
            .eq("account_id", batch.account_id)
            .eq("source", batch.source)
            .eq("external_id", r.external_id!)
            .is(column, null)
            .select("id"),
        ),
      );
      filled += results.reduce((n, res) => n + (res.data?.length ?? 0), 0);
    }
    return filled;
  };

  // „completed“ zählt weiterhin die ergänzten Risikobeträge – danach der Stop Loss
  const completed = await fill("risk_amount");
  await fill("stop_loss");
  // Die Chunks laufen nacheinander (siehe import-wizard), daher reicht Lesen + Schreiben
  const { error: countError } = await supabase
    .from("import_batches")
    .update({ imported_count: batch.imported_count + imported, skipped_count: batch.skipped_count + skipped })
    .eq("id", batch.id);
  if (countError) console.error("Import-Zähler nicht aktualisiert", countError);

  return { imported, skipped, completed };
}

export async function finishImport() {
  revalidatePath("/import");
  revalidatePath("/journal");
  revalidatePath("/accounts");
}

/** Löscht alle Trades eines Imports (inkl. nachträglich hinzugefügter Screenshots) und das Protokoll. */
export async function undoImport(batchId: string) {
  const supabase = await requireUser();

  const { data: shots } = await supabase
    .from("trade_screenshots")
    .select("storage_path, trades!inner(import_batch_id)")
    .eq("trades.import_batch_id", batchId);
  const paths = (shots ?? []).map((s) => s.storage_path);
  if (paths.length) await supabase.storage.from("screenshots").remove(paths);

  const { error: tradesError } = await supabase.from("trades").delete().eq("import_batch_id", batchId);
  if (tradesError) throw new Error(tradesError.message);
  const { error } = await supabase.from("import_batches").delete().eq("id", batchId);
  if (error) throw new Error(error.message);

  await finishImport();
}
