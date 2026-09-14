import type { Tables } from "@/lib/database.types";

export type Strategy = Tables<"strategies">;
export type ChecklistItem = Tables<"strategy_checklist_items">;
export type Note = Tables<"playbook_notes">;

export const STRATEGY_STATUSES = [
  { value: "active", label: "Aktiv" },
  { value: "testing", label: "In Test" },
  { value: "archived", label: "Archiviert" },
];

/** „EURUSD, XAUUSD ,NQ“ → ["EURUSD", "XAUUSD", "NQ"] (ohne Duplikate) */
export function splitList(raw: string | null | undefined, max = 20): string[] {
  return [
    ...new Set(
      (raw ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => s.slice(0, 40)),
    ),
  ].slice(0, max);
}

/** Kurzer Textauszug aus Markdown für Listen. */
export function excerpt(markdown: string, length = 160): string {
  const plain = markdown
    .replace(/^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|?\s*$/gm, "") // Tabellen-Trennzeilen
    .replace(/\|/g, " ")
    .replace(/!\[[^\]]*]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*\s]+|\[[ x]]\s*/gim, "")
    .replace(/[*_`~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.length > length ? `${plain.slice(0, length).trimEnd()} …` : plain;
}
