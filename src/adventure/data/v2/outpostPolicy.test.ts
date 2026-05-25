import { describe, expect, it } from "vitest";
import { evaluateOutpostEntry, normalizePolicy } from "./outpostPolicy";

describe("normalizePolicy", () => {
  it("알려진 값은 그대로", () => {
    expect(normalizePolicy("open")).toBe("open");
    expect(normalizePolicy("guild-only")).toBe("guild-only");
  });
  it("옛 alliance 와 알 수 없는 값은 open 으로 fallback", () => {
    expect(normalizePolicy("alliance")).toBe("open");
    expect(normalizePolicy("???")).toBe("open");
    expect(normalizePolicy("")).toBe("open");
  });
});

describe("evaluateOutpostEntry", () => {
  it("미점령(NPC) 거점은 정책 무관 허용 + 세금 면제", () => {
    expect(
      evaluateOutpostEntry({
        policy: "guild-only",
        occupiedByGuildId: null,
        viewerGuildId: 7,
      }),
    ).toEqual({ allowed: true, charge: "none" });
  });

  it("자기 길드 거점은 정책 무관 허용 + 세금 면제", () => {
    expect(
      evaluateOutpostEntry({
        policy: "guild-only",
        occupiedByGuildId: 3,
        viewerGuildId: 3,
      }),
    ).toEqual({ allowed: true, charge: "none" });
    expect(
      evaluateOutpostEntry({
        policy: "open",
        occupiedByGuildId: 3,
        viewerGuildId: 3,
      }),
    ).toEqual({ allowed: true, charge: "none" });
  });

  it("open + 다른 길드 = 허용 + 세금 부과", () => {
    expect(
      evaluateOutpostEntry({
        policy: "open",
        occupiedByGuildId: 3,
        viewerGuildId: 9,
      }),
    ).toEqual({ allowed: true, charge: "tax" });
  });

  it("guild-only + 다른 길드 = 거부", () => {
    expect(
      evaluateOutpostEntry({
        policy: "guild-only",
        occupiedByGuildId: 3,
        viewerGuildId: 9,
      }),
    ).toEqual({ allowed: false, reason: "guild_only" });
  });

  it("guild-only + 사냥자 무소속 = 거부 (자기 길드 아님)", () => {
    expect(
      evaluateOutpostEntry({
        policy: "guild-only",
        occupiedByGuildId: 3,
        viewerGuildId: null,
      }),
    ).toEqual({ allowed: false, reason: "guild_only" });
  });

  it("옛 alliance 정책은 open 처럼 처리 (다른 길드라도 허용 + 세금)", () => {
    expect(
      evaluateOutpostEntry({
        policy: "alliance",
        occupiedByGuildId: 3,
        viewerGuildId: 9,
      }),
    ).toEqual({ allowed: true, charge: "tax" });
  });

  it("알 수 없는 정책 문자열도 open 으로 fallback", () => {
    expect(
      evaluateOutpostEntry({
        policy: "future_unknown",
        occupiedByGuildId: 3,
        viewerGuildId: 9,
      }),
    ).toEqual({ allowed: true, charge: "tax" });
  });

  it("open + 사냥자 무소속 = 허용 + 세금 (방어 케이스, 1인 길드 자동생성 정상 user 는 발생 안 함)", () => {
    expect(
      evaluateOutpostEntry({
        policy: "open",
        occupiedByGuildId: 3,
        viewerGuildId: null,
      }),
    ).toEqual({ allowed: true, charge: "tax" });
  });
});
