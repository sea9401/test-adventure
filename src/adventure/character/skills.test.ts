import { describe, it, expect } from "vitest";
import {
  skillLayout,
  deriveSkills,
  deriveFeats,
  effectiveSkillNames,
  effectiveFeatNames,
  FEAT_NAMES,
  SKILL_NAMES,
} from "./skills";
import type { StatKey } from "@/adventure/data/stats";

const ZERO: Record<StatKey, number> = {
  str: 0,
  dex: 0,
  vit: 0,
  spd: 0,
  luk: 0,
  int: 0,
};

describe("skillLayout — 슬롯 해금", () => {
  it("기본: 일반 3칸, 특기 슬롯 0", () => {
    expect(skillLayout({ level: 1, hasFlag: () => false })).toEqual({
      normalSlots: 3,
      featSlots: 0,
    });
  });

  it("Lv40 도달 → 특기 슬롯 1", () => {
    expect(
      skillLayout({ level: 40, hasFlag: () => false }).featSlots,
    ).toBe(1);
  });

  it("운봉의 거인 처치 → 레벨 무관 특기 슬롯 1", () => {
    expect(
      skillLayout({
        level: 5,
        hasFlag: (id) => id === "peak_giant_defeated",
      }).featSlots,
    ).toBe(1);
  });

  it("두 번째 특기 슬롯은 Lv90 + endgame_apex_defeated (첫 슬롯 해금 후)", () => {
    // Lv90 인데 첫 슬롯 미해금 (peak_giant 도 없고 Lv40 미만의 의미는 없지만 패턴 검증)
    // 실제론 Lv90 ≥ Lv40 이라 첫 슬롯 자동 해금 → endgame_apex 만 추가로 필요.
    expect(
      skillLayout({ level: 90, hasFlag: () => false }).featSlots,
    ).toBe(1);
    expect(
      skillLayout({
        level: 90,
        hasFlag: (id) => id === "endgame_apex_defeated",
      }).featSlots,
    ).toBe(2);
    // Lv89 면 둘째 슬롯 미해금
    expect(
      skillLayout({
        level: 89,
        hasFlag: (id) => id === "endgame_apex_defeated",
      }).featSlots,
    ).toBe(1);
  });

  it("5번째 일반 슬롯은 Lv65 AND 화산의 심장 처치 둘 다", () => {
    expect(skillLayout({ level: 65, hasFlag: () => false }).normalSlots).toBe(3);
    expect(
      skillLayout({
        level: 50,
        hasFlag: (id) => id === "volcano_heart_defeated",
      }).normalSlots,
    ).toBe(3);
    expect(
      skillLayout({
        level: 65,
        hasFlag: (id) => id === "volcano_heart_defeated",
      }).normalSlots,
    ).toBe(4);
  });

  it("6번째 일반 슬롯은 5번째 해금 + Lv90 AND endgame_apex_defeated", () => {
    // Lv90 + endgame_apex 만 있고 화산 심장 없으면 5번째 안 열려 6번째도 안 열림
    expect(
      skillLayout({
        level: 90,
        hasFlag: (id) => id === "endgame_apex_defeated",
      }).normalSlots,
    ).toBe(3);
    // 5번째까지만 열림
    expect(
      skillLayout({
        level: 90,
        hasFlag: (id) => id === "volcano_heart_defeated",
      }).normalSlots,
    ).toBe(4);
    // Lv89 면 6번째 안 열림 (5번째만 4)
    expect(
      skillLayout({
        level: 89,
        hasFlag: (id) =>
          id === "volcano_heart_defeated" || id === "endgame_apex_defeated",
      }).normalSlots,
    ).toBe(4);
    // 모두 충족 → 6번째 열림
    expect(
      skillLayout({
        level: 90,
        hasFlag: (id) =>
          id === "volcano_heart_defeated" || id === "endgame_apex_defeated",
      }).normalSlots,
    ).toBe(5);
  });
});

describe("deriveSkills — 4티어는 스탯 50 도달 시", () => {
  it("STR 49 면 출혈 미보유, 50 이면 보유", () => {
    expect(deriveSkills({ ...ZERO, str: 49 }).map((s) => s.name)).not.toContain(
      SKILL_NAMES.BLOODLET,
    );
    expect(deriveSkills({ ...ZERO, str: 50 }).map((s) => s.name)).toContain(
      SKILL_NAMES.BLOODLET,
    );
  });

  it("스탯 50 이면 1~4티어 전부 보유 (해당 스탯)", () => {
    const names = deriveSkills({ ...ZERO, dex: 50 }).map((s) => s.name);
    expect(names).toEqual(
      expect.arrayContaining([
        SKILL_NAMES.EVADE,
        SKILL_NAMES.COUNTER,
        SKILL_NAMES.PRECISION,
        SKILL_NAMES.SHADOW_CLONE,
      ]),
    );
  });

  it("STR 64 면 막다른 격노 미보유, 65 이면 보유 (5티어 활성 임계)", () => {
    expect(deriveSkills({ ...ZERO, str: 64 }).map((s) => s.name)).not.toContain(
      SKILL_NAMES.RAMPAGE,
    );
    expect(deriveSkills({ ...ZERO, str: 65 }).map((s) => s.name)).toContain(
      SKILL_NAMES.RAMPAGE,
    );
  });

  it("스탯 65 면 1~5티어 전부 보유", () => {
    expect(deriveSkills({ ...ZERO, dex: 65 }).map((s) => s.name)).toEqual(
      expect.arrayContaining([
        SKILL_NAMES.EVADE,
        SKILL_NAMES.COUNTER,
        SKILL_NAMES.PRECISION,
        SKILL_NAMES.SHADOW_CLONE,
        SKILL_NAMES.ANALYSIS,
      ]),
    );
    expect(deriveSkills({ ...ZERO, vit: 65 }).map((s) => s.name)).toContain(
      SKILL_NAMES.BRAMBLE,
    );
    expect(deriveSkills({ ...ZERO, spd: 65 }).map((s) => s.name)).toContain(
      SKILL_NAMES.GALE_CHAIN,
    );
    expect(deriveSkills({ ...ZERO, luk: 65 }).map((s) => s.name)).toContain(
      SKILL_NAMES.LUCKY_STAR,
    );
  });

  it("STR 84 면 충돌파 미보유, 85 이면 보유 (6티어 활성 임계)", () => {
    expect(deriveSkills({ ...ZERO, str: 84 }).map((s) => s.name)).not.toContain(
      SKILL_NAMES.IMPACT_WAVE,
    );
    expect(deriveSkills({ ...ZERO, str: 85 }).map((s) => s.name)).toContain(
      SKILL_NAMES.IMPACT_WAVE,
    );
  });

  it("스탯 85 면 1~6티어 전부 보유 (각 스탯별 6개)", () => {
    expect(deriveSkills({ ...ZERO, dex: 85 }).map((s) => s.name)).toEqual(
      expect.arrayContaining([
        SKILL_NAMES.EVADE,
        SKILL_NAMES.COUNTER,
        SKILL_NAMES.PRECISION,
        SKILL_NAMES.SHADOW_CLONE,
        SKILL_NAMES.ANALYSIS,
        SKILL_NAMES.SHADOW_LEGION,
      ]),
    );
    expect(deriveSkills({ ...ZERO, vit: 85 }).map((s) => s.name)).toContain(
      SKILL_NAMES.BLOODFEAST_ARMOR,
    );
    expect(deriveSkills({ ...ZERO, spd: 85 }).map((s) => s.name)).toContain(
      SKILL_NAMES.ETERNAL_GALE,
    );
    expect(deriveSkills({ ...ZERO, luk: 85 }).map((s) => s.name)).toContain(
      SKILL_NAMES.UNIVERSAL_LUCK,
    );
  });
});

describe("deriveFeats — 두 요구 스탯 25 이상", () => {
  it("한쪽이 24면 미보유, 둘 다 25면 보유", () => {
    expect(
      deriveFeats({ ...ZERO, dex: 25, luk: 24 }).map((f) => f.name),
    ).not.toContain(FEAT_NAMES.LIFESTEAL);
    expect(
      deriveFeats({ ...ZERO, dex: 25, luk: 25 }).map((f) => f.name),
    ).toContain(FEAT_NAMES.LIFESTEAL);
  });

  it("스탯쌍별로 알맞은 특기만 보유 (10종 1:1)", () => {
    expect(deriveFeats({ ...ZERO, str: 25, vit: 25 }).map((f) => f.name)).toEqual(
      [FEAT_NAMES.BERSERKER],
    );
    expect(deriveFeats({ ...ZERO, str: 25, dex: 25 }).map((f) => f.name)).toEqual(
      [FEAT_NAMES.ASSASSINATE],
    );
    expect(deriveFeats({ ...ZERO, vit: 25, spd: 25 }).map((f) => f.name)).toEqual(
      [FEAT_NAMES.THORN_ARMOR],
    );
    // 세 스탯 25 → 가능한 모든 쌍의 특기 보유.
    expect(
      deriveFeats({ ...ZERO, dex: 25, spd: 25, luk: 25 })
        .map((f) => f.name)
        .sort(),
    ).toEqual(
      [FEAT_NAMES.LIFESTEAL, FEAT_NAMES.BALANCE, FEAT_NAMES.SKIRMISH].sort(),
    );
  });
});

describe("effectiveSkillNames / effectiveFeatNames — 슬롯 한도", () => {
  const skills = [
    { name: "A" },
    { name: "B" },
    { name: "C" },
    { name: "D" },
    { name: "E" },
  ];

  it("자동 채움은 slots 개까지", () => {
    expect(effectiveSkillNames(skills, undefined, 3)).toEqual(["A", "B", "C"]);
    expect(effectiveSkillNames(skills, undefined, 4)).toEqual([
      "A",
      "B",
      "C",
      "D",
    ]);
  });

  it("명시 선택도 slots 로 잘림 + 미보유 필터", () => {
    expect(effectiveSkillNames(skills, ["E", "D", "C", "B", "A"], 4)).toEqual([
      "E",
      "D",
      "C",
      "B",
    ]);
    expect(effectiveSkillNames(skills, ["없음", "A"], 3)).toEqual(["A"]);
  });

  it("특기 슬롯이 0 이면 빈 배열", () => {
    const feats = [{ name: FEAT_NAMES.LIFESTEAL }];
    expect(effectiveFeatNames(feats, [FEAT_NAMES.LIFESTEAL], 0)).toEqual([]);
  });

  it("슬롯 1 + 보유 특기 → 1개 반환", () => {
    const feats = [{ name: FEAT_NAMES.LIFESTEAL }];
    expect(effectiveFeatNames(feats, [FEAT_NAMES.LIFESTEAL], 1)).toEqual([
      FEAT_NAMES.LIFESTEAL,
    ]);
  });

  it("슬롯 2 + 두 특기 → 둘 다 반환", () => {
    const feats = [
      { name: FEAT_NAMES.LIFESTEAL },
      { name: FEAT_NAMES.BERSERKER },
    ];
    expect(
      effectiveFeatNames(feats, [FEAT_NAMES.LIFESTEAL, FEAT_NAMES.BERSERKER], 2),
    ).toEqual([FEAT_NAMES.LIFESTEAL, FEAT_NAMES.BERSERKER]);
  });

  it("미보유 / null 슬롯은 그 자리 그대로 null — 슬롯 인덱스 보존", () => {
    const feats = [{ name: FEAT_NAMES.LIFESTEAL }];
    expect(
      effectiveFeatNames(feats, [null, FEAT_NAMES.LIFESTEAL, "없는특기"], 3),
    ).toEqual([null, FEAT_NAMES.LIFESTEAL, null]);
  });

  it("슬롯 1 에만 장착 — 슬롯 0 은 null 로 유지 (위치 보존)", () => {
    // 압축하면 UI 가 슬롯 0 에 그려버리는 버그가 생긴다.
    const feats = [{ name: FEAT_NAMES.LIFESTEAL }];
    expect(
      effectiveFeatNames(feats, [null, FEAT_NAMES.LIFESTEAL], 2),
    ).toEqual([null, FEAT_NAMES.LIFESTEAL]);
  });

  it("같은 특기가 두 슬롯에 있으면 첫 슬롯만 적용, 뒤 슬롯은 null", () => {
    const feats = [{ name: FEAT_NAMES.LIFESTEAL }];
    expect(
      effectiveFeatNames(feats, [FEAT_NAMES.LIFESTEAL, FEAT_NAMES.LIFESTEAL], 2),
    ).toEqual([FEAT_NAMES.LIFESTEAL, null]);
  });
});
