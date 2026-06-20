// 원소술사(elementalist) — 마법 4차 두 번째 갈래. 속성 마법(캐릭속성 분기 액티브) + 원소 통달
//   패시브(상성 양방향 강화). PR1: 데이터 구조 + 패시브 합산 검증(분기 적용은 combatShared 1-라인 +
//   골든 byte-identical 로 커버).
import { describe, it, expect } from "vitest";
import {
  V2_JOB_CATALOG,
  jobIdFromLegacy,
  TIER4_UNLOCK_CUMLEVEL,
} from "./v2JobCatalog";
import { skillsForJob } from "./v2SkillsByJob";
import { V2_SKILLS, aggregateEquippedPassives } from "./v2Skills";

describe("원소술사 직업", () => {
  it("카탈로그 — tier 4 마법, 마도사 계보(magus jobCumLevel TIER4) 해금, 브리지 왕복", () => {
    const job = V2_JOB_CATALOG.elementalist;
    expect(job.tier).toBe(4);
    expect(job.unlock.prereqs).toEqual({ magus: TIER4_UNLOCK_CUMLEVEL });
    expect(jobIdFromLegacy("mage", "elementalist")).toBe("elementalist");
  });

  it("킷 = 속성 마법(액티브) + 원소 통달(패시브)", () => {
    expect(skillsForJob("elementalist")).toEqual([
      "v2c_elementalist_magic",
      "v2c_elementalist_mastery",
    ]);
  });
});

describe("속성 마법(액티브) — 캐릭속성 분기", () => {
  const magic = V2_SKILLS.v2c_elementalist_magic;

  it("elementNamed(동적 로그) + 7속성 분기 정의 + 무속성 폴백", () => {
    expect(magic.elementNamed).toBe(true);
    expect(magic.effects.length).toBeGreaterThan(0); // 무속성 폴백
    const els = magic.elementEffects!;
    for (const el of [
      "fire",
      "water",
      "wind",
      "earth",
      "lightning",
      "starlight",
      "void",
    ] as const) {
      expect(els[el], `${el} 분기`).toBeDefined();
      expect(els[el]!.length).toBeGreaterThan(0);
    }
  });

  it("재사용 효과 — 물=보호막(딜 없음)·불=연소 DoT·번개=취약", () => {
    const els = magic.elementEffects!;
    // 물 = shield 만(공격 아님).
    expect(els.water!.some((e) => e.kind === "shield")).toBe(true);
    expect(els.water!.some((e) => e.kind === "damage")).toBe(false);
    // 불 = 데미지 + 연소(burn) DoT.
    expect(els.fire!.some((e) => e.kind === "damage")).toBe(true);
    expect(
      els.fire!.some((e) => e.kind === "dot" && e.tag === "burn"),
    ).toBe(true);
    // 번개 = 데미지 + 취약.
    expect(els.lightning!.some((e) => e.kind === "enemyVuln")).toBe(true);
    // 빛 = 데미지 + 실명(적 회피↓), 어둠 = 데미지 + 암흑(적 명중↓). (PR2)
    expect(els.starlight!.some((e) => e.kind === "enemyEvasionDown")).toBe(true);
    expect(els.void!.some((e) => e.kind === "enemyAccuracyDown")).toBe(true);
  });

  it("모든 분기 데미지는 마법(int) 스케일 — 마법사 직업", () => {
    const els = magic.elementEffects!;
    for (const arr of Object.values(els)) {
      for (const e of arr!) {
        if (e.kind === "damage") expect(e.scaling).toBe("magic");
      }
    }
  });
});

describe("원소 통달(패시브) — 상성 양방향 강화", () => {
  it("elementAdvPctBonus/elementDisPctBonus = 15", () => {
    const p = V2_SKILLS.v2c_elementalist_mastery.passive!;
    expect(p.elementAdvPctBonus).toBe(15);
    expect(p.elementDisPctBonus).toBe(15);
  });

  it("aggregateEquippedPassives 가 보너스를 합산한다", () => {
    const agg = aggregateEquippedPassives(["v2c_elementalist_mastery"]);
    expect(agg.elementAdvPctBonus).toBe(15);
    expect(agg.elementDisPctBonus).toBe(15);
    // 미장착 시 0.
    const none = aggregateEquippedPassives([]);
    expect(none.elementAdvPctBonus).toBe(0);
    expect(none.elementDisPctBonus).toBe(0);
  });
});
