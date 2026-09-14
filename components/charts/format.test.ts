import { describe, expect, it } from "vitest";
import { niceTicks } from "./format";

describe("niceTicks", () => {
  it("runde Schritte, die den Bereich einschließen", () => {
    expect(niceTicks(9700, 12128)).toEqual([9000, 10000, 11000, 12000, 13000]);
    expect(niceTicks(-58, 262)).toEqual([-100, 0, 100, 200, 300]);
    expect(niceTicks(10000, 10615.77)).toEqual([10000, 10200, 10400, 10600, 10800]);
  });

  it("gleiche Werte bekommen einen Bereich", () => {
    expect(niceTicks(0, 0)).toEqual([-1, -0.5, 0, 0.5, 1]);
  });
});
