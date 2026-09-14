import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { fetchStrategyOptions } from "@/lib/strategy-options";
import { createClient } from "@/lib/supabase/server";
import { TradeForm } from "../trade-form";

export default async function NewTradePage({ searchParams }: PageProps<"/journal/new">) {
  const { account } = await searchParams;
  const supabase = await createClient();
  const [{ data: accounts }, strategies] = await Promise.all([
    supabase.from("accounts").select("id, name, market").eq("status", "active").order("name"),
    fetchStrategyOptions(supabase),
  ]);

  return (
    <>
      <PageHeader
        title="Neuer Trade"
        description="Screenshots kannst du nach dem Speichern auf der Detailseite hinzufügen."
      />
      {accounts?.length ? (
        <TradeForm
          accounts={accounts}
          strategies={strategies}
          defaultAccountId={typeof account === "string" ? account : undefined}
        />
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="font-medium">Du brauchst zuerst einen aktiven Account.</p>
            <Button asChild>
              <Link href="/accounts/new">Account anlegen</Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </>
  );
}
