import { describe, it, expect } from "vitest";
import {
  V2_CLASSES,
  V2_CLASS_DEFS,
  V2_SELECTABLE_CLASSES,
  parseV2Class,
  tier1ClassOf,
  tier2ClassOf,
} from "./classes";
import { V2_SKILLS } from "./v2Skills";
import { V2_STAT_KEYS } from "./v2StatKeys";

// 6 직업군 ↔ 6 1차 스탯 1:1 (검=str/궁=dex/체=vit/마=int/신=spi/인=luk).
const EXPECTED_ANCHOR = {
  swordsman: "str",
  archer: "dex",
  martial: "vit",
  mage: "int",
  priest: "spi",
  ninja: "luk",
} as const;

describe("v2 직업 (PR-6 확장)", () => {
  it("none + 6 1차 + 6 2차 = 13개, 선택가능(respec)은 1차 6개", () => {
    expect(V2_CLASSES).toHaveLength(13);
    expect(V2_SELECTABLE_CLASSES).toHaveLength(6);
    expect(V2_SELECTABLE_CLASSES).not.toContain("none");
    // 선택가능은 전부 1차.
    for (const c of V2_SELECTABLE_CLASSES) {
      expect(V2_CLASS_DEFS[c].tier).toBe(1);
    }
  });

  it("6 직업이 6 1차 스탯을 앵커로 1:1 커버", () => {
    const anchors = V2_SELECTABLE_CLASSES.map(
      (c) => V2_CLASS_DEFS[c].anchorStat,
    );
    expect(new Set(anchors).size).toBe(6);
    expect(anchors.slice().sort()).toEqual([...V2_STAT_KEYS].sort());
  });

  it("각 직업의 앵커 스탯이 설계 매핑과 일치", () => {
    for (const [cls, anchor] of Object.entries(EXPECTED_ANCHOR)) {
      expect(V2_CLASS_DEFS[cls as keyof typeof EXPECTED_ANCHOR].anchorStat).toBe(
        anchor,
      );
    }
  });

  it("선택가능 직업은 statBonusPct>0 + 전용 스킬 보유", () => {
    for (const c of V2_SELECTABLE_CLASSES) {
      const def = V2_CLASS_DEFS[c];
      expect(def.statBonusPct, `${c} bonus`).toBeGreaterThan(0);
      expect(def.signatureSkill, `${c} signature`).toBeTruthy();
    }
  });

  it("전용 스킬은 카탈로그에 존재 + 그 직업으로 requireClass 게이트", () => {
    for (const c of V2_SELECTABLE_CLASSES) {
      const sig = V2_CLASS_DEFS[c].signatureSkill!;
      const skill = V2_SKILLS[sig];
      expect(skill, `${sig} 가 카탈로그에 없음`).toBeDefined();
      expect(
        skill.learn?.requireClass,
        `${sig} 가 ${c} 전용이 아님`,
      ).toBe(c);
    }
  });

  it("none 은 무보정(statBonusPct 0)", () => {
    expect(V2_CLASS_DEFS.none.statBonusPct).toBe(0);
  });

  it("parseV2Class — 유효값 통과, 그 외 none", () => {
    for (const c of V2_CLASSES) expect(parseV2Class(c)).toBe(c);
    expect(parseV2Class("nonsense")).toBe("none");
    expect(parseV2Class(undefined)).toBe("none");
    expect(parseV2Class("dark")).toBe("none");
  });
});

describe("v2 2차 전직 (PR-7)", () => {
  const TIER2 = [
    "swordmaster",
    "sharpshooter",
    "grandmaster",
    "archmage",
    "bishop",
    "nightblade",
  ] as const;

  it("6 1차 각각 정확히 1개의 2차로 전직 (1:1)", () => {
    for (const c of V2_SELECTABLE_CLASSES) {
      const t2 = tier2ClassOf(c);
      expect(t2, `${c} 2차 없음`).toBeTruthy();
      expect(V2_CLASS_DEFS[t2!].tier).toBe(2);
      // 같은 직업군 + 앵커 동일.
      expect(V2_CLASS_DEFS[t2!].group).toBe(V2_CLASS_DEFS[c].group);
      expect(V2_CLASS_DEFS[t2!].anchorStat).toBe(V2_CLASS_DEFS[c].anchorStat);
      // 2차 보정 > 1차 보정.
      expect(V2_CLASS_DEFS[t2!].statBonusPct).toBeGreaterThan(
        V2_CLASS_DEFS[c].statBonusPct,
      );
    }
  });

  it("2차는 advanceFrom/advanceLevel + 전용 스킬(requireClass 그 2차)", () => {
    for (const t2 of TIER2) {
      const def = V2_CLASS_DEFS[t2];
      expect(def.tier).toBe(2);
      expect(def.advanceFrom, `${t2} advanceFrom`).toBeTruthy();
      expect(tier2ClassOf(def.advanceFrom!)).toBe(t2); // 역참조 일관
      expect(def.advanceLevel, `${t2} advanceLevel`).toBeGreaterThan(0);
      const sig = def.signatureSkill!;
      expect(V2_SKILLS[sig], `${sig} 없음`).toBeDefined();
      expect(V2_SKILLS[sig].learn?.requireClass).toBe(t2);
    }
  });

  it("tier1ClassOf — 1차는 자신, 2차는 선행 1차, none 은 none", () => {
    expect(tier1ClassOf("swordsman")).toBe("swordsman");
    expect(tier1ClassOf("swordmaster")).toBe("swordsman");
    expect(tier1ClassOf("archmage")).toBe("mage");
    expect(tier1ClassOf("none")).toBe("none");
  });

  it("tier2ClassOf — 2차/none 은 null (1차만 전직 가능)", () => {
    expect(tier2ClassOf("swordmaster")).toBeNull();
    expect(tier2ClassOf("none")).toBeNull();
  });
});
