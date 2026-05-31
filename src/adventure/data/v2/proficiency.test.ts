import { describe, it, expect } from "vitest";
import {
  parseProficiency,
  emptyProficiency,
  totalEarned,
  groupEarned,
  groupUsable,
  addEarned,
  cultivationCost,
  cultivationCount,
  statCap,
  applyCultivation,
  V2_STAT_CAP_BASE,
} from "./proficiency";

describe("v2 직업 숙련도", () => {
  it("parse — 손상/빈 입력은 빈 상태", () => {
    expect(parseProficiency(null)).toEqual(emptyProficiency());
    expect(parseProficiency("x")).toEqual(emptyProficiency());
    expect(parseProficiency({ groups: "bad" })).toEqual(emptyProficiency());
    expect(parseProficiency(undefined)).toEqual(emptyProficiency());
  });

  it("parse — earned>0 그룹만, 음수/비수 0, spent≤earned 클램프, cultivations 보존", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { earned: 100, spent: 30, cultivations: 5 },
        archer: { earned: -5, spent: 2 }, // earned 음수→0 → 제외
        mage: { earned: 50, spent: 200 }, // spent>earned → 50 클램프
        bad: { earned: "x" }, // 비수 → 제외
      },
    });
    expect(p.groups.swordsman).toEqual({ earned: 100, spent: 30, cultivations: 5 });
    expect(p.groups.archer).toBeUndefined();
    expect(p.groups.mage).toEqual({ earned: 50, spent: 50, cultivations: 0 });
    expect(p.groups.bad).toBeUndefined();
  });

  it("parse — caps 는 base 초과만 보존(기본값/손상 폴백)", () => {
    const p = parseProficiency({
      groups: {},
      caps: { str: 90, dex: V2_STAT_CAP_BASE, vit: 10, int: "x" },
    });
    expect(p.caps.str).toBe(90);
    expect(p.caps.dex).toBeUndefined(); // base 와 동일 → 미저장
    expect(p.caps.vit).toBeUndefined(); // base 미만 → 폴백
    expect(p.caps.int).toBeUndefined(); // 비수
  });

  it("총/직업/사용가능", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { earned: 100, spent: 30 },
        archer: { earned: 40, spent: 0 },
      },
    });
    expect(totalEarned(p)).toBe(140);
    expect(groupEarned(p, "swordsman")).toBe(100);
    expect(groupUsable(p, "swordsman")).toBe(70);
    expect(groupUsable(p, "none")).toBe(0);
  });

  it("addEarned — 비파괴, caps/cultivations 보존, none/0 무변경", () => {
    const p0 = parseProficiency({
      groups: { swordsman: { earned: 5, spent: 1, cultivations: 2 } },
      caps: { str: 70 },
    });
    const p1 = addEarned(p0, "swordsman", 3);
    expect(p1.groups.swordsman).toEqual({ earned: 8, spent: 1, cultivations: 2 });
    expect(p1.caps.str).toBe(70); // caps 보존
    expect(p0.groups.swordsman.earned).toBe(5); // 원본 비파괴
    expect(addEarned(p1, "none", 5)).toBe(p1);
    expect(addEarned(p1, "swordsman", 0)).toBe(p1);
  });

  it("cultivationCost — 8×1.12ⁿ 기하 증가", () => {
    expect(cultivationCost(0)).toBe(8);
    expect(cultivationCost(1)).toBe(Math.round(8 * 1.12));
    expect(cultivationCost(10)).toBeGreaterThan(cultivationCost(5));
    expect(cultivationCost(5)).toBeGreaterThan(cultivationCost(0));
  });

  it("statCap — 기본 base, 수행으로 상향분 반영", () => {
    const p = parseProficiency({ groups: {}, caps: { str: 90 } });
    expect(statCap(p, "str")).toBe(90);
    expect(statCap(p, "dex")).toBe(V2_STAT_CAP_BASE);
  });

  it("applyCultivation — 사용가능 소모 + 프로필 cap↑ + cultivations++", () => {
    // 검사(swordsman): 힘+3·민첩+1·행운+1. 사용가능 100, 1회차 비용 8.
    const p = parseProficiency({
      groups: { swordsman: { earned: 100, spent: 0, cultivations: 0 } },
    });
    const r = applyCultivation(p, "swordsman");
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(8);
    expect(r!.next.groups.swordsman).toEqual({ earned: 100, spent: 8, cultivations: 1 });
    expect(r!.next.caps.str).toBe(V2_STAT_CAP_BASE + 3);
    expect(r!.next.caps.dex).toBe(V2_STAT_CAP_BASE + 1);
    expect(r!.next.caps.luk).toBe(V2_STAT_CAP_BASE + 1);
    expect(r!.next.caps.vit).toBeUndefined(); // 프로필 외 미변
    expect(cultivationCount(r!.next, "swordsman")).toBe(1);
    // 비파괴
    expect(p.groups.swordsman.spent).toBe(0);
  });

  it("applyCultivation — 사용가능 부족/무직 직업군은 null", () => {
    const poor = parseProficiency({
      groups: { swordsman: { earned: 5, spent: 0, cultivations: 0 } },
    });
    expect(applyCultivation(poor, "swordsman")).toBeNull(); // 5 < 8
    expect(applyCultivation(poor, "none")).toBeNull();
    expect(applyCultivation(poor, "nonexistent")).toBeNull();
  });
});
