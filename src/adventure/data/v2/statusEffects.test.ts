import { describe, it, expect } from "vitest";
import {
  V2_DOT_PRESETS,
  V2_DEBUFF_PRESETS,
  V2_STATUS_KINDS,
} from "./statusEffects";

describe("v2 상태이상 카탈로그 (PR-9)", () => {
  it("DoT 프리셋 — label/tag 일치 + stacks·turns > 0", () => {
    for (const [name, p] of Object.entries(V2_DOT_PRESETS)) {
      expect(p.label, `${name} label`).toBe(name);
      expect(p.stacks, `${name} stacks`).toBeGreaterThan(0);
      expect(p.maxStacks, `${name} maxStacks`).toBeGreaterThanOrEqual(p.stacks);
      expect(p.turns, `${name} turns`).toBeGreaterThan(0);
    }
    // 중독 = 약하고 길게 / 출혈 = 강하고 짧게 (정체성).
    expect(V2_DOT_PRESETS.중독.turns).toBeGreaterThan(V2_DOT_PRESETS.출혈.turns);
    expect(V2_DOT_PRESETS.중독.pctMaxHpPerStack).toBeGreaterThan(0);
    expect(V2_DOT_PRESETS.출혈.atkCoefPerStack).toBeGreaterThan(0);
  });

  it("디버프 프리셋 — pct·turns > 0, 유효 stat (행동불가 없음)", () => {
    const validStats = ["spd", "str", "vit", "dex", "luk", "int"];
    for (const [name, p] of Object.entries(V2_DEBUFF_PRESETS)) {
      expect(p.pct, `${name} pct`).toBeGreaterThan(0);
      expect(p.turns, `${name} turns`).toBeGreaterThan(0);
      expect(validStats, `${name} stat`).toContain(p.stat);
    }
    expect(V2_DEBUFF_PRESETS.둔화.stat).toBe("spd"); // 둔화 = 속도−
  });

  it("STATUS_KINDS 분류 — DoT vs debuff 일관 + 행동불가 키 없음", () => {
    expect(V2_STATUS_KINDS.출혈).toBe("dot");
    expect(V2_STATUS_KINDS.중독).toBe("dot");
    expect(V2_STATUS_KINDS.둔화).toBe("debuff");
    // 기절/빙결/턴스킵 같은 행동불가 키는 카탈로그에 없어야(설계 원칙).
    expect(Object.keys(V2_STATUS_KINDS)).not.toContain("기절");
    expect(Object.keys(V2_STATUS_KINDS)).not.toContain("빙결");
  });
});
