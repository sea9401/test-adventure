import { describe, it, expect } from "vitest";
import type { PlayerCombat } from "@/adventure/battle/engine";
import { applyStance, isStanceId, normalizeStance } from "./stance";

function basePlayer(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 100,
    maxHp: 100,
    atk: 100,
    def: 50,
    spd: 10,
    evasionPct: 10,
    attackCount: 1,
    ...over,
  };
}

describe("applyStance", () => {
  it("null/undefined 은 항등 — 원본 그대로", () => {
    const p = basePlayer();
    expect(applyStance(p, null)).toBe(p);
    expect(applyStance(p, undefined)).toBe(p);
  });

  it("공세: atk ×1.18, def ×0.9, 회피 −5%p", () => {
    const r = applyStance(basePlayer(), "onslaught");
    expect(r.atk).toBe(118); // round(100*1.18)
    expect(r.def).toBe(45); // round(50*0.9)
    expect(r.evasionPct).toBe(5); // 10-5
  });

  it("공세: 회피 하한 0 클램프 (음수 방지)", () => {
    const r = applyStance(basePlayer({ evasionPct: 3 }), "onslaught");
    expect(r.evasionPct).toBe(0); // max(0, 3-5)
  });

  it("수성: def ×1.25, atk ×0.9, 회피 불변", () => {
    const r = applyStance(basePlayer(), "bulwark");
    expect(r.atk).toBe(90);
    expect(r.def).toBe(63); // round(50*1.25)=62.5→63
    expect(r.evasionPct).toBe(10);
  });

  it("처형: atk ×0.95 + 기본 처형 부여 (스킬 미보유자)", () => {
    const r = applyStance(basePlayer(), "execution");
    expect(r.atk).toBe(95);
    expect(r.executionDamageMult).toBe(1.3);
    expect(r.executionHpFraction).toBe(0.33);
  });

  it("처형: 기존 처형이 더 강하면 유지 (max 합성, 너프 없음)", () => {
    const r = applyStance(
      basePlayer({ executionDamageMult: 1.8, executionHpFraction: 0.25 }),
      "execution",
    );
    expect(r.executionDamageMult).toBe(1.8); // max(1.8, 1.3)
    expect(r.executionHpFraction).toBe(0.33); // max(0.25, 0.33)
  });

  it("원본 객체를 변형하지 않는다 (순수)", () => {
    const p = basePlayer();
    applyStance(p, "onslaught");
    expect(p.atk).toBe(100);
    expect(p.def).toBe(50);
  });
});

describe("isStanceId / normalizeStance", () => {
  it("유효 id 통과", () => {
    expect(isStanceId("onslaught")).toBe(true);
    expect(isStanceId("bulwark")).toBe(true);
    expect(isStanceId("execution")).toBe(true);
  });
  it("무효값 거부 → null", () => {
    expect(isStanceId("nope")).toBe(false);
    expect(normalizeStance("nope")).toBeNull();
    expect(normalizeStance(undefined)).toBeNull();
    expect(normalizeStance(null)).toBeNull();
    expect(normalizeStance("onslaught")).toBe("onslaught");
  });
});
