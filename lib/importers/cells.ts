/** Hilfen zum Lesen von Tabellenzellen aus Broker-Exporten (Punkt als Dezimaltrennzeichen). */

export type Rows = string[][];

/** Zahl aus einer Zelle; Leerzeichen/geschützte Leerzeichen als Tausendertrenner erlaubt. */
export function cellNumber(value: string | undefined): number | null {
  if (value == null) return null;
  const s = value.replace(/[\s  ]/g, "");
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function cellText(value: string | undefined): string {
  return (value ?? "").replace(/ /g, " ").trim();
}

/** Sucht eine Beschriftung (z. B. „Konto:“) und gibt die nächste nicht-leere Zelle der Zeile zurück. */
export function findLabeledValue(rows: Rows, labels: string[]): string | undefined {
  const wanted = labels.map((l) => l.toLowerCase());
  for (const row of rows) {
    const idx = row.findIndex((c) => wanted.includes(cellText(c).toLowerCase()));
    if (idx === -1) continue;
    const value = row.slice(idx + 1).map(cellText).find(Boolean);
    if (value) return value;
  }
  return undefined;
}

/** Minimaler CSV-Parser (RFC 4180): Anführungszeichen, Kommas und Zeilenumbrüche in Feldern. */
export function parseCsv(input: string): Rows {
  const text = input.replace(/^﻿/, "");
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";

  const rows: Rows = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
