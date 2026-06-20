import { describe, it, expect } from "vitest";
import {
  FISHING_DAILY_CHALLENGES,
  type FishingDailyState,
  applyCatch,
  deriveFishingDailyViews,
  emptyFishingDaily,
  fishingDailyById,
  parseFishingDaily,
  rolloverFishingDaily,
} from "./fishingDailyChallenges";

const DAY = "2026-06-20";
const DAY2 = "2026-06-21";

describe("일일 낚시 도전 카탈로그", () => {
  it("id 고유 + goal/reward 양수 + 진행 함수", () => {
    const ids = new Set<string>();
    for (const d of FISHING_DAILY_CHALLENGES) {
      expect(ids.has(d.id)).toBe(false);
      ids.add(d.id);
      expect(d.goal).toBeGreaterThan(0);
      expect(d.rewardCoins).toBeGreaterThan(0);
      expect(typeof d.progress).toBe("function");
    }
    expect(fishingDailyById("d_catch8")).toBeDefined();
    expect(fishingDailyById("nope")).toBeUndefined();
  });
});

describe("parse 방어", () => {
  it("빈/이상 입력 → key='' 빈 상태", () => {
    expect(parseFishingDaily(null)).toEqual(emptyFishingDaily(""));
    expect(parseFishingDaily({})).toEqual(emptyFishingDaily(""));
    expect(parseFishingDaily(42)).toEqual(emptyFishingDaily(""));
  });

  it("유효 입력 + 종/수령 dedup + 무효 fishId·음수 방어", () => {
    const s = parseFishingDaily({
      key: DAY,
      caught: 5,
      rarePlus: -3, // 음수 → 0
      species: ["trout", "trout", "not_a_fish", "carp"], // dedup + 무효 제거
      claimed: ["d_catch8", "d_catch8", 7], // dedup + 비문자 제거
    });
    expect(s.key).toBe(DAY);
    expect(s.caught).toBe(5);
    expect(s.rarePlus).toBe(0);
    expect([...s.species].sort()).toEqual(["carp", "trout"]);
    expect(s.claimed).toEqual(["d_catch8"]);
  });
});

describe("rollover", () => {
  it("같은 날 키 → 그대로(동일 참조)", () => {
    const s: FishingDailyState = {
      key: DAY,
      caught: 3,
      rarePlus: 1,
      species: ["trout"],
      claimed: ["d_rare3"],
    };
    expect(rolloverFishingDaily(s, DAY)).toBe(s);
  });

  it("다른 날 키 → 빈 상태로 리셋", () => {
    const s: FishingDailyState = {
      key: DAY,
      caught: 9,
      rarePlus: 4,
      species: ["trout", "carp"],
      claimed: ["d_catch8"],
    };
    expect(rolloverFishingDaily(s, DAY2)).toEqual(emptyFishingDaily(DAY2));
  });
});

describe("applyCatch", () => {
  it("caught 증가 + 희귀↑는 마리 수 카운트(반복 포함) + 서로 다른 종만 species 누적", () => {
    let s = emptyFishingDaily(DAY);
    s = applyCatch(s, "crucian_carp", DAY); // common → rarePlus 제외
    s = applyCatch(s, "trout", DAY); // rare → rarePlus +1
    s = applyCatch(s, "trout", DAY); // rare 반복 → rarePlus +1(마리 수), species 중복 X
    s = applyCatch(s, "marlin", DAY); // epic → rarePlus +1
    expect(s.caught).toBe(4);
    expect(s.rarePlus).toBe(3); // 희귀 trout×2 + epic marlin×1 (마리 수)
    expect([...s.species].sort()).toEqual(["crucian_carp", "marlin", "trout"]);
  });

  it("입력 불변(순수)", () => {
    const base = emptyFishingDaily(DAY);
    applyCatch(base, "trout", DAY);
    expect(base).toEqual(emptyFishingDaily(DAY));
  });

  it("날 바뀌면 롤오버 후 카운트(어제 카운트 안 섞임)", () => {
    const yest: FishingDailyState = {
      key: DAY,
      caught: 7,
      rarePlus: 3,
      species: ["trout"],
      claimed: ["d_catch8"],
    };
    const s = applyCatch(yest, "crucian_carp", DAY2);
    expect(s.key).toBe(DAY2);
    expect(s.caught).toBe(1);
    expect(s.rarePlus).toBe(0);
    expect(s.species).toEqual(["crucian_carp"]);
    expect(s.claimed).toEqual([]);
  });
});

describe("deriveViews", () => {
  it("진행/완료/수령가능 — 미완료는 claimable=false", () => {
    const s: FishingDailyState = {
      key: DAY,
      caught: 8,
      rarePlus: 1,
      species: ["trout"],
      claimed: [],
    };
    const views = deriveFishingDailyViews(s);
    const catch8 = views.find((v) => v.id === "d_catch8")!;
    expect(catch8.progress).toBe(8);
    expect(catch8.complete).toBe(true);
    expect(catch8.claimable).toBe(true);
    const rare3 = views.find((v) => v.id === "d_rare3")!;
    expect(rare3.complete).toBe(false);
    expect(rare3.claimable).toBe(false);
  });

  it("수령됨이면 claimable=false + 진행은 goal 로 클램프", () => {
    const s: FishingDailyState = {
      key: DAY,
      caught: 99,
      rarePlus: 0,
      species: [],
      claimed: ["d_catch8"],
    };
    const v = deriveFishingDailyViews(s).find((x) => x.id === "d_catch8")!;
    expect(v.progress).toBe(v.goal); // 99 → goal 클램프
    expect(v.complete).toBe(true);
    expect(v.claimed).toBe(true);
    expect(v.claimable).toBe(false);
  });
});
