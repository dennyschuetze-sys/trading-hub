import { describe, expect, it } from "vitest";
import { activeNavHref } from "./navigation";

describe("aktiver Menüpunkt", () => {
  it("nimmt den genauesten Pfad", () => {
    expect(activeNavHref("/plan/charts")).toBe("/plan/charts");
    expect(activeNavHref("/plan")).toBe("/plan");
    expect(activeNavHref("/plan/history")).toBe("/plan");
    expect(activeNavHref("/journal/123/edit")).toBe("/journal");
    expect(activeNavHref("/calendar")).toBe("/calendar");
    expect(activeNavHref("/news")).toBe("/news");
  });

  it("passt nur an Pfadgrenzen", () => {
    expect(activeNavHref("/planung")).toBeUndefined();
    expect(activeNavHref("/login")).toBeUndefined();
  });
});
