import { describe, it, expect } from "vitest";
import {
  conditionPasses,
  evaluateCombatPattern,
  defaultPatternFromEquipped,
  parseCombatPattern,
  V2_COMBAT_PATTERN_MAX_BLOCKS,
  type V2PatternCtx,
  type V2CombatPattern,
} from "./combatPattern";
import type { StatKey } from "@/adventure/data/stats";

function ctx(over: Partial<V2PatternCtx> = {}): V2PatternCtx {
  return {
    selfHpPct: 100,
    selfMpPct: 100,
    selfBuffStats: new Set<StatKey>(),
    enemyHpPct: 100,
    enemyBleed: 0,
    enemyPoison: 0,
    enemyVuln: 0,
    turn: 1,
    ...over,
  };
}

describe("conditionPasses", () => {
  it("always — 항상 참", () => {
    expect(conditionPasses({ kind: "always" }, ctx())).toBe(true);
  });

  it("self_hp below/above — 경계 포함", () => {
    const c = ctx({ selfHpPct: 30 });
    expect(conditionPasses({ kind: "self_hp", op: "below", pct: 30 }, c)).toBe(true);
    expect(conditionPasses({ kind: "self_hp", op: "below", pct: 29 }, c)).toBe(false);
    expect(conditionPasses({ kind: "self_hp", op: "above", pct: 30 }, c)).toBe(true);
    expect(conditionPasses({ kind: "self_hp", op: "above", pct: 31 }, c)).toBe(false);
  });

  it("self_mp", () => {
    expect(conditionPasses({ kind: "self_mp", op: "below", pct: 20 }, ctx({ selfMpPct: 10 }))).toBe(true);
    expect(conditionPasses({ kind: "self_mp", op: "below", pct: 20 }, ctx({ selfMpPct: 50 }))).toBe(false);
  });

  it("self_buff active/inactive — 재버프 방지 패턴", () => {
    const buffed = ctx({ selfBuffStats: new Set<StatKey>(["str"]) });
    // "str 버프 없을 때만" → 버프 중이면 false(재시전 안 함).
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: false }, buffed)).toBe(false);
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: false }, ctx())).toBe(true);
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: true }, buffed)).toBe(true);
  });

  it("enemy_hp — 처형 패턴", () => {
    expect(conditionPasses({ kind: "enemy_hp", op: "below", pct: 30 }, ctx({ enemyHpPct: 25 }))).toBe(true);
    expect(conditionPasses({ kind: "enemy_hp", op: "below", pct: 30 }, ctx({ enemyHpPct: 80 }))).toBe(false);
  });

  it("enemy_status atLeast/none — 스택 폭발 패턴", () => {
    const c = ctx({ enemyBleed: 3 });
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 3 }, c)).toBe(true);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 4 }, c)).toBe(false);
    expect(conditionPasses({ kind: "enemy_status", tag: "poison", op: "none", stacks: 0 }, c)).toBe(true);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "none", stacks: 0 }, c)).toBe(false);
  });

  it("turn atMost/atLeast/every — 오프너/주기", () => {
    expect(conditionPasses({ kind: "turn", op: "atMost", value: 1 }, ctx({ turn: 1 }))).toBe(true);
    expect(conditionPasses({ kind: "turn", op: "atMost", value: 1 }, ctx({ turn: 2 }))).toBe(false);
    expect(conditionPasses({ kind: "turn", op: "atLeast", value: 5 }, ctx({ turn: 6 }))).toBe(true);
    expect(conditionPasses({ kind: "turn", op: "every", value: 3 }, ctx({ turn: 6 }))).toBe(true);
    expect(conditionPasses({ kind: "turn", op: "every", value: 3 }, ctx({ turn: 7 }))).toBe(false);
    // value 0/음수는 무효(false).
    expect(conditionPasses({ kind: "turn", op: "every", value: 0 }, ctx({ turn: 5 }))).toBe(false);
  });
});

describe("evaluateCombatPattern", () => {
  const all = () => true;
  const pattern: V2CombatPattern = {
    blocks: [
      { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: "heal" } },
      { condition: { kind: "enemy_hp", op: "below", pct: 25 }, action: { kind: "skill", skillId: "execute" } },
      { condition: { kind: "always" }, action: { kind: "skill", skillId: "strike" } },
    ],
  };

  it("우선순위 — 위에서부터 조건 맞는 첫 블록", () => {
    // 풀피·적 풀피 → heal/execute 조건 불충족 → 폴백 strike.
    expect(evaluateCombatPattern(pattern, ctx(), all)).toBe("strike");
    // 저피 → heal 최우선.
    expect(evaluateCombatPattern(pattern, ctx({ selfHpPct: 20 }), all)).toBe("heal");
    // 풀피·적 저피 → execute.
    expect(evaluateCombatPattern(pattern, ctx({ enemyHpPct: 10 }), all)).toBe("execute");
  });

  it("실행 불가(쿨다운/MP) 블록은 건너뛰고 다음으로", () => {
    // heal 사용 불가 → 저피여도 heal 스킵, 폴백 strike.
    const noHeal = (id: string) => id !== "heal";
    expect(evaluateCombatPattern(pattern, ctx({ selfHpPct: 20 }), noHeal)).toBe("strike");
  });

  it("아무 블록도 안 맞으면 null(평타 폴백)", () => {
    const noFallback: V2CombatPattern = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: "heal" } },
      ],
    };
    expect(evaluateCombatPattern(noFallback, ctx(), all)).toBeNull();
  });
});

describe("parseCombatPattern (저장 검증)", () => {
  it("유효 블록만 통과, 잘못된 블록은 drop", () => {
    const raw = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: "heal" } },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: "strike" } },
        { condition: { kind: "bogus" }, action: { kind: "skill", skillId: "x" } }, // 잘못된 조건 → drop
        { condition: { kind: "always" }, action: { kind: "nope" } }, // 잘못된 행동 → drop
        { condition: { kind: "self_hp", op: "below" }, action: { kind: "skill", skillId: "x" } }, // pct 누락 → drop
      ],
    };
    const p = parseCombatPattern(raw);
    expect(p.blocks).toHaveLength(2);
    expect(p.blocks[0].action).toEqual({ kind: "skill", skillId: "heal" });
    expect(p.blocks[1].condition).toEqual({ kind: "always" });
  });

  it("비객체/blocks 누락 → 빈 패턴", () => {
    expect(parseCombatPattern(null).blocks).toEqual([]);
    expect(parseCombatPattern("x").blocks).toEqual([]);
    expect(parseCombatPattern({}).blocks).toEqual([]);
    expect(parseCombatPattern({ blocks: "no" }).blocks).toEqual([]);
  });

  it("pct/stacks 클램프 + 블록 상한", () => {
    const p = parseCombatPattern({
      blocks: [{ condition: { kind: "enemy_hp", op: "below", pct: 999 }, action: { kind: "skill", skillId: "a" } }],
    });
    expect(p.blocks[0].condition).toEqual({ kind: "enemy_hp", op: "below", pct: 100 });
    // 상한 초과 → 잘림.
    const many = parseCombatPattern({
      blocks: Array.from({ length: V2_COMBAT_PATTERN_MAX_BLOCKS + 5 }, () => ({
        condition: { kind: "always" },
        action: { kind: "skill", skillId: "a" },
      })),
    });
    expect(many.blocks).toHaveLength(V2_COMBAT_PATTERN_MAX_BLOCKS);
  });
});

describe("defaultPatternFromEquipped", () => {
  it("장착 순서대로 항상→스킬 블록", () => {
    const p = defaultPatternFromEquipped(["a", "b", "c"]);
    expect(p.blocks).toHaveLength(3);
    expect(p.blocks[0]).toEqual({ condition: { kind: "always" }, action: { kind: "skill", skillId: "a" } });
    expect(p.blocks[2].action.skillId).toBe("c");
    // 평가 시 슬롯 순서대로 첫 사용가능 스킬(옛 동작 재현, proc 없음).
    expect(evaluateCombatPattern(p, ctx(), () => true)).toBe("a");
    expect(evaluateCombatPattern(p, ctx(), (id) => id !== "a")).toBe("b");
  });
});
