import { describe, it, expect } from "vitest";
import {
  parseProficiency,
  parseProficiencyForChar,
  emptyProficiency,
  groupUsable,
  addPoints,
  cultivationCost,
  cultivationCount,
  capGain,
  effectiveStatCap,
  applyCultivation,
  recommendedCultivationStats,
  setGroupTier,
  spendProficiency,
  signatureLearnCost,
  advanceCumLevelReq,
  tierLevelCap,
  addCumLevel,
  groupCumLevel,
  totalCumLevel,
  V2_SIGNATURE_LEARN_COST,
} from "./proficiency";

// P4 — 직군 키는 4직군(warrior/martial/mage/rogue). 프로필: warrior {str2,vit1,dex1}.
describe("v2 직업 숙달 (숙달 포인트)", () => {
  it("parse — 손상/빈 입력은 빈 상태", () => {
    expect(parseProficiency(null)).toEqual(emptyProficiency());
    expect(parseProficiency("x")).toEqual(emptyProficiency());
    expect(parseProficiency({ groups: "bad" })).toEqual(emptyProficiency());
    expect(parseProficiency(undefined)).toEqual(emptyProficiency());
  });

  it("parse — points 마이그(옛 earned−spent), 의미없는 그룹 제외, 새 포맷 보존", () => {
    const p = parseProficiency({
      groups: {
        warrior: { earned: 100, spent: 30, cultivations: 5 }, // 옛 포맷 → points 70
        rogue: { earned: 5, spent: 5 }, // points 0·cult 0·tier1·cumLevel 0 → 제외
        mage: { points: 42, cultivations: 1 }, // 새 포맷 그대로
        martial: { earned: 50, spent: 60, cultivations: 3 }, // points 0(클램프) but cult 3 → 보존
        bad: { earned: "x" }, // 비수 → 제외
      },
    });
    expect(p.groups.warrior).toEqual({
      points: 70,
      cultivations: 5,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.rogue).toBeUndefined();
    expect(p.groups.mage).toEqual({
      points: 42,
      cultivations: 1,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.martial).toEqual({
      points: 0,
      cultivations: 3,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.bad).toBeUndefined();
  });

  it("parse — cumLevel: 필드 있으면 보존, 없으면 (tier-1)×50 시드, 음수/비수 폴백", () => {
    const p = parseProficiency({
      groups: {
        warrior: { points: 10, cumLevel: 137 }, // 명시값 보존
        rogue: { points: 10, tier: 3 }, // 필드없음 → (3-1)×50 = 100 시드
        mage: { points: 10, tier: 2, cumLevel: -4 }, // 비수(음수) → (2-1)×50 = 50 시드
      },
    });
    expect(p.groups.warrior.cumLevel).toBe(137);
    expect(p.groups.rogue.cumLevel).toBe(100);
    expect(p.groups.mage.cumLevel).toBe(50);
  });

  it("parseProficiencyForChar — 활성 직군은 현재 레벨 포함 시드, 비활성은 (tier-1)×50", () => {
    const raw = {
      groups: {
        warrior: { points: 10, tier: 1 }, // 활성·cumLevel 없음 → (1-1)×50 + level
        rogue: { points: 10, tier: 2 }, // 비활성·cumLevel 없음 → (2-1)×50, 레벨 미포함
      },
    };
    const p = parseProficiencyForChar(raw, { class: "warrior", level: 100 });
    expect(p.groups.warrior.cumLevel).toBe(100);
    expect(p.groups.rogue.cumLevel).toBe(50);
    const p2 = parseProficiencyForChar(
      { groups: { warrior: { points: 10, tier: 1, cumLevel: 7 } } },
      { class: "warrior", level: 100 },
    );
    expect(p2.groups.warrior.cumLevel).toBe(7);
    const p3 = parseProficiencyForChar(raw, {
      class: undefined,
      level: undefined,
    });
    expect(p3.groups.warrior.cumLevel).toBe(0);
  });

  it("parse — caps 는 수행 이득(0<c<60)만 보존, 옛 절대값(≥60)·비수 드롭", () => {
    const p = parseProficiency({
      groups: {},
      caps: { str: 30, dex: 0, vit: -4, int: "x", spi: 90 },
    });
    expect(p.caps.str).toBe(30);
    expect(p.caps.dex).toBeUndefined();
    expect(p.caps.vit).toBeUndefined();
    expect(p.caps.int).toBeUndefined();
    expect(p.caps.spi).toBeUndefined();
  });

  it("groupUsable — 직군 숙달 포인트 잔액(옛 earned−spent 통합)", () => {
    const p = parseProficiency({
      groups: {
        warrior: { earned: 100, spent: 30 },
        rogue: { points: 40 },
      },
    });
    expect(groupUsable(p, "warrior")).toBe(70);
    expect(groupUsable(p, "rogue")).toBe(40);
    expect(groupUsable(p, "none")).toBe(0);
  });

  it("addPoints — 잔액 += amount, 비파괴, caps/cultivations 보존, none/0 무변경", () => {
    const p0 = parseProficiency({
      groups: { warrior: { points: 5, cultivations: 2 } },
      caps: { str: 30 },
    });
    const p1 = addPoints(p0, "warrior", 3);
    expect(p1.groups.warrior).toEqual({
      points: 8,
      cultivations: 2,
      tier: 1,
      cumLevel: 0,
    });
    expect(p1.caps.str).toBe(30);
    expect(p0.groups.warrior.points).toBe(5);
    expect(addPoints(p1, "none", 5)).toBe(p1);
    expect(addPoints(p1, "warrior", 0)).toBe(p1);
  });

  it("cultivationCost — 올린 cap 총합 비례(8 + 합×5)", () => {
    expect(cultivationCost(0)).toBe(8);
    expect(cultivationCost(1)).toBe(13);
    expect(cultivationCost(10)).toBe(Math.round(8 + 10 * 5));
    expect(cultivationCost(100)).toBeGreaterThan(cultivationCost(10));
    expect(cultivationCost(-5)).toBe(8);
  });

  it("effectiveStatCap — floor + 헤드룸(45) + 수행이득, capGain", () => {
    const p = parseProficiency({ groups: {}, caps: { str: 30 } });
    expect(capGain(p, "str")).toBe(30);
    expect(capGain(p, "dex")).toBe(0);
    expect(effectiveStatCap(15, capGain(p, "str"))).toBe(90);
    expect(effectiveStatCap(15, capGain(p, "dex"))).toBe(60);
    expect(effectiveStatCap(72, 0)).toBe(117);
  });

  it("applyCultivation — 숙달 포인트 소모 + 프로필 cap 이득(앵커+2/관련+1) + cultivations++", () => {
    // 전사(warrior): 힘+2·활력+1·민첩+1. 잔액 100. 미수행 → 비용 8(cap합 0).
    const p = parseProficiency({ groups: { warrior: { points: 100 } } });
    const r = applyCultivation(p, "warrior");
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(8);
    expect(r!.mult).toBe(1);
    expect(r!.next.groups.warrior).toEqual({
      points: 92,
      cultivations: 1,
      tier: 1,
      cumLevel: 0,
    });
    expect(r!.next.caps.str).toBe(2);
    expect(r!.next.caps.vit).toBe(1);
    expect(r!.next.caps.dex).toBe(1);
    expect(r!.next.caps.luk).toBeUndefined(); // 프로필 외 미변
    expect(cultivationCount(r!.next, "warrior")).toBe(1);
    // 2회차 비용 = 8 + (올린 cap합 4)×5 = 28
    const r2 = applyCultivation(r!.next, "warrior");
    expect(r2!.cost).toBe(28);
    expect(p.groups.warrior.points).toBe(100);
  });

  it("applyCultivation — 크리티컬(rng) 으로 multX 이득", () => {
    const p = parseProficiency({ groups: { warrior: { points: 1000 } } });
    const r = applyCultivation(p, "warrior", () => 0); // r=0 < 0.015 → ×5
    expect(r!.mult).toBe(5);
    expect(r!.next.caps.str).toBe(2 * 5); // 앵커 2 ×5
    expect(r!.next.caps.dex).toBe(1 * 5);
  });

  it("applyCultivation — 잔액 부족/무직 직업군은 null", () => {
    const poor = parseProficiency({ groups: { warrior: { points: 5 } } });
    expect(applyCultivation(poor, "warrior")).toBeNull();
    expect(applyCultivation(poor, "none")).toBeNull();
    expect(applyCultivation(poor, "nonexistent")).toBeNull();
  });

  it("applyCultivation targetStat(자유 수행) — 선택 스탯 한 곳에 동일 총량(합 4), economy 불변", () => {
    const p = parseProficiency({ groups: { warrior: { points: 100 } } });
    // 전사 프로필(합 4) 무시하고 int 에 전부.
    const r = applyCultivation(p, "warrior", undefined, "int");
    expect(r!.cost).toBe(8);
    expect(r!.next.caps.int).toBe(4);
    expect(r!.next.caps.str).toBeUndefined();
    expect(r!.next.caps.vit).toBeUndefined();
    const r2 = applyCultivation(r!.next, "warrior", undefined, "int");
    expect(r2!.cost).toBe(28);
    expect(r2!.next.caps.int).toBe(8);
  });

  it("recommendedCultivationStats — 직군 권장 스탯(앵커 먼저), none/무효는 빈 배열", () => {
    const w = recommendedCultivationStats("warrior");
    expect(w[0]).toBe("str");
    expect(new Set(w)).toEqual(new Set(["str", "vit", "dex"]));
    expect(recommendedCultivationStats("martial")[0]).toBe("vit");
    expect(recommendedCultivationStats("none")).toEqual([]);
    expect(recommendedCultivationStats("nonexistent")).toEqual([]);
  });

  it("setGroupTier — max 차수 기록, 낮은 차수/none 무변경, 새 그룹 생성", () => {
    const p = parseProficiency({
      groups: { warrior: { points: 100, tier: 2 } },
    });
    expect(setGroupTier(p, "warrior", 3).groups.warrior.tier).toBe(3);
    expect(setGroupTier(p, "warrior", 1)).toBe(p);
    expect(setGroupTier(p, "none", 4)).toBe(p);
    expect(setGroupTier(p, "rogue", 2).groups.rogue).toEqual({
      points: 0,
      cultivations: 0,
      tier: 2,
      cumLevel: 0,
    });
  });

  it("spendProficiency — 숙달 포인트 차감, cap/cultivations 불변, 비파괴", () => {
    const p = parseProficiency({
      groups: { warrior: { points: 90, cultivations: 2 } },
    });
    const next = spendProficiency(p, "warrior", 80);
    expect(next).not.toBeNull();
    expect(next!.groups.warrior).toEqual({
      points: 10,
      cultivations: 2,
      tier: 1,
      cumLevel: 0,
    });
    expect(next!.caps).toEqual(p.caps);
    expect(groupUsable(next!, "warrior")).toBe(10);
    expect(p.groups.warrior.points).toBe(90);
  });

  it("spendProficiency — 잔액 부족이면 null, amount<=0 이면 그대로", () => {
    const p = parseProficiency({ groups: { warrior: { points: 50 } } });
    expect(spendProficiency(p, "warrior", 80)).toBeNull();
    expect(spendProficiency(p, "rogue", 10)).toBeNull();
    expect(spendProficiency(p, "warrior", 0)).toBe(p);
  });

  it("signatureLearnCost — 차수별 비용, 미지정 차수는 t1 폴백", () => {
    expect(signatureLearnCost(1)).toBe(V2_SIGNATURE_LEARN_COST[1]);
    expect(signatureLearnCost(2)).toBe(150);
    expect(signatureLearnCost(3)).toBe(250);
    expect(signatureLearnCost(4)).toBe(400);
    expect(signatureLearnCost(9)).toBe(V2_SIGNATURE_LEARN_COST[1]);
  });

  it("advanceCumLevelReq — 전직 차수별 직군 누적 레벨 임계, 1차/미지정은 Infinity", () => {
    expect(advanceCumLevelReq(2)).toBe(55);
    expect(advanceCumLevelReq(3)).toBe(110);
    expect(advanceCumLevelReq(4)).toBe(170);
    expect(advanceCumLevelReq(1)).toBe(Infinity);
    expect(advanceCumLevelReq(5)).toBe(Infinity);
  });

  it("addCumLevel/groupCumLevel/totalCumLevel — 누적, 비파괴, none/0 무변경", () => {
    const p0 = parseProficiency({
      groups: {
        warrior: { points: 10, cumLevel: 40 },
        rogue: { points: 10, cumLevel: 20 },
      },
    });
    expect(groupCumLevel(p0, "warrior")).toBe(40);
    expect(totalCumLevel(p0)).toBe(60);
    const p1 = addCumLevel(p0, "warrior", 3);
    expect(groupCumLevel(p1, "warrior")).toBe(43);
    expect(totalCumLevel(p1)).toBe(63);
    expect(p0.groups.warrior.cumLevel).toBe(40);
    expect(addCumLevel(p1, "none", 5)).toBe(p1);
    expect(addCumLevel(p1, "warrior", 0)).toBe(p1);
    expect(groupCumLevel(p0, "nonexistent")).toBe(0);
  });
});

describe("v2 직업 숙달 — 6→4 그룹 리키 마이그(P4)", () => {
  it("구 그룹키가 4직군으로 리키 — 검술→전사, 궁술→도적", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { points: 30, tier: 2, cumLevel: 80, cultivations: 4 },
        archer: { points: 10, tier: 1, cumLevel: 20 },
      },
    });
    expect(p.groups.swordsman).toBeUndefined();
    expect(p.groups.archer).toBeUndefined();
    expect(p.groups.warrior).toEqual({
      points: 30,
      tier: 2,
      cumLevel: 80,
      cultivations: 4,
    });
    expect(p.groups.rogue).toEqual({
      points: 10,
      tier: 1,
      cumLevel: 20,
      cultivations: 0,
    });
  });

  it("같은 job 으로 합쳐지는 옛 그룹은 머지 — 궁술+인술→도적(tier·cumLevel max, points·cult 합)", () => {
    const p = parseProficiency({
      groups: {
        archer: { points: 10, tier: 2, cumLevel: 60, cultivations: 3 },
        ninja: { points: 25, tier: 3, cumLevel: 120, cultivations: 1 },
      },
    });
    expect(p.groups.rogue).toEqual({
      points: 35, // 10 + 25
      cultivations: 4, // 3 + 1
      tier: 3, // max(2,3)
      cumLevel: 120, // max(60,120)
    });
  });

  it("마술+신술→마법사 머지", () => {
    const p = parseProficiency({
      groups: {
        mage: { points: 5, tier: 1, cumLevel: 30 },
        priest: { points: 8, tier: 2, cumLevel: 70 },
      },
    });
    expect(p.groups.mage).toEqual({
      points: 13,
      cultivations: 0,
      tier: 2,
      cumLevel: 70,
    });
  });
});

describe("tierLevelCap (환생 차수별 레벨캡 §3.1)", () => {
  it("1·2·3·4차 = 50·65·80·100", () => {
    expect(tierLevelCap(1)).toBe(50);
    expect(tierLevelCap(2)).toBe(65);
    expect(tierLevelCap(3)).toBe(80);
    expect(tierLevelCap(4)).toBe(100);
  });
  it("범위 밖 차수는 클램프 (≤1→1차, ≥4→4차)", () => {
    expect(tierLevelCap(0)).toBe(50);
    expect(tierLevelCap(9)).toBe(100);
  });
  it("단조 증가", () => {
    expect(tierLevelCap(1)).toBeLessThan(tierLevelCap(2));
    expect(tierLevelCap(2)).toBeLessThan(tierLevelCap(3));
    expect(tierLevelCap(3)).toBeLessThan(tierLevelCap(4));
  });
});
