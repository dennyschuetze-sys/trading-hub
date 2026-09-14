import { ComingSoon } from "@/components/layout/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      href="/goals"
      features={[
        "Wochen- und Monatsziele",
        "Disziplin-Score und Streaks",
        "Wochen- und Monatsreviews",
      ]}
    />
  );
}
