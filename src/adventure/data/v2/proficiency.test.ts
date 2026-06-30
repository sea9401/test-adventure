import { describe, it, expect } from "vitest";
import {
  parseProficiency,
  parseProficiencyForChar,
  emptyProficiency,
  usablePoints,
  addPoints,
  cultivationCost,
  cultivationCount,
  capGain,
  effectiveStatCap,
  applyCultivation,
  recommendedCultivationStats,
  setGroupTier,
  flattenGroupTiers,
  spendProficiency,
  signatureLearnCost,
  tierLevelCap,
  levelCapFor,
  addCumLevel,
  addReincarnation,
  addJobCumLevel,
  jobCumLevelOf,
  groupCumLevel,
  totalCumLevel,
  diminishedCumLevel,
  V2_FLOOR_DECAY_BAND,
  V2_FLOOR_DECAY_MIN,
  V2_SIGNATURE_LEARN_COST,
  proficiencyPerKillAtDepth,
} from "./proficiency";

describe("diminishedCumLevel (환생 누적 floor 감쇠)", () => {
  it("Infinity/NaN/음수 가드 — 0 반환(무한루프 방지)", () => {
    expect(diminishedCumLevel(Infinity)).toBe(0);
    expect(diminishedCumLevel(Number.NaN)).toBe(0);
    expect(diminishedCumLevel(-5)).toBe(0);
  });

  it("첫 밴드(<BAND)는 선형 그대로 — 현행 유지", () => {
    expect(diminishedCumLevel(0)).toBe(0);
    expect(diminishedCumLevel(V2_FLOOR_DECAY_BAND - 100)).toBe(
      V2_FLOOR_DECAY_BAND - 100,
    );
    expect(diminishedCumLevel(V2_FLOOR_DECAY_BAND)).toBe(V2_FLOOR_DECAY_BAND);
  });

  it("밴드 경계 위는 감쇠 — 선형보다 작음", () => {
    const cum = V2_FLOOR_DECAY_BAND * 2;
    expect(diminishedCumLevel(cum)).toBeLessThan(cum);
  });

  it("단조 증가·천장 없음 — 큰 입력도 최소 증가율(MIN) 이상 계속 오름", () => {
    const lo = V2_FLOOR_DECAY_BAND * 20;
    const hi = lo + V2_FLOOR_DECAY_BAND;
    // 바닥 밴드(MIN)에서도 한 밴드당 ≥ BAND×MIN 만큼 증가(천장 아님).
    expect(diminishedCumLevel(hi) - diminishedCumLevel(lo)).toBeGreaterThanOrEqual(
      V2_FLOOR_DECAY_BAND * V2_FLOOR_DECAY_MIN - 1,
    );
  });
});

// P4 — 직군 키는 선택 직군(warrior/martial/mage/rogue/survivor). 프로필: warrior {str2,vit1,dex1}.
describe("v2 직업 숙달 (숙달 포인트)", () => {
  it("parse — 손상/빈 입력은 빈 상태", () => {
    expect(parseProficiency(null)).toEqual(emptyProficiency());
    expect(parseProficiency("x")).toEqual(emptyProficiency());
    expect(parseProficiency({ groups: "bad" })).toEqual(emptyProficiency());
    expect(parseProficiency(undefined)).toEqual(emptyProficiency());
  });

  it("parse — points 전역 합산, 의미없는 그룹 제외, 새 포맷 보존", () => {
    const p = parseProficiency({
      groups: {
        warrior: { points: 70, cultivations: 5 },
        rogue: { points: 0 }, // points 0·cult 0·tier1·cumLevel 0 → 제외
        mage: { points: 42, cultivations: 1 },
        martial: { points: 0, cultivations: 3 }, // points 0 but cult 3 → 보존
        bad: { points: "x" }, // 매핑 불가 키 + 비수 → 제외(points 합산 안 됨)
      },
    });
    // 직군별 points(70+0+42+0)는 전역 단일 잔액으로 합산. bad 는 매핑 불가라 합산 제외.
    expect(usablePoints(p)).toBe(112);
    // 그룹은 비-포인트 데이터(수행/누적/차수)만 보존.
    expect(p.groups.warrior).toEqual({
      cultivations: 5,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.rogue).toBeUndefined();
    expect(p.groups.mage).toEqual({
      cultivations: 1,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.martial).toEqual({
      cultivations: 3,
      tier: 1,
      cumLevel: 0,
    });
    expect(p.groups.bad).toBeUndefined();
  });

  it("parse — cumLevel: 필드 있으면 보존, 없거나 음수/비수면 0(시드 마이그 폐지)", () => {
    const p = parseProficiency({
      groups: {
        warrior: { points: 10, cumLevel: 137 }, // 명시값 보존
        rogue: { points: 10, tier: 3 }, // 필드없음 → 0
        mage: { points: 10, tier: 2, cumLevel: -4 }, // 비수(음수) → 0
      },
    });
    expect(p.groups.warrior.cumLevel).toBe(137);
    expect(p.groups.rogue.cumLevel).toBe(0);
    expect(p.groups.mage.cumLevel).toBe(0);
  });

  it("parse — masteryScaleVersion 보존, 레거시 groups row 는 0으로 표시", () => {
    expect(parseProficiency({}).masteryScaleVersion).toBe(2);
    expect(parseProficiency({ groups: { warrior: { cumLevel: 1 } } }).masteryScaleVersion).toBe(0);
    expect(parseProficiency({ jobCumLevel: { paladin: 1 } }).masteryScaleVersion).toBe(0);
    expect(
      parseProficiency({
        masteryScaleVersion: 2,
        groups: { warrior: { cumLevel: 9 } },
      }).masteryScaleVersion,
    ).toBe(2);
  });

  it("parseProficiencyForChar — charSave 무시(시드 마이그 폐지), cumLevel 필드만 반영", () => {
    const raw = {
      groups: {
        warrior: { points: 10, tier: 2 }, // tier>1 라 그룹 보존·cumLevel 없음 → 0
        rogue: { points: 10, tier: 2 }, // cumLevel 없음 → 0
      },
    };
    const p = parseProficiencyForChar(raw, { class: "warrior", level: 100 });
    expect(p.groups.warrior.cumLevel).toBe(0);
    expect(p.groups.rogue.cumLevel).toBe(0);
    const p2 = parseProficiencyForChar(
      { groups: { warrior: { points: 10, tier: 1, cumLevel: 7 } } },
      { class: "warrior", level: 100 },
    );
    expect(p2.groups.warrior.cumLevel).toBe(7);
  });

  it("parse — none(모험가) 수행분 보존·cumLevel 항상 0, points 는 전역 합산", () => {
    // 모험가 수행 적립분: none 그룹 points 는 전역으로 합산(로드 때 안 사라짐), 수행 횟수는 그룹 유지.
    const p = parseProficiency({
      groups: { none: { points: 30, cultivations: 1 } }, // cumLevel 누락
    });
    expect(usablePoints(p)).toBe(30); // 전역 잔액으로 이관
    expect(p.groups.none?.cultivations).toBe(1); // 수행 횟수는 그룹 보존
    // 모험가(none)는 직군 정복/cumLevel 미사용 — 항상 0.
    expect(p.groups.none?.cumLevel).toBe(0);
    // 매핑 불가 키(parseV2Class→none)는 폐기.
    const q = parseProficiency({ groups: { 궁술: { points: 9 } } });
    expect(q.groups["궁술"]).toBeUndefined();
    expect(q.groups.none).toBeUndefined();
  });

  it("parse — caps 는 양수·유한만 보존(≥60 드롭 가드 폐지)", () => {
    const p = parseProficiency({
      groups: {},
      caps: { str: 30, dex: 0, vit: -4, int: "x", spi: 90 },
    });
    expect(p.caps.str).toBe(30);
    expect(p.caps.dex).toBeUndefined();
    expect(p.caps.vit).toBeUndefined();
    expect(p.caps.int).toBeUndefined();
    expect(p.caps.spi).toBe(90); // ≥60 도 보존(가드 폐지)
  });

  it("usablePoints — 캐릭터 전역 잔액(옛 직군별 points 합산 이관)", () => {
    const p = parseProficiency({
      groups: {
        warrior: { points: 70 },
        rogue: { points: 40 },
      },
    });
    // 옛 직군별 points(70+40)는 전역 단일 잔액으로 합산 — 전직해도 유지.
    expect(usablePoints(p)).toBe(110);
    // points 만 있던 그룹은 합산 후 폐기(숙련도/수행/차수 없음).
    expect(p.groups.warrior).toBeUndefined();
    expect(p.groups.rogue).toBeUndefined();
  });

  it("전역 points — 재전직(flattenGroupTiers)·전직 후에도 유지(버그 회귀 가드)", () => {
    // 제보 버그: 다른 직군으로 재전직하면 숙달 포인트가 0 으로 보였다 → 전역화로 해소.
    const p = parseProficiency({
      groups: { mage: { points: 5000, cumLevel: 100, tier: 2 } },
    });
    expect(usablePoints(p)).toBe(5000);
    // 마법사 → 도적 재전직(차수 평탄화 + 도적 그룹 보장) 해도 전역 잔액 그대로.
    const after = flattenGroupTiers(p, "rogue");
    expect(usablePoints(after)).toBe(5000);
    expect(after.groups.rogue).toEqual({ cultivations: 0, tier: 1, cumLevel: 0 });
    expect(after.groups.mage.tier).toBe(1); // 차수 정규화
    expect(after.groups.mage.cumLevel).toBe(100); // 직군 숙련도는 보존
  });

  it("addPoints — 전역 잔액 += amount, 비파괴, caps/그룹 보존, none 적립·프로필無/0 무변경", () => {
    const p0 = parseProficiency({
      groups: { warrior: { points: 5, cultivations: 2 } },
      caps: { str: 30 },
    });
    expect(usablePoints(p0)).toBe(5);
    const p1 = addPoints(p0, "warrior", 3);
    expect(usablePoints(p1)).toBe(8); // 5 + 3 (전역)
    // 그룹의 비-포인트 필드(수행 횟수 등)는 보존.
    expect(p1.groups.warrior).toEqual({ cultivations: 2, tier: 1, cumLevel: 0 });
    expect(p1.caps.str).toBe(30);
    expect(usablePoints(p0)).toBe(5); // 비파괴
    // none(모험가)도 수행 프로필 보유 → 적립(group 은 적립 자격 게이트, 잔액은 전역).
    expect(usablePoints(addPoints(p1, "none", 5))).toBe(13); // 8 + 5
    // 프로필 없는 그룹(빈/무효)·0 amount 는 여전히 무변경.
    expect(addPoints(p1, "bogus", 5)).toBe(p1);
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
    expect(usablePoints(r!.next)).toBe(92); // 100 − 8 (전역 차감)
    expect(r!.next.groups.warrior).toEqual({
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
    expect(usablePoints(p)).toBe(100); // 원본 비파괴
  });

  it("applyCultivation — 크리티컬(rng) 으로 multX 이득", () => {
    const p = parseProficiency({ groups: { warrior: { points: 1000 } } });
    const r = applyCultivation(p, "warrior", () => 0); // r=0 < 0.015 → ×5
    expect(r!.mult).toBe(5);
    expect(r!.next.caps.str).toBe(2 * 5); // 앵커 2 ×5
    expect(r!.next.caps.dex).toBe(1 * 5);
  });

  it("applyCultivation — 잔액 부족/모험가(none) 직업군은 null", () => {
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

  it("applyCultivation — 하이브리드(jobId)는 직군 아닌 직업 정체성 프로필로 cap 상승", () => {
    // 마검사·성기사 둘 다 저장 직군은 전사(warrior)지만 jobId 로 정체성 축이 오른다.
    const p = parseProficiency({ groups: { warrior: { points: 100 } } });
    // 마검사(spellblade) — 검(str)+마법(int). DEX/VIT 아님.
    const sb = applyCultivation(p, "warrior", undefined, undefined, "spellblade");
    expect(sb).not.toBeNull();
    expect(sb!.cost).toBe(8); // 합 4 → 비용 곡선 직군과 동일(economy 불변)
    expect(sb!.next.caps.str).toBe(2);
    expect(sb!.next.caps.int).toBe(2);
    expect(sb!.next.caps.dex).toBeUndefined();
    expect(sb!.next.caps.vit).toBeUndefined();
    // 성기사(templar) — 기사 힘·활력 + 사제 정신(str/vit/spi). DEX 아님.
    const tp = applyCultivation(p, "warrior", undefined, undefined, "templar");
    expect(tp!.next.caps.str).toBe(2);
    expect(tp!.next.caps.vit).toBe(1);
    expect(tp!.next.caps.spi).toBe(1);
    expect(tp!.next.caps.dex).toBeUndefined();
    // 혈성기사(bloodtemplar) — 광전사 힘·활력 + 사제 정신.
    const bt = applyCultivation(p, "warrior", undefined, undefined, "bloodtemplar");
    expect(bt!.next.caps.str).toBe(2);
    expect(bt!.next.caps.vit).toBe(1);
    expect(bt!.next.caps.spi).toBe(1);
    expect(bt!.next.caps.dex).toBeUndefined();
    // 성전사(crusader) — 성기사 심화도 같은 정체성 축을 유지한다.
    const cr = applyCultivation(p, "warrior", undefined, undefined, "crusader");
    expect(cr!.next.caps.str).toBe(2);
    expect(cr!.next.caps.vit).toBe(1);
    expect(cr!.next.caps.spi).toBe(1);
    expect(cr!.next.caps.dex).toBeUndefined();
    // 룬 기사(runeknight) — 마검사 심화도 검+마법 축을 유지한다.
    const rk = applyCultivation(p, "warrior", undefined, undefined, "runeknight");
    expect(rk!.next.caps.str).toBe(2);
    expect(rk!.next.caps.int).toBe(2);
    expect(rk!.next.caps.dex).toBeUndefined();
    expect(rk!.next.caps.vit).toBeUndefined();
    // 암흑사제(darkpriest) — 저장 직군은 도적이지만 행운·정신·지능 축이 오른다.
    const rogue = parseProficiency({ groups: { rogue: { points: 100 } } });
    const dp = applyCultivation(rogue, "rogue", undefined, undefined, "darkpriest");
    expect(dp!.next.caps.luk).toBe(2);
    expect(dp!.next.caps.spi).toBe(1);
    expect(dp!.next.caps.int).toBe(1);
    expect(dp!.next.caps.dex).toBeUndefined();
    // 비하이브리드 jobId 는 직군 프로필 폴백(전사 = str/vit/dex).
    const guardian = applyCultivation(p, "warrior", undefined, undefined, "guardian");
    expect(guardian!.next.caps.str).toBe(2);
    expect(guardian!.next.caps.dex).toBe(1);
    expect(guardian!.next.caps.int).toBeUndefined();
  });

  it("recommendedCultivationStats — 직군 권장 스탯(앵커 먼저), none=균형 4스탯·무효는 빈 배열", () => {
    const w = recommendedCultivationStats("warrior");
    expect(w[0]).toBe("str");
    expect(new Set(w)).toEqual(new Set(["str", "vit", "dex"]));
    expect(recommendedCultivationStats("martial")[0]).toBe("vit");
    expect(new Set(recommendedCultivationStats("survivor"))).toEqual(
      new Set(["vit", "spi", "str"]),
    );
    // none(모험가)도 수행 프로필 보유 → STR/VIT/DEX/INT 추천(2026-06-22).
    expect(new Set(recommendedCultivationStats("none"))).toEqual(
      new Set(["str", "vit", "dex", "int"]),
    );
    // 프로필 없는 무효 그룹만 빈 배열.
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
      cultivations: 0,
      tier: 2,
      cumLevel: 0,
    });
  });

  it("flattenGroupTiers — 모든 직업군 차수 1로 정규화 + ensureGroup 생성, 나머지 보존", () => {
    const p = parseProficiency({
      groups: {
        warrior: { points: 100, cultivations: 3, tier: 4, cumLevel: 120 },
        mage: { points: 5, tier: 1, cumLevel: 10 },
      },
      caps: { str: 7 },
    });
    const flat = flattenGroupTiers(p, "rogue");
    // 전역 points(100+5)는 보존(전직해도 유지).
    expect(usablePoints(flat)).toBe(105);
    // 옛 차수(4)가 1로 내려감 — setGroupTier 로는 불가능했던 하향.
    expect(flat.groups.warrior.tier).toBe(1);
    // cultivations/cumLevel 보존(차수만 정규화).
    expect(flat.groups.warrior).toEqual({
      cultivations: 3,
      tier: 1,
      cumLevel: 120,
    });
    // 이미 1차인 그룹은 보존(동일 참조).
    expect(flat.groups.mage).toBe(p.groups.mage);
    // ensureGroup 은 없으면 1차로 생성.
    expect(flat.groups.rogue).toEqual({
      cultivations: 0,
      tier: 1,
      cumLevel: 0,
    });
    // caps/grown 불변 + 비파괴(원본 warrior tier 그대로).
    expect(flat.caps).toEqual(p.caps);
    expect(p.groups.warrior.tier).toBe(4);
  });

  it("flattenGroupTiers — ensureGroup 미지정/none 은 새 그룹 안 만듦", () => {
    const p = parseProficiency({ groups: { warrior: { tier: 3 } } });
    expect(Object.keys(flattenGroupTiers(p).groups)).toEqual(["warrior"]);
    expect(flattenGroupTiers(p, "none").groups.none).toBeUndefined();
    expect(flattenGroupTiers(p).groups.warrior.tier).toBe(1);
  });

  it("spendProficiency — 전역 잔액 차감, cap/그룹 불변, 비파괴", () => {
    const p = parseProficiency({
      groups: { warrior: { points: 90, cultivations: 2 } },
    });
    const next = spendProficiency(p, 80);
    expect(next).not.toBeNull();
    expect(usablePoints(next!)).toBe(10); // 90 − 80
    // 그룹(수행 횟수 등)·caps 불변.
    expect(next!.groups.warrior).toEqual({
      cultivations: 2,
      tier: 1,
      cumLevel: 0,
    });
    expect(next!.caps).toEqual(p.caps);
    expect(usablePoints(p)).toBe(90); // 비파괴
  });

  it("spendProficiency — 전역 잔액 부족이면 null, amount<=0 이면 그대로", () => {
    const p = parseProficiency({ groups: { warrior: { points: 50 } } }); // 전역 50
    expect(spendProficiency(p, 80)).toBeNull(); // 부족
    expect(usablePoints(spendProficiency(p, 50)!)).toBe(0); // 딱 맞게 → 0
    expect(spendProficiency(p, 0)).toBe(p);
  });

  it("signatureLearnCost — 차수별 비용, 미지정 차수는 t1 폴백", () => {
    expect(signatureLearnCost(1)).toBe(V2_SIGNATURE_LEARN_COST[1]);
    expect(signatureLearnCost(2)).toBe(150);
    expect(signatureLearnCost(3)).toBe(250);
    expect(signatureLearnCost(4)).toBe(400);
    expect(signatureLearnCost(9)).toBe(V2_SIGNATURE_LEARN_COST[1]);
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

  it("addJobCumLevel/jobCumLevelOf — 직업별 숙련도(groups·floor 와 별개), 비파괴, none/0 무변경", () => {
    const p0 = emptyProficiency();
    expect(jobCumLevelOf(p0, "paladin")).toBe(0);
    const p1 = addJobCumLevel(p0, "paladin", 30);
    const p2 = addJobCumLevel(p1, "paladin", 5);
    expect(jobCumLevelOf(p2, "paladin")).toBe(35);
    expect(jobCumLevelOf(p2, "acolyte")).toBe(0);
    // 비파괴.
    expect(jobCumLevelOf(p1, "paladin")).toBe(30);
    // 직업별 숙련도는 groups(직군)·floor 입력에 영향 없음(이중계산 방지).
    expect(totalCumLevel(p2)).toBe(0);
    expect(p2.groups).toEqual({});
    // none/0 무변경.
    expect(addJobCumLevel(p2, "none", 5)).toBe(p2);
    expect(addJobCumLevel(p2, "paladin", 0)).toBe(p2);
    // parse 왕복 — jobCumLevel 보존(양수만).
    const round = parseProficiency({
      jobCumLevel: { paladin: 35, acolyte: 12, none: 9, bad: -3 },
    });
    expect(round.jobCumLevel).toEqual({ paladin: 35, acolyte: 12 });
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

describe("levelCapFor (코어루프 단일 레벨캡)", () => {
  it("flag off = 기존 차수 캡 (무변경)", () => {
    expect(levelCapFor(1, false)).toBe(50);
    expect(levelCapFor(2, false)).toBe(65);
    expect(levelCapFor(4, false)).toBe(100);
  });
  it("코어루프 on = 차수 무관 단일 100", () => {
    expect(levelCapFor(1, true)).toBe(100);
    expect(levelCapFor(2, true)).toBe(100);
    expect(levelCapFor(4, true)).toBe(100);
  });
});

describe("proficiencyPerKillAtDepth (승리당 숙달 — 깊이 밴드 비례)", () => {
  it("테마 2개당 +1, 신규 엔드 사냥터도 5에서 클램프", () => {
    // 테마당 6깊이 — 각 테마의 시작·끝 깊이에서 같은 값. 깊이당 값은 깊은 산 삭제로 불변(테마 인덱스 동일).
    expect(proficiencyPerKillAtDepth(1)).toBe(2); // 들판 1
    expect(proficiencyPerKillAtDepth(6)).toBe(2); // 들판 6
    expect(proficiencyPerKillAtDepth(12)).toBe(2); // 마른 협곡 6
    expect(proficiencyPerKillAtDepth(13)).toBe(3); // 얼음 호수 1
    expect(proficiencyPerKillAtDepth(24)).toBe(3); // 심층 동굴 6
    expect(proficiencyPerKillAtDepth(25)).toBe(4); // 잊힌 성소 1
    expect(proficiencyPerKillAtDepth(36)).toBe(4); // 리자드 늪지 6
    expect(proficiencyPerKillAtDepth(37)).toBe(5); // 짐승의 소굴 1
    expect(proficiencyPerKillAtDepth(48)).toBe(5); // 검은 왕도 6
    expect(proficiencyPerKillAtDepth(49)).toBe(5); // 붉은 벌판 1
    expect(proficiencyPerKillAtDepth(60)).toBe(5); // 백골 고원 6
  });

  it("프론티어 밖 방어 입력도 5 로 클램프", () => {
    expect(proficiencyPerKillAtDepth(120)).toBe(5);
  });

  it("비정상 입력 가드 — 0 이하·소수도 들판(2)으로 처리", () => {
    expect(proficiencyPerKillAtDepth(0)).toBe(2);
    expect(proficiencyPerKillAtDepth(1.9)).toBe(2);
  });
});

describe("addReincarnation (환생 횟수 카운터)", () => {
  it("빈 prof 는 0 에서 시작, 호출마다 +1", () => {
    const p0 = emptyProficiency();
    expect(p0.reincarnations).toBe(0);
    const p1 = addReincarnation(p0);
    const p2 = addReincarnation(p1);
    expect(p1.reincarnations).toBe(1);
    expect(p2.reincarnations).toBe(2);
    // 비파괴 — 입력은 불변.
    expect(p0.reincarnations).toBe(0);
  });

  it("필드 없는(undefined) prof 도 1 로 안전 증가", () => {
    const p = emptyProficiency();
    delete p.reincarnations;
    expect(addReincarnation(p).reincarnations).toBe(1);
  });

  it("parse 라운드트립 — reincarnations 보존(음수·비수치는 0)", () => {
    expect(parseProficiency({ reincarnations: 3 }).reincarnations).toBe(3);
    expect(parseProficiency({ reincarnations: -2 }).reincarnations).toBe(0);
    expect(parseProficiency({}).reincarnations).toBe(0);
  });

  it("flattenGroupTiers·setGrown·addCumLevel 은 reincarnations 를 보존", () => {
    const p = addReincarnation(addReincarnation(emptyProficiency()));
    expect(flattenGroupTiers(p, "warrior").reincarnations).toBe(2);
    expect(addCumLevel(p, "warrior", 5).reincarnations).toBe(2);
  });
});
