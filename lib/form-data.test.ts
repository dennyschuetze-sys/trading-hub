import { describe, expect, it } from "vitest";
import { FormError, parseNumber } from "./form-data";

describe("parseNumber", () => {
  it.each([
    ["10.000", 10000],
    ["100.000", 100000],
    ["1.000.000", 1000000],
    ["10.000,50", 10000.5],
    ["10,000.50", 10000.5],
    ["10,000", 10000],
    ["1,5", 1.5],
    ["-250", -250],
    ["-7,25", -7.25],
    ["5 000", 5000],
    ["€ 1.234,56", 1234.56],
  ])("Geldbetrag %s → %d", (raw, expected) => {
    expect(parseNumber(raw, "money")).toBe(expected);
  });

  it.each([
    ["157.123", 157.123],
    ["1.08512", 1.08512],
    ["4059,29", 4059.29],
    ["23362.75", 23362.75],
    ["0,01", 0.01],
    ["1.234,5", 1234.5],
  ])("Kurs %s → %d", (raw, expected) => {
    expect(parseNumber(raw, "price")).toBe(expected);
  });

  it.each(["abc", "", "1,2,3.4.5x"])("ungültig: %s", (raw) => {
    expect(() => parseNumber(raw)).toThrow(FormError);
  });
});
