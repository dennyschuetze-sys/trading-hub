import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { DeleteButton } from "@/components/forms/delete-button";
import { createClient } from "@/lib/supabase/server";
import { AccountForm } from "../../account-form";
import { deleteAccount } from "../../actions";

export default async function EditAccountPage({ params }: PageProps<"/accounts/[id]/edit">) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: account } = await supabase.from("accounts").select("*").eq("id", id).maybeSingle();
  if (!account) notFound();

  return (
    <>
      <PageHeader title={`${account.name} bearbeiten`}>
        <DeleteButton
          title="Account löschen?"
          description="Der Account und alle zugehörigen Trades samt Screenshots werden gelöscht. Das kann nicht rückgängig gemacht werden."
          onConfirm={deleteAccount.bind(null, account.id)}
        />
      </PageHeader>
      <AccountForm account={account} />
    </>
  );
}
