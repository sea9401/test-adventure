import { describe, it, expect } from "vitest";
import {
  parseProficiency,
  parseProficiencyForChar,
  emptyProficiency,
  totalEarned,
  groupEarned,
  groupUsable,
  addEarned,
  cultivationCost,
  cultivationCount,
  capGain,
  effectiveStatCap,
  applyCultivation,
  setGroupTier,
  spendProficiency,
  signatureLearnCost,
  advanceCumLevelReq,
  addCumLevel,
  groupCumLevel,
  totalCumLevel,
  V2_SIGNATURE_LEARN_COST,
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
    expect(p.groups.swordsman).toEqual({
      earned: 100,
      spent: 30,
      cultivations: 5,
      tier: 1,
      cumLevel: 0, // 필드 없음 → 마이그레이션 시드 (tier1-1)×50 = 0
    });
    expect(p.groups.archer).toBeUndefined();
    expect(p.groups.mage).toEqual({
      earned: 50,
      spent: 50,
      cultivations: 0,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.bad).toBeUndefined();
  });

  it("parse — cumLevel: 필드 있으면 보존, 없으면 (tier-1)×50 시드, 음수/비수 폴백", () => {
    const p = parseProficiency({
      groups: {
        swordsman: { earned: 10, cumLevel: 137 }, // 명시값 보존
        archer: { earned: 10, tier: 3 }, // 필드없음 → (3-1)×50 = 100 시드
        mage: { earned: 10, tier: 2, cumLevel: -4 }, // 비수(음수) → (2-1)×50 = 50 시드
      },
    });
    expect(p.groups.swordsman.cumLevel).toBe(137);
    expect(p.groups.archer.cumLevel).toBe(100);
    expect(p.groups.mage.cumLevel).toBe(50);
  });

  it("parseProficiencyForChar — 활성 직군은 현재 레벨 포함 시드, 비활성은 (tier-1)×50 (전직 영구차단 방지)", () => {
    const raw = {
      groups: {
        swordsman: { earned: 10, tier: 1 }, // 활성·cumLevel 없음 → (1-1)×50 + level
        archer: { earned: 10, tier: 2 }, // 비활성·cumLevel 없음 → (2-1)×50, 레벨 미포함
      },
    };
    // 옛 t1 Lv100 캐릭(field 없음): 활성 직군 시드 = 0 + 100 = 100 ≥ t2 게이트 55 → 전직 가능.
    const p = parseProficiencyForChar(raw, { class: "swordsman", level: 100 });
    expect(p.groups.swordsman.cumLevel).toBe(100);
    expect(p.groups.archer.cumLevel).toBe(50);
    // field 가 있으면 그대로(시드 미적용).
    const p2 = parseProficiencyForChar(
      { groups: { swordsman: { earned: 10, tier: 1, cumLevel: 7 } } },
      { class: "swordsman", level: 100 },
    );
    expect(p2.groups.swordsman.cumLevel).toBe(7);
    // 무직(class 없음/none)·잘못된 레벨도 안전.
    const p3 = parseProficiencyForChar(raw, { class: undefined, level: undefined });
    expect(p3.groups.swordsman.cumLevel).toBe(0); // 활성 직군 매칭 안 됨 → (1-1)×50
  });

  it("parse — caps 는 수행 이득(0<c<60)만 보존, 옛 절대값(≥60)·비수 드롭", () => {
    const p = parseProficiency({
      groups: {},
      caps: { str: 30, dex: 0, vit: -4, int: "x", spi: 90 },
    });
    expect(p.caps.str).toBe(30); // 양수 이득 보존
    expect(p.caps.dex).toBeUndefined(); // 0 → 미저장
    expect(p.caps.vit).toBeUndefined(); // 음수 → 폴백
    expect(p.caps.int).toBeUndefined(); // 비수
    expect(p.caps.spi).toBeUndefined(); // ≥60 = 옛 절대 cap → 마이그레이션 드롭
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
      caps: { str: 30 },
    });
    const p1 = addEarned(p0, "swordsman", 3);
    expect(p1.groups.swordsman).toEqual({
      earned: 8,
      spent: 1,
      cultivations: 2,
      tier: 1,
      cumLevel: 0,
    });
    expect(p1.caps.str).toBe(30); // caps(이득) 보존
    expect(p0.groups.swordsman.earned).toBe(5); // 원본 비파괴
    expect(addEarned(p1, "none", 5)).toBe(p1);
    expect(addEarned(p1, "swordsman", 0)).toBe(p1);
  });

  it("cultivationCost — 올린 cap 총합 비례(8 + 합×5)", () => {
    expect(cultivationCost(0)).toBe(8); // 미수행
    expect(cultivationCost(1)).toBe(13); // 8 + 1×5
    expect(cultivationCost(10)).toBe(Math.round(8 + 10 * 5)); // 58
    expect(cultivationCost(100)).toBeGreaterThan(cultivationCost(10));
    expect(cultivationCost(-5)).toBe(8); // 음수 클램프
  });

  it("effectiveStatCap — floor + 헤드룸(45) + 수행이득, capGain", () => {
    const p = parseProficiency({ groups: {}, caps: { str: 30 } });
    expect(capGain(p, "str")).toBe(30);
    expect(capGain(p, "dex")).toBe(0);
    // floor 15 + 헤드룸 45 + 이득 30 = 90
    expect(effectiveStatCap(15, capGain(p, "str"))).toBe(90);
    // 이득 0 → floor 15 + 45 = 60 (fresh 시작 cap)
    expect(effectiveStatCap(15, capGain(p, "dex"))).toBe(60);
    // floor 가 높아도 항상 그 위(+45) — floor>cap 핀 없음
    expect(effectiveStatCap(72, 0)).toBe(117);
  });

  it("applyCultivation — 사용가능 소모 + 프로필 cap 이득(앵커+2/관련+1) + cultivations++", () => {
    // 검사(swordsman): 힘+2·민첩+1·행운+1. 사용가능 100. 미수행 → 비용 8(cap합 0).
    const p = parseProficiency({
      groups: { swordsman: { earned: 100, spent: 0, cultivations: 0 } },
    });
    const r = applyCultivation(p, "swordsman");
    expect(r).not.toBeNull();
    expect(r!.cost).toBe(8);
    expect(r!.mult).toBe(1); // rng 없음 → 크리 없음
    expect(r!.next.groups.swordsman).toEqual({
      earned: 100,
      spent: 8,
      cultivations: 1,
      tier: 1,
      cumLevel: 0,
    });
    // caps = 수행 이득(0부터 +프로필)
    expect(r!.next.caps.str).toBe(2);
    expect(r!.next.caps.dex).toBe(1);
    expect(r!.next.caps.luk).toBe(1);
    expect(r!.next.caps.vit).toBeUndefined(); // 프로필 외 미변
    expect(cultivationCount(r!.next, "swordsman")).toBe(1);
    // 2회차 비용 = 8 + (올린 cap합 4)×5 = 28
    const r2 = applyCultivation(r!.next, "swordsman");
    expect(r2!.cost).toBe(28);
    // 비파괴
    expect(p.groups.swordsman.spent).toBe(0);
  });

  it("applyCultivation — 크리티컬(rng) 으로 multX 이득", () => {
    const p = parseProficiency({
      groups: { swordsman: { earned: 1000, spent: 0, cultivations: 0 } },
    });
    const r = applyCultivation(p, "swordsman", () => 0); // r=0 < 0.015 → ×5
    expect(r!.mult).toBe(5);
    expect(r!.next.caps.str).toBe(2 * 5); // 앵커 2 ×5
    expect(r!.next.caps.dex).toBe(1 * 5);
  });

  it("applyCultivation — 사용가능 부족/무직 직업군은 null", () => {
    const poor = parseProficiency({
      groups: { swordsman: { earned: 5, spent: 0, cultivations: 0 } },
    });
    expect(applyCultivation(poor, "swordsman")).toBeNull(); // 5 < 8
    expect(applyCultivation(poor, "none")).toBeNull();
    expect(applyCultivation(poor, "nonexistent")).toBeNull();
  });

  it("setGroupTier — max 차수 기록, 낮은 차수/none 무변경, 새 그룹 생성", () => {
    const p = parseProficiency({
      groups: { swordsman: { earned: 100, spent: 0, cultivations: 0, tier: 2 } },
    });
    expect(setGroupTier(p, "swordsman", 3).groups.swordsman.tier).toBe(3);
    expect(setGroupTier(p, "swordsman", 1)).toBe(p); // 낮음 → 무변경(동일 참조)
    expect(setGroupTier(p, "none", 4)).toBe(p);
    expect(setGroupTier(p, "archer", 2).groups.archer).toEqual({
      earned: 0,
      spent: 0,
      cultivations: 0,
      tier: 2,
      cumLevel: 0,
    });
  });

  it("spendProficiency — 사용가능 소모(spent↑), cap/cultivations 불변, 비파괴", () => {
    const p = parseProficiency({
      groups: { swordsman: { earned: 100, spent: 10, cultivations: 2 } },
    });
    const next = spendProficiency(p, "swordsman", 80);
    expect(next).not.toBeNull();
    expect(next!.groups.swordsman).toEqual({
      earned: 100,
      spent: 90,
      cultivations: 2, // 학습은 수행 횟수 미증가
      tier: 1,
      cumLevel: 0,
    });
    expect(next!.caps).toEqual(p.caps); // cap 불변
    expect(groupUsable(next!, "swordsman")).toBe(10);
    // 비파괴
    expect(p.groups.swordsman.spent).toBe(10);
  });

  it("spendProficiency — 사용가능 부족이면 null, amount<=0 이면 그대로", () => {
    const p = parseProficiency({
      groups: { swordsman: { earned: 50, spent: 0, cultivations: 0 } },
    });
    expect(spendProficiency(p, "swordsman", 80)).toBeNull(); // 50 < 80
    expect(spendProficiency(p, "archer", 10)).toBeNull(); // 그룹 없음
    expect(spendProficiency(p, "swordsman", 0)).toBe(p); // no-op
  });

  it("signatureLearnCost — 차수별 비용, 미지정 차수는 t1 폴백", () => {
    expect(signatureLearnCost(1)).toBe(V2_SIGNATURE_LEARN_COST[1]);
    expect(signatureLearnCost(2)).toBe(150);
    expect(signatureLearnCost(3)).toBe(250);
    expect(signatureLearnCost(4)).toBe(400);
    expect(signatureLearnCost(9)).toBe(V2_SIGNATURE_LEARN_COST[1]); // 폴백
  });

  it("advanceCumLevelReq — 전직 차수별 직군 누적 레벨 임계, 1차/미지정은 Infinity", () => {
    expect(advanceCumLevelReq(2)).toBe(55);
    expect(advanceCumLevelReq(3)).toBe(110);
    expect(advanceCumLevelReq(4)).toBe(170);
    expect(advanceCumLevelReq(1)).toBe(Infinity); // 1차는 전직 도달점 아님
    expect(advanceCumLevelReq(5)).toBe(Infinity);
  });

  it("addCumLevel/groupCumLevel/totalCumLevel — 누적, 비파괴, none/0 무변경", () => {
    const p0 = parseProficiency({
      groups: {
        swordsman: { earned: 10, cumLevel: 40 },
        archer: { earned: 10, cumLevel: 20 },
      },
    });
    expect(groupCumLevel(p0, "swordsman")).toBe(40);
    expect(totalCumLevel(p0)).toBe(60); // 40 + 20
    const p1 = addCumLevel(p0, "swordsman", 3); // 레벨 3 오름
    expect(groupCumLevel(p1, "swordsman")).toBe(43);
    expect(totalCumLevel(p1)).toBe(63);
    expect(p0.groups.swordsman.cumLevel).toBe(40); // 원본 비파괴
    expect(addCumLevel(p1, "none", 5)).toBe(p1); // none 무변경
    expect(addCumLevel(p1, "swordsman", 0)).toBe(p1); // 0 무변경
    expect(groupCumLevel(p0, "nonexistent")).toBe(0);
  });
});
