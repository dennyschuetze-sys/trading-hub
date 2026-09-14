import { PageHeader } from "@/components/layout/page-header";
import { AccountForm } from "../account-form";

export default function NewAccountPage() {
  return (
    <>
      <PageHeader title="Neuer Account" description="Lege ein Prop-Firm- oder eigenes Konto an." />
      <AccountForm />
    </>
  );
}
