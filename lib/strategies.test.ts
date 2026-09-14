import { describe, expect, it } from "vitest";
import { extractStoragePaths } from "./note-images";
import { excerpt, splitList } from "./strategies";

describe("splitList", () => {
  it("trennt, trimmt und entfernt Duplikate", () => {
    expect(splitList(" XAUUSD, NQ ,,XAUUSD")).toEqual(["XAUUSD", "NQ"]);
    expect(splitList(null)).toEqual([]);
  });
});

describe("excerpt", () => {
  it("entfernt Markdown-Syntax, Bilder und Tabellenzeichen", () => {
    const md = "## Titel\n**Fett** und [Link](https://x.de)\n![bild](storage://u/notes/a.png)\n| A | B |\n|---|---|\n| 1 | 2 |\n- [ ] offen";
    expect(excerpt(md)).toBe("Titel Fett und Link A B 1 2 offen");
  });

  it("kürzt lange Texte", () => {
    expect(excerpt("wort ".repeat(100), 20)).toMatch(/ …$/);
  });
});

describe("extractStoragePaths", () => {
  it("findet alle Bildpfade ohne Duplikate", () => {
    expect(
      extractStoragePaths("![a](storage://u1/notes/x.png) text ![b](storage://u1/notes/y.jpg)", null, "![a](storage://u1/notes/x.png)"),
    ).toEqual(["u1/notes/x.png", "u1/notes/y.jpg"]);
  });
});
