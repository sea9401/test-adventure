// 고차(tier 3 — 하이브리드 성기사 포함) · 심화(tier 4) 직업 전용 테스트.
//   v2JobCatalog.test.ts 가 구조/해금/브리지를, v2SkillsByJob.test.ts 가 킷/패시브 구조를
//   이미 덮는다. 여기선 그 둘이 얕게만 보던 4축을 직업 단위로 깊게 검증한다:
//     1) 하이브리드(성기사) 해금 게이팅 — 부모 둘(기사·사제) 직업별 cumLevel AND.
//     2) 스펙 체인 — jobIdFromLegacy 왕복 + skillsForJob/elementalSkillsForClass 킷 + 킷 id 실재.
//     3) 하이브리드 derive — 물리(전사)·마법(사제 회복강화) 양쪽 정체성이 derive 에 흐른다.
//     4) tier-4 4직업 — 해금 구조 + "축당 1개 고유 % 패시브"(서로 안 겹침) + 킷 id 실재.
//     5) tier-4 패시브 derive — 고유 % 가 derivePlayerCombatV2Pure 의 그 레버에 실제로 적용.
//
//   🔑 derive 검증은 라이브 FromSaves 경로(derivePlayerCombatV2.ts §882~942)가 하는 것과
//      동일한 와이어링(aggregateEquippedPassives(kit) → Pure 입력 파라미터)을 미러해 합성 게이트
//      없이 실제 동작을 확인한다 — 패시브 맵의 단위 수치가 아니라 "전투 스탯이 움직이는가"를 본다.

import { describe, it, expect } from "vitest";
import {
  V2_JOB_CATALOG,
  TIER3_UNLOCK_CUMLEVEL,
  TIER4_UNLOCK_CUMLEVEL,
  LEGACY_CLASS_SPEC_BY_JOB,
  jobIdFromLegacy,
  isJobUnlocked,
} from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { elementalSkillsForClass, type V2Class } from "./classes";
import {
  V2_SKILLS,
  aggregateEquippedPassives,
  type V2SkillId,
} from "./v2Skills";
import { emptyProficiency, type V2ProficiencyState } from "./proficiency";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";

// 직군 cumLevel(groups) 로 구성한 숙련도 — tier-4 부모 직군 게이트용.
function profWithGroups(groupCumLevels: Record<string, number>): V2ProficiencyState {
  const prof = emptyProficiency();
  for (const [id, cumLevel] of Object.entries(groupCumLevels)) {
    prof.groups[id] = { points: 0, cultivations: 0, tier: 1, cumLevel };
  }
  return prof;
}
// 직업별 누적(jobCumLevel) 로 구성한 숙련도 — 하이브리드(기사·사제) per-job 게이트용.
function profWithJobs(jobLevels: Record<string, number>): V2ProficiencyState {
  return { ...emptyProficiency(), jobCumLevel: { ...jobLevels } };
}

// 라이브 FromSaves 가 하는 것과 동일하게 장착 킷의 패시브를 집계해 Pure 입력으로 변환.
//   (derivePlayerCombatV2.ts §891·934~941 의 매핑을 미러 — 합성 게이트 아님.)
function deriveWithEquippedKit(
  equipped: readonly V2SkillId[],
  extra: Parameters<typeof derivePlayerCombatV2Pure>[0] = { level: 50, v2Equipped: {} },
) {
  const agg = aggregateEquippedPassives(equipped);
  return derivePlayerCombatV2Pure({
    ...extra,
    statPct: agg.statPct,
    maxHpPct: agg.maxHpPct,
    maxMpPct: agg.maxMpPct,
    atkPerDexCoef: agg.atkPerDexCoef,
    passiveCritPct: agg.critPct,
    passiveCritDmgPct: agg.critDmgPct,
    passiveEvasionPct: agg.evasionPct,
    passiveLifestealPct: agg.lifestealPct,
    passiveCounterChancePct: agg.counterChancePct,
    passiveDefPct: agg.defPct,
    passiveAccuracyPct: agg.accuracyPct,
    passiveHealPowerPct: agg.healPowerPct,
    passiveDamageTakenReductionPct: agg.damageTakenReductionPct,
  });
}

const TIER4_JOB_IDS = ["veteran", "sensei", "sage", "chief", "phantom"] as const;
// 🔑 계보 게이팅: tier-4 child → 바로 아래 tier-3 부모 직업(원소술사는 별도 테스트라 제외).
const TIER4_LINEAGE: Record<string, string> = {
  veteran: "paladin",
  sensei: "brawler",
  sage: "magus",
  chief: "ranger",
  phantom: "shadow", // 도적 4차 두 번째 갈래 — 그림자 계보
};

describe("성기사(tier-3 하이브리드) 해금 게이팅", () => {
  const templar = V2_JOB_CATALOG.templar;

  it("부모 둘(기사·사제) 각각 cumLevel ≥ TIER3 을 요구한다 (직업별 누적, 직군 아님)", () => {
    // ⚠️ prereq 키는 직군(warrior/mage)이 아니라 특정 상위 직업(기사 paladin·사제 acolyte) —
    //    isJobUnlocked 가 키의 tier 로 분기(tier1=groups, 상위=jobCumLevel)하므로 게이트가 per-job.
    expect(templar.tier).toBe(3);
    expect(templar.unlock.prereqs).toEqual({
      paladin: TIER3_UNLOCK_CUMLEVEL,
      acolyte: TIER3_UNLOCK_CUMLEVEL,
    });
    // 둘 다 tier-3/2 상위 직업이라 jobCumLevel 분기를 타야 한다(직군 누적으론 못 연다).
    expect(V2_JOB_CATALOG.paladin.tier).toBeGreaterThan(1);
    expect(V2_JOB_CATALOG.acolyte.tier).toBeGreaterThan(1);
  });

  it("직군 누적(전사/마법)만으론 안 열린다 — 반드시 기사·사제를 거쳐야(회귀 가드)", () => {
    // 방패병/마법사로만 직군 250 채워도 잠김. per-job 게이트의 핵심.
    expect(isJobUnlocked(templar, profWithGroups({ warrior: 9999, mage: 9999 }))).toBe(
      false,
    );
  });

  it("한쪽 부모만 250 → 잠김 (AND — 한 부모 미달이면 실패)", () => {
    expect(isJobUnlocked(templar, profWithJobs({ paladin: TIER3_UNLOCK_CUMLEVEL }))).toBe(
      false,
    );
    expect(isJobUnlocked(templar, profWithJobs({ acolyte: TIER3_UNLOCK_CUMLEVEL }))).toBe(
      false,
    );
    // 한쪽이 임계 직전(249)이면 다른 쪽이 충족해도 잠김.
    expect(
      isJobUnlocked(
        templar,
        profWithJobs({ paladin: TIER3_UNLOCK_CUMLEVEL, acolyte: TIER3_UNLOCK_CUMLEVEL - 1 }),
      ),
    ).toBe(false);
  });

  it("두 부모 모두 250 도달 → 해금 (양쪽 충족 시에만 true)", () => {
    expect(
      isJobUnlocked(
        templar,
        profWithJobs({ paladin: TIER3_UNLOCK_CUMLEVEL, acolyte: TIER3_UNLOCK_CUMLEVEL }),
      ),
    ).toBe(true);
  });
});

describe("성기사 스펙 체인 — 브리지 왕복 + 킷 + 킷 id 실재", () => {
  it("jobIdFromLegacy 왕복 — 저장 class=전사(첫 prereq), spec=고유 id (마법 prereq 은 게이트일 뿐)", () => {
    // 하이브리드는 저장 class 가 첫 prereq(기사→전사)의 직군이고 spec 은 고유 id. 마법 쪽은
    //   해금 게이트지 저장 class 가 아니다. 브리지가 (class,spec) ↔ jobId 왕복되어야 한다.
    expect(LEGACY_CLASS_SPEC_BY_JOB.templar).toEqual({ class: "warrior", spec: "templar" });
    const { class: cls, spec } = LEGACY_CLASS_SPEC_BY_JOB.templar;
    expect(jobIdFromLegacy(cls, spec)).toBe("templar");
    // 첫 prereq(paladin)의 직군 = 저장 class(전사) — 일관성.
    const firstPrereq = Object.keys(V2_JOB_CATALOG.templar.unlock.prereqs)[0];
    expect(LEGACY_CLASS_SPEC_BY_JOB[firstPrereq].class).toBe(cls);
  });

  it("skillsForJob(templar) = 킷(액티브 1 + 패시브 1), 모든 id 가 V2_SKILLS 에 존재", () => {
    const kit = skillsForJob("templar");
    expect(kit).toEqual(["v2c_templar_smite", "v2c_templar_aegis"]);
    for (const id of kit) {
      expect(id in V2_SKILLS, `templar 킷 id ${id} 가 전투 카탈로그에 실재해야`).toBe(true);
    }
    // 액티브(심판의 빛) = 비패시브, 가호 = 패시브.
    expect(V2_SKILLS.v2c_templar_smite.category).not.toBe("passive");
    expect(V2_SKILLS.v2c_templar_aegis.category).toBe("passive");
  });

  it("elementalSkillsForClass 가 jobIdFromLegacy 로 해석해 동일 킷 반환 (차수-게이팅 회귀 없음)", () => {
    const { class: cls, spec } = LEGACY_CLASS_SPEC_BY_JOB.templar;
    // 3번째 인자(옛 차수)는 무시돼야 한다 — 1차로 줘도 풀 킷이 나와야(게이팅 회귀 가드).
    expect(elementalSkillsForClass(cls as V2Class, spec, 1)).toEqual([
      ...skillsForJob("templar"),
    ]);
    expect(elementalSkillsForClass(cls as V2Class, spec, 4)).toEqual([
      ...skillsForJob("templar"),
    ]);
  });

  it("성기사 킷은 하이브리드 정체성 — 물리 타격(전사) + 자힐(사제 라인) 결합", () => {
    // 심판의 빛 = 물리 damage + heal 혼합(전사 타격 + 사제 치유). 가호 = 방어%(탱) + 회복강화%(자힐 증폭).
    const smite = V2_SKILLS.v2c_templar_smite;
    expect(smite.effects.some((e) => e.kind === "damage")).toBe(true);
    const heal = smite.effects.find((e) => e.kind === "heal");
    expect(heal).toBeDefined();
    // 자힐 = 잃은 HP 의 10%(오너 하향, 옛 20%) · 마나 42. 의도값 잠금.
    expect(heal?.kind === "heal" ? heal.pctLostHp : undefined).toBe(10);
    expect(smite.mpCost).toBe(42);
    const aegis = V2_SKILLS.v2c_templar_aegis.passive!;
    expect((aegis.defPct ?? 0) > 0 && (aegis.healPowerPct ?? 0) > 0).toBe(true);
  });

  it("마검사 마검 합일 = 힘·지능 이중 공격축 12%/12%(오너 상향, 옛 8%)", () => {
    const unity = V2_SKILLS.v2c_spellblade_unity.passive!;
    expect(unity.statPct?.str).toBe(12);
    expect(unity.statPct?.int).toBe(12);
  });
});

describe("성기사 하이브리드 derive — 전사측·마법(회복)측 양쪽 발현", () => {
  // 라이브 와이어링(FromSaves)을 통해 가호 패시브를 derive 에 흘려, 하이브리드가 단일축이 아니라
  //   방어(탱)·회복강화(자힐) 양쪽으로 작동하는지 한 빌드에서 함께 확인.
  const KIT = skillsForJob("templar");
  // VIT 투자 빌드 — def 가 base 보너스(5)+floor 보다 충분히 커서 ×1.1 가 floor 후에도 실제로 증가
  //   (작은 base 에선 floor(6×1.1)=6 으로 묻힌다 — 패시브가 안 먹는 게 아니라 floor 절단). 성기사
  //   정체성(전사 활력)에 맞는 VIT 빌드라 자연스럽다.
  const TANK = { level: 50, v2Equipped: {}, allocatedStats: { vit: 300 } } as const;

  it("가호 장착 → 물리 방어력 ↑(전사측 탱)", () => {
    const plain = derivePlayerCombatV2Pure({ ...TANK }).player;
    const aegis = deriveWithEquippedKit(KIT, { ...TANK }).player;
    // defPct 10 → def 곱연산 ×1.1. (킷에 패시브가 가호 하나뿐이라 defPct=10 확정.)
    const defPct = V2_SKILLS.v2c_templar_aegis.passive!.defPct!;
    expect(aegis.def).toBe(Math.floor(plain.def * (1 + defPct / 100)));
    expect(aegis.def).toBeGreaterThan(plain.def);
  });

  it("가호 장착 → 회복량 배수 ↑(사제측 자힐 강화)", () => {
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const aegis = deriveWithEquippedKit(KIT).player;
    // healPowerPct 10 → healMult 곱연산 ×1.1. 같은 패시브가 방어와 회복 두 레버를 동시에 민다.
    const healPct = V2_SKILLS.v2c_templar_aegis.passive!.healPowerPct!;
    expect(aegis.healMult ?? 1).toBeCloseTo((plain.healMult ?? 1) * (1 + healPct / 100), 5);
    expect(aegis.healMult ?? 1).toBeGreaterThan(plain.healMult ?? 1);
  });

  it("성기사 내장 보너스(jobBonus)는 힘·활력·정신 3축 — 전사(str/vit)×사제(spi) 결합", () => {
    // 카탈로그 jobBonus 가 derive 에 흐르면 세 축 모두 파생 스탯에 반영(하드코딩 회피 — 카탈로그값 사용).
    const bonus = V2_JOB_CATALOG.templar.jobBonus;
    expect((bonus.str ?? 0) > 0 && (bonus.vit ?? 0) > 0 && (bonus.spi ?? 0) > 0).toBe(true);
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });
    const withBonus = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {}, jobBonus: bonus });
    expect(withBonus.totalStats.str).toBe(plain.totalStats.str + (bonus.str ?? 0));
    expect(withBonus.totalStats.vit).toBe(plain.totalStats.vit + (bonus.vit ?? 0));
    expect(withBonus.totalStats.spi).toBe(plain.totalStats.spi + (bonus.spi ?? 0));
    // str→atk, vit→maxHp 로 물리 정체성이, spi→healMult 로 지원 정체성이 함께 흐른다.
    expect(withBonus.player.atk).toBeGreaterThan(plain.player.atk);
    expect(withBonus.maxHp).toBeGreaterThan(plain.maxHp);
    expect(withBonus.player.healMult ?? 1).toBeGreaterThan(plain.player.healMult ?? 1);
  });
});

describe("심화(tier-4) 4직업 — 해금 구조 + 킷 id 실재", () => {
  it("네 직업 모두 tier 4 이고 계보(3차 부모) jobCumLevel ≥ TIER4 게이트", () => {
    for (const [jobId, parent] of Object.entries(TIER4_LINEAGE)) {
      const job = V2_JOB_CATALOG[jobId];
      expect(job.tier).toBe(4);
      // 부모는 tier-3 직업 키 → jobCumLevel 게이트(직군 누적 아님).
      expect(job.unlock.prereqs).toEqual({ [parent]: TIER4_UNLOCK_CUMLEVEL });
      expect(V2_JOB_CATALOG[parent].tier).toBe(3);
      // 부모 직업 jobCumLevel TIER4 전엔 잠김, 도달 시 해금. 고차보다 더 깊다.
      expect(isJobUnlocked(job, profWithJobs({ [parent]: TIER4_UNLOCK_CUMLEVEL - 1 }))).toBe(
        false,
      );
      expect(isJobUnlocked(job, profWithJobs({ [parent]: TIER4_UNLOCK_CUMLEVEL }))).toBe(
        true,
      );
      // 부모가 3차 해금선(TIER3)만 넘겼어도 심화(TIER4)는 아직 잠김.
      expect(isJobUnlocked(job, profWithJobs({ [parent]: TIER3_UNLOCK_CUMLEVEL }))).toBe(
        false,
      );
    }
    expect(TIER3_UNLOCK_CUMLEVEL).toBeLessThan(TIER4_UNLOCK_CUMLEVEL);
  });

  it("각 직업 킷 = 액티브 1 + 패시브 1, 모든 id 가 V2_SKILLS 에 실재", () => {
    for (const jobId of TIER4_JOB_IDS) {
      const kit = skillsForJob(jobId);
      expect(kit.length, jobId).toBe(2);
      for (const id of kit) {
        expect(id in V2_SKILLS, `${jobId} 킷 id ${id} 가 전투 카탈로그에 실재해야`).toBe(true);
      }
      const [active, passive] = kit;
      // 권룡(sensei)도 무인 재설계(2026-06-22)로 액티브(권룡파)를 가짐 — 모든 tier-4 = 액티브 1 + 패시브 1.
      expect(V2_SKILLS[active].category, active).toBe("attack");
      expect(V2_SKILLS[passive].category, passive).toBe("passive");
    }
  });

  it('jobIdFromLegacy 왕복 — 각 심화 직업이 (class,spec) ↔ jobId 로 정확히 환원', () => {
    for (const jobId of TIER4_JOB_IDS) {
      const { class: cls, spec } = LEGACY_CLASS_SPEC_BY_JOB[jobId];
      expect(jobIdFromLegacy(cls, spec), jobId).toBe(jobId);
      // elementalSkillsForClass 도 같은 킷(차수 무관).
      expect(elementalSkillsForClass(cls as V2Class, spec, 1), jobId).toEqual([
        ...skillsForJob(jobId),
      ]);
    }
  });

  it('"축당 1개 고유 % 패시브" — tier-4 패시브 5종이 서로 다른 효과 축 (겹치는 쌍 없음)', () => {
    // 각 패시브가 건드리는 효과 축을 직렬화 → 전부 유일해야(설계: 축당 1개 고유 % 패시브).
    //   스탯% 든 비스탯 효과(치명/치명피해/회피/최대HP)든 같은 키로 정규화.
    const passiveOf = (jobId: string) => {
      const [, passiveId] = skillsForJob(jobId);
      return V2_SKILLS[passiveId].passive!;
    };
    const axisKey = (jobId: string): string => {
      const p = passiveOf(jobId);
      const keys: string[] = [];
      for (const k of Object.keys(p.statPct ?? {})) keys.push(`statPct.${k}`);
      if (p.maxHpPct) keys.push("maxHpPct");
      if (p.maxMpPct) keys.push("maxMpPct");
      if (p.critPct) keys.push("critPct");
      if (p.critDmgPct) keys.push("critDmgPct");
      if (p.evasionPct) keys.push("evasionPct");
      if (p.lifestealPct) keys.push("lifestealPct");
      if (p.defPct) keys.push("defPct");
      if (p.accuracyPct) keys.push("accuracyPct");
      if (p.healPowerPct) keys.push("healPowerPct");
      if (p.atkPerDexCoef) keys.push("atkPerDexCoef");
      return keys.sort().join(",");
    };
    const axes = TIER4_JOB_IDS.map(axisKey);
    // 빈 축(효과 없는 패시브)이 없어야 하고, 축 전부 유일.
    for (const [i, key] of axes.entries()) {
      expect(key, `${TIER4_JOB_IDS[i]} 패시브에 효과 축이 있어야`).not.toBe("");
    }
    expect(new Set(axes).size, "tier-4 패시브는 서로 다른 축(고유)").toBe(
      TIER4_JOB_IDS.length,
    );
  });
});

describe("심화(tier-4) 패시브 derive — 고유 % 가 실제 전투 레버에 적용", () => {
  // 직업 하나씩 골라 그 고유 패시브 효과가 derivePlayerCombatV2Pure 의 주장하는 레버를 실제로
  //   움직이는지 확인(패시브 맵 수치 ≠ 적용 여부 — 와이어링까지 검증).

  it("정예 기사(veteran) 필살 → 치명타 피해 배수 ↑ (critDmgPct → critMult)", () => {
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const vet = deriveWithEquippedKit(skillsForJob("veteran")).player;
    // critDmgPct → critMult 점감 곡선에 가산(wired). flat 아님(곡선이라 점감) — 정확값은 derive 전용 테스트.
    expect(V2_SKILLS.v2c_veteran_lethal.passive!.critDmgPct!).toBeGreaterThan(0);
    expect(vet.critMult ?? 0).toBeGreaterThan(plain.critMult ?? 0);
  });

  it("투승(battlemonk) 철신 → 최대 HP ↑ (maxHpPct → maxHp)", () => {
    // 무인 재설계(2026-06-22): 철신(최대HP%)이 권룡→투승으로 이전.
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} });
    const bm = deriveWithEquippedKit(skillsForJob("battlemonk"));
    const maxHpPct = V2_SKILLS.v2c_battlemonk_ironbody.passive!.maxHpPct!;
    expect(bm.maxHp).toBe(Math.floor(plain.maxHp * (1 + maxHpPct / 100)));
    expect(bm.maxHp).toBeGreaterThan(plain.maxHp);
  });

  it("투승(battlemonk) 반격 → passiveCounterChancePct 30 (장착→aggregate→derive 풀체인)", () => {
    // 무인 재설계(2026-06-22): 반격(카운터)이 권룡→투승으로 이전. 풀 체인 end-to-end.
    const bm = deriveWithEquippedKit(skillsForJob("battlemonk")).player;
    expect(bm.passiveCounterChancePct).toBe(
      V2_SKILLS.v2c_battlemonk_counter.passive!.counterChancePct,
    );
    expect(bm.passiveCounterChancePct).toBe(30);
    // 미장착 = undefined(byte-identical 보장).
    expect(
      derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player.passiveCounterChancePct,
    ).toBeUndefined();
  });

  it("대마법사(sage) 간파 → 치명타 확률 ↑ (critPct → critChancePct)", () => {
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const sg = deriveWithEquippedKit(skillsForJob("sage")).player;
    const critPct = V2_SKILLS.v2c_sage_insight.passive!.critPct!;
    expect((sg.critChancePct ?? 0) - (plain.critChancePct ?? 0)).toBeCloseTo(critPct, 5);
  });

  it("신궁(chief) 매의 눈 → 명중레이팅 ↑ (accuracyPct → accRating)", () => {
    const plain = derivePlayerCombatV2Pure({ level: 50, v2Equipped: {} }).player;
    const ch = deriveWithEquippedKit(skillsForJob("chief")).player;
    const accPct = V2_SKILLS.v2c_chief_afterimage.passive!.accuracyPct!;
    // accRating 은 캡 없는 raw(passiveAccuracyPct 선형 가산) — 회피 대결형 Slice 2 의 전투 명중 레버.
    expect((ch.accRating ?? 0) - (plain.accRating ?? 0)).toBeCloseTo(accPct, 5);
  });
});
