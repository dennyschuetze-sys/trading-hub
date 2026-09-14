import { PageHeader } from "@/components/layout/page-header";
import { createClient } from "@/lib/supabase/server";
import { ImportHistory, type ImportBatchView } from "./import-history";
import { ImportWizard } from "./import-wizard";

export default async function ImportPage() {
  const supabase = await createClient();
  const [{ data: accounts }, { data: batches }] = await Promise.all([
    supabase.from("accounts").select("id, name, currency, platform").order("name"),
    supabase
      .from("import_batches")
      .select("id, created_at, file_name, source, imported_count, skipped_count, accounts(name), trades(count)")
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  const history: ImportBatchView[] = (batches ?? []).map((b) => ({
    id: b.id,
    created_at: b.created_at,
    file_name: b.file_name,
    source: b.source,
    imported_count: b.imported_count,
    skipped_count: b.skipped_count,
    account_name: b.accounts?.name ?? "–",
    remaining: b.trades[0]?.count ?? 0,
  }));

  return (
    <>
      <PageHeader
        title="Import"
        description="Trades aus MetaTrader oder TradingView übernehmen. Die Datei wird in deinem Browser gelesen."
      />
      <ImportWizard accounts={accounts ?? []} />
      <ImportHistory batches={history} />
    </>
  );
}
