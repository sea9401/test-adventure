import { describe, it, expect } from "vitest";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";
import {
  applyStance,
  isStanceId,
  normalizeStance,
  stanceBattleLogText,
  stanceEffectChips,
  stanceRewardMult,
} from "./stance";

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

  it("공세: atk ×1.12, def ×0.92, 회피 −4%p", () => {
    const r = applyStance(basePlayer(), "onslaught");
    expect(r.atk).toBe(112); // round(100*1.12)
    expect(r.def).toBe(46); // round(50*0.92)
    expect(r.evasionPct).toBe(6); // 10-4
  });

  it("공세: 회피 하한 0 클램프 (음수 방지)", () => {
    const r = applyStance(basePlayer({ evasionPct: 3 }), "onslaught");
    expect(r.evasionPct).toBe(0); // max(0, 3-4)
  });

  it("수성: def ×1.14, atk ×0.92, 회피 불변", () => {
    const r = applyStance(basePlayer(), "bulwark");
    expect(r.atk).toBe(92);
    expect(r.def).toBe(57); // round(50*1.14)=57
    expect(r.evasionPct).toBe(10);
  });

  it("처형: 선행 공격 -4% + 기본 처형 부여 (스킬 미보유자)", () => {
    const r = applyStance(basePlayer(), "execution");
    expect(r.atk).toBe(96); // atkMult 0.96 — 무대가 지배 방지용 선행 페널티
    expect(r.executionDamageMult).toBe(1.4);
    expect(r.executionHpFraction).toBe(0.45);
  });

  it("처형: 기존 처형이 더 강하면 유지 (max 합성, 너프 없음)", () => {
    const r = applyStance(
      basePlayer({ executionDamageMult: 1.8, executionHpFraction: 0.5 }),
      "execution",
    );
    expect(r.executionDamageMult).toBe(1.8); // max(1.8, 1.6)
    expect(r.executionHpFraction).toBe(0.5); // max(0.5, 0.45)
  });

  it("원본 객체를 변형하지 않는다 (순수)", () => {
    const p = basePlayer();
    applyStance(p, "onslaught");
    expect(p.atk).toBe(100);
    expect(p.def).toBe(50);
  });
});

describe("stanceBattleLogText", () => {
  it("전술별 안내 문구 반환, null 은 null", () => {
    expect(stanceBattleLogText("onslaught")).toContain("공세");
    expect(stanceBattleLogText("bulwark")).toContain("수성");
    expect(stanceBattleLogText("execution")).toContain("처형");
    expect(stanceBattleLogText(null)).toBeNull();
    expect(stanceBattleLogText(undefined)).toBeNull();
  });
});

describe("stanceEffectChips", () => {
  it("노획(null) 은 보스 드랍률·경험치 buff 칩 (GREED_REWARD 도출)", () => {
    expect(stanceEffectChips(null)).toEqual([
      { label: "보스 드랍률 +25%", kind: "buff" },
      { label: "보스 경험치 +15%", kind: "buff" },
    ]);
    // undefined 도 동일(노획 취급).
    expect(stanceEffectChips(undefined)).toEqual(stanceEffectChips(null));
  });
  it("공세 — 공격 buff + 방어/회피 penalty (STANCE_MOD 도출)", () => {
    expect(stanceEffectChips("onslaught")).toEqual([
      { label: "공격 +12%", kind: "buff" },
      { label: "방어 -8%", kind: "penalty" },
      { label: "회피 -4%p", kind: "penalty" },
    ]);
  });
  it("수성 — 공격 penalty + 방어 buff, 회피 0 은 칩 생략", () => {
    expect(stanceEffectChips("bulwark")).toEqual([
      { label: "공격 -8%", kind: "penalty" },
      { label: "방어 +14%", kind: "buff" },
    ]);
  });
  it("처형 — 선행 공격 페널티 + 처형 보정 칩", () => {
    expect(stanceEffectChips("execution")).toEqual([
      { label: "공격 -4%", kind: "penalty" },
      { label: "HP 45%↓ 적 +40% 피해", kind: "buff" },
    ]);
  });
});

describe("stanceRewardMult", () => {
  it("노획(null/undefined) — 드랍 ×1.25, 경험치 ×1.15", () => {
    expect(stanceRewardMult(null)).toEqual({ dropRateMult: 1.25, expMult: 1.15 });
    expect(stanceRewardMult(undefined)).toEqual({
      dropRateMult: 1.25,
      expMult: 1.15,
    });
  });
  it("전투 스탠스 3종은 보상 항등 (1×) — 보정은 전투 능력치로만", () => {
    for (const id of ["onslaught", "bulwark", "execution"] as const) {
      expect(stanceRewardMult(id)).toEqual({ dropRateMult: 1, expMult: 1 });
    }
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
