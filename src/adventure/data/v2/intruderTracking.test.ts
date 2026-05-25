import { describe, expect, it } from "vitest";
import {
  INTRUDER_TTL_MS,
  isIntruderActive,
  parseEjectedFrom,
  parseLastHuntedOutpost,
} from "./intruderTracking";

describe("parseLastHuntedOutpost", () => {
  it("정상 모양", () => {
    expect(
      parseLastHuntedOutpost({ outpostId: "fort_a", at: 1000 }),
    ).toEqual({ outpostId: "fort_a", at: 1000 });
  });
  it("빈 outpostId / 음수 at / NaN 거부", () => {
    expect(parseLastHuntedOutpost({ outpostId: "", at: 1000 })).toBeNull();
    expect(parseLastHuntedOutpost({ outpostId: "x", at: -1 })).toBeNull();
    expect(parseLastHuntedOutpost({ outpostId: "x", at: NaN })).toBeNull();
    expect(parseLastHuntedOutpost({ outpostId: "x" })).toBeNull();
  });
  it("null / 비-객체 거부", () => {
    expect(parseLastHuntedOutpost(null)).toBeNull();
    expect(parseLastHuntedOutpost(undefined)).toBeNull();
    expect(parseLastHuntedOutpost("string")).toBeNull();
  });
});

describe("parseEjectedFrom", () => {
  it("정상 모양", () => {
    expect(
      parseEjectedFrom({ outpostId: "fort_a", byGuildId: 7, at: 1000 }),
    ).toEqual({ outpostId: "fort_a", byGuildId: 7, at: 1000 });
  });
  it("byGuildId 누락 / 잘못된 타입 거부", () => {
    expect(parseEjectedFrom({ outpostId: "x", at: 1 })).toBeNull();
    expect(
      parseEjectedFrom({ outpostId: "x", byGuildId: "7", at: 1 }),
    ).toBeNull();
  });
});

describe("isIntruderActive", () => {
  const now = 1_000_000_000;

  it("last 없음 → false", () => {
    expect(isIntruderActive(null, "x", now)).toBe(false);
  });

  it("outpostId 불일치 → false", () => {
    expect(
      isIntruderActive({ outpostId: "other", at: now }, "x", now),
    ).toBe(false);
  });

  it("TTL 안 = true (방금 사냥)", () => {
    expect(
      isIntruderActive({ outpostId: "x", at: now }, "x", now),
    ).toBe(true);
  });

  it("TTL 경계: 정확히 TTL 만큼 지났을 때 true (>= 비교)", () => {
    expect(
      isIntruderActive({ outpostId: "x", at: now - INTRUDER_TTL_MS }, "x", now),
    ).toBe(true);
  });

  it("TTL 1ms 초과 → false", () => {
    expect(
      isIntruderActive(
        { outpostId: "x", at: now - INTRUDER_TTL_MS - 1 },
        "x",
        now,
      ),
    ).toBe(false);
  });
});
