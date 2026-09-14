import { ComingSoon } from "@/components/layout/coming-soon";

export default function Page() {
  return (
    <ComingSoon
      href="/risk"
      features={[
        "Positionsgrößen-Rechner für Lots und Kontrakte",
        "Tilt-Schutz und eigene Regeln",
        "Warnungen vor High-Impact-News",
      ]}
    />
  );
}
