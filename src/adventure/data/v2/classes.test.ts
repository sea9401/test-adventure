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

// P4 — 4직군(전사/무도가/마법사/도적). 차수는 class id 에서 분리(proficiency.tier).
const EXPECTED_ANCHOR = {
  warrior: "str",
  martial: "vit",
  mage: "int",
  rogue: "dex",
} as const;

describe("v2 직업 (P4 4직군 압축)", () => {
  it("none + 4직군 = 5개, 선택가능은 4직군", () => {
    expect(V2_CLASSES).toHaveLength(5);
    expect(V2_SELECTABLE_CLASSES).toHaveLength(4);
    expect(V2_SELECTABLE_CLASSES).not.toContain("none");
    expect([...V2_SELECTABLE_CLASSES].sort()).toEqual(
      ["martial", "mage", "rogue", "warrior"].sort(),
    );
  });

  it("각 직군의 앵커 스탯이 설계 매핑과 일치", () => {
    for (const [cls, anchor] of Object.entries(EXPECTED_ANCHOR)) {
      expect(
        V2_CLASS_DEFS[cls as keyof typeof EXPECTED_ANCHOR].anchorStat,
      ).toBe(anchor);
    }
  });

  it("none 은 무직, 4직군은 표기명/설명 보유", () => {
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

  it("tier1ClassOf — 4직군에선 자기 자신(=그룹키), none 은 none", () => {
    for (const c of V2_SELECTABLE_CLASSES) expect(tier1ClassOf(c)).toBe(c);
    expect(tier1ClassOf("none")).toBe("none");
  });
});

describe("parseV2Class — 6→4 마이그", () => {
  it("새 4직군 + none 은 그대로 통과", () => {
    for (const c of V2_CLASSES) expect(parseV2Class(c)).toBe(c);
  });

  it("구 검술 계열 → 전사", () => {
    for (const old of ["swordsman", "swordmaster", "swordking", "swordgod"]) {
      expect(parseV2Class(old)).toBe("warrior");
    }
  });

  it("구 체술 계열 → 무도가", () => {
    for (const old of ["grandmaster", "fistemperor", "warlord"]) {
      expect(parseV2Class(old)).toBe("martial");
    }
    expect(parseV2Class("martial")).toBe("martial"); // 동일 문자열
  });

  it("구 마술 + 신술 → 마법사", () => {
    for (const old of [
      "archmage",
      "sage",
      "magus",
      "priest",
      "bishop",
      "archbishop",
      "pope",
    ]) {
      expect(parseV2Class(old)).toBe("mage");
    }
    expect(parseV2Class("mage")).toBe("mage");
  });

  it("구 궁술 + 인술 → 도적", () => {
    for (const old of [
      "archer",
      "sharpshooter",
      "bowking",
      "bowgod",
      "ninja",
      "nightblade",
      "shadowlord",
      "voidwalker",
    ]) {
      expect(parseV2Class(old)).toBe("rogue");
    }
  });

  it("미지의 값 → none", () => {
    expect(parseV2Class("nonsense")).toBe("none");
    expect(parseV2Class(undefined)).toBe("none");
    expect(parseV2Class(123)).toBe("none");
  });
});

describe("elementalSkillsForClass", () => {
  it("none = 모험가 킷 2종, 4직군은 공용 스킬 풀 보유(전문화 미선택)", () => {
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
