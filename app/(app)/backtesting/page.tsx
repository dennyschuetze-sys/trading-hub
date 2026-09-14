import { ComingSoon } from "@/components/layout/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      href="/backtesting"
      features={[
        "Backtest-Sessions je Strategie",
        "Vergleich Backtest vs. Live",
        "Setup-Galerie mit A+-Beispielen",
      ]}
    />
  );
}
