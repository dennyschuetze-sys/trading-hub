import { describe, expect, it } from "vitest";
import { BROKER_TIME_ZONE, parseFlexibleWallTime, parseIsoLikeWallTime, wallTimeToIso } from "./time";
import { dayBoundary } from "./trading";

const wall = (s: string) => parseIsoLikeWallTime(s)!;

describe("wallTimeToIso", () => {
  it("Berlin im Sommer (UTC+2) und Winter (UTC+1)", () => {
    expect(wallTimeToIso(wall("2026-07-15 16:31:21"), "Europe/Berlin")).toBe("2026-07-15T14:31:21.000Z");
    expect(wallTimeToIso(wall("2026-01-15 16:31:21"), "Europe/Berlin")).toBe("2026-01-15T15:31:21.000Z");
  });

  it("Broker-Serverzeit folgt der US-Sommerzeit (UTC+3 / UTC+2)", () => {
    expect(wallTimeToIso(wall("2026.07.15 17:31:21"), BROKER_TIME_ZONE)).toBe("2026-07-15T14:31:21.000Z");
    expect(wallTimeToIso(wall("2026.01.15 17:31:21"), BROKER_TIME_ZONE)).toBe("2026-01-15T15:31:21.000Z");
    // US-Sommerzeit beginnt vor der europäischen: am 20.03.2026 schon UTC+3
    expect(wallTimeToIso(wall("2026.03.20 12:00:00"), BROKER_TIME_ZONE)).toBe("2026-03-20T09:00:00.000Z");
  });

  it("UTC bleibt unverändert", () => {
    expect(wallTimeToIso(wall("2026-09-14 08:00"), "UTC")).toBe("2026-09-14T08:00:00.000Z");
  });
});

describe("parseFlexibleWallTime", () => {
  it.each([
    ["31. März 2026, 10:23", "2026-03-31 10:23"],
    ["26. Aug. 2026, 13:50", "2026-08-26 13:50"],
    ["14. Sept. 2026, 18:52", "2026-09-14 18:52"],
    ["3. Dez. 2025, 09:05", "2025-12-03 09:05"],
    ["Mar 31, 2026, 10:23", "2026-03-31 10:23"],
    ["2026-03-31 10:23:45", "2026-03-31 10:23:45"],
    ["31.03.2026 10:23", "2026-03-31 10:23"],
  ])("%s", (raw, expected) => {
    expect(parseFlexibleWallTime(raw)).toEqual(wall(expected));
  });

  it("unlesbar → null", () => {
    expect(parseFlexibleWallTime("gestern Abend")).toBeNull();
  });
});

describe("dayBoundary", () => {
  it("Tagesgrenzen in Berliner Zeit", () => {
    expect(dayBoundary("2026-09-14", "start")).toBe("2026-09-13T22:00:00.000Z");
    expect(dayBoundary("2026-09-14", "end")).toBe("2026-09-14T21:59:59.999Z");
    expect(dayBoundary("2026-01-10", "start")).toBe("2026-01-09T23:00:00.000Z");
  });
});
