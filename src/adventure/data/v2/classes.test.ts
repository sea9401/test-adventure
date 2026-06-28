import { describe, it, expect } from "vitest";
import {
  V2_CLASSES,
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  V2_TIER_STAT_BONUS_PCT,
  parseV2Class,
  tier1ClassOf,
  nextAdvanceTier,
  tierCodexMin,
  elementalSkillsForClass,
} from "./classes";

// P4 — 주요 4직군 + 생존자 보조 루트. 차수는 class id 에서 분리(proficiency.tier).
const EXPECTED_ANCHOR = {
  warrior: "str",
  martial: "vit",
  mage: "int",
  rogue: "dex",
  survivor: "vit",
} as const;

describe("v2 직업", () => {
  it("none + 직군 5개 = 6개, 선택가능은 5직군", () => {
    expect(V2_CLASSES).toHaveLength(6);
    expect(V2_SELECTABLE_CLASSES).toHaveLength(5);
    expect(V2_SELECTABLE_CLASSES).not.toContain("none");
    expect([...V2_SELECTABLE_CLASSES].sort()).toEqual(
      ["martial", "mage", "rogue", "survivor", "warrior"].sort(),
    );
  });

  it("각 직군의 앵커 스탯이 설계 매핑과 일치", () => {
    for (const [cls, anchor] of Object.entries(EXPECTED_ANCHOR)) {
      expect(
        V2_CLASS_DEFS[cls as keyof typeof EXPECTED_ANCHOR].anchorStat,
      ).toBe(anchor);
    }
  });

  it("none 은 무직, 선택 직군은 표기명/설명 보유", () => {
    expect(V2_CLASS_DEFS.none.name).toBe("무직");
    for (const c of V2_SELECTABLE_CLASSES) {
      expect(V2_CLASS_DEFS[c].name, `${c} name`).toBeTruthy();
      expect(V2_CLASS_DEFS[c].description, `${c} desc`).toBeTruthy();
    }
  });

  it("차수별 앵커 보정 % — 1차 10 → 4차 35 (단조 증가)", () => {
    expect(V2_TIER_STAT_BONUS_PCT[1]).toBe(10);
    expect(V2_TIER_STAT_BONUS_PCT[2]).toBeGreaterThan(V2_TIER_STAT_BONUS_PCT[1]);
    expect(V2_TIER_STAT_BONUS_PCT[3]).toBeGreaterThan(V2_TIER_STAT_BONUS_PCT[2]);
    expect(V2_TIER_STAT_BONUS_PCT[4]).toBeGreaterThan(V2_TIER_STAT_BONUS_PCT[3]);
  });

  it("nextAdvanceTier — 1→2→3→4, 정점이면 null", () => {
    expect(nextAdvanceTier(1)).toBe(2);
    expect(nextAdvanceTier(2)).toBe(3);
    expect(nextAdvanceTier(3)).toBe(4);
    expect(nextAdvanceTier(4)).toBeNull();
  });

  it("tierCodexMin — 3차=3·4차=5, 1·2차는 없음", () => {
    expect(tierCodexMin(1)).toBeUndefined();
    expect(tierCodexMin(2)).toBeUndefined();
    expect(tierCodexMin(3)).toBe(3);
    expect(tierCodexMin(4)).toBe(5);
  });

  it("tier1ClassOf — 선택 직군에선 자기 자신(=그룹키), none 은 none", () => {
    for (const c of V2_SELECTABLE_CLASSES) expect(tier1ClassOf(c)).toBe(c);
    expect(tier1ClassOf("none")).toBe("none");
  });
});

describe("parseV2Class — 현재 직군/none 만 인식(옛 24-class 리매핑 폐지)", () => {
  it("새 직군 + none 은 그대로 통과", () => {
    for (const c of V2_CLASSES) expect(parseV2Class(c)).toBe(c);
  });

  it("옛 24-class id 등 알 수 없는 값 → none (DB 초기화로 리매핑 폐지)", () => {
    for (const old of ["swordsman", "archer", "priest", "ninja", "nonsense"]) {
      expect(parseV2Class(old)).toBe("none");
    }
    expect(parseV2Class(undefined)).toBe("none");
    expect(parseV2Class(123)).toBe("none");
  });
});

describe("elementalSkillsForClass", () => {
  it("none = 모험가 킷 2종, 선택 직군은 공용 스킬 풀 보유(전문화 미선택)", () => {
    expect(elementalSkillsForClass("none")).toEqual([
      "v2c_none_toughness",
      "v2c_none_diligence",
    ]);
    for (const c of V2_SELECTABLE_CLASSES) {
      expect(elementalSkillsForClass(c).length, `${c} 공용 풀`).toBeGreaterThan(
        0,
      );
    }
  });
});
