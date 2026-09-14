import { unzipSync } from "fflate";
import { ImportError } from "./types";
import type { Rows } from "./cells";

/**
 * Liest das erste Tabellenblatt einer XLSX-Datei als Textzeilen.
 * Bewusst eigene Umsetzung: MetaTrader 5 schreibt die XML-Dateien in UTF-16,
 * woran gängige Excel-Bibliotheken scheitern.
 */
export function readXlsxRows(bytes: Uint8Array): Rows {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === "xl/sharedStrings.xml" || f.name === "xl/workbook.xml" || f.name.startsWith("xl/worksheets/sheet"),
    });
  } catch {
    throw new ImportError("Die Excel-Datei konnte nicht geöffnet werden.");
  }

  const sheetName = Object.keys(files)
    .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
    .sort((a, b) => Number(a.match(/\d+/)![0]) - Number(b.match(/\d+/)![0]))[0];
  if (!sheetName) throw new ImportError("Die Excel-Datei enthält kein Tabellenblatt.");

  const shared = files["xl/sharedStrings.xml"]
    ? [...decodeXml(files["xl/sharedStrings.xml"]).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textRuns(m[1]))
    : [];

  const rows: Rows = [];
  for (const rowMatch of decodeXml(files[sheetName]).matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row: string[] = [];
    for (const cell of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1];
      const inner = cell[2] ?? "";
      const ref = attrs.match(/\br="([A-Z]+)\d+"/)?.[1];
      const type = attrs.match(/\bt="(\w+)"/)?.[1];
      const raw = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];

      let value = "";
      if (type === "s" && raw != null) value = shared[Number(raw)] ?? "";
      else if (type === "inlineStr") value = textRuns(inner);
      else if (raw != null) value = unescapeXml(raw);

      const col = ref ? columnIndex(ref) : row.length;
      while (row.length < col) row.push("");
      row[col] = value;
    }
    rows.push(row);
  }
  return rows;
}

function decodeXml(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  return new TextDecoder("utf-8").decode(bytes);
}

function textRuns(xml: string): string {
  return [...xml.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => unescapeXml(t[1])).join("");
}

function unescapeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}
