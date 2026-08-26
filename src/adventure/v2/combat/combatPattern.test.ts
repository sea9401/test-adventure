import { describe, it, expect } from "vitest";
import {
  conditionPasses,
  evaluateCombatPattern,
  defaultPatternFromEquipped,
  parseCombatPattern,
  parseCombatPresets,
  v2PureSkillFormulaCoefficients,
  V2_COMBAT_PATTERN_MAX_BLOCKS,
  V2_COMBAT_PATTERN_MAX_PRESETS,
  V2_COMBAT_PRESET_NAME_MAXLEN,
  type V2PatternCtx,
  type V2CombatPattern,
} from "./combatPattern";
import type { StatKey } from "@/adventure/data/stats";

function ctx(over: Partial<V2PatternCtx> = {}): V2PatternCtx {
  return {
    selfHpPct: 100,
    selfMpPct: 100,
    selfShield: 0,
    selfShieldActive: false,
    selfBuffStats: new Set<StatKey>(),
    selfBuffPctTargets: new Set<"evasion" | "crit" | "damageReduction" | "reflectDamage">(),
    selfResources: { impact: 0, ironWallReflect: 0 },
    enemyHpPct: 100,
    enemyBleed: 0,
    enemyPoison: 0,
    enemyVuln: 0,
    enemyFrostChill: 0,
    turn: 1,
    ...over,
  };
}

describe("conditionPasses", () => {
  it("always — 항상 참", () => {
    expect(conditionPasses({ kind: "always" }, ctx())).toBe(true);
  });

  it("all/any — 하위 조건 조합", () => {
    const lowHp = ctx({ selfHpPct: 35, selfMpPct: 80 });
    expect(
      conditionPasses(
        {
          kind: "all",
          conditions: [
            { kind: "self_hp", op: "below", pct: 40 },
            { kind: "self_mp", op: "above", pct: 50 },
          ],
        },
        lowHp,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        {
          kind: "any",
          conditions: [
            { kind: "self_hp", op: "below", pct: 20 },
            { kind: "self_mp", op: "above", pct: 50 },
          ],
        },
        lowHp,
      ),
    ).toBe(true);
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

  it("self_shield active/inactive — 보호막 재시전 방지 패턴", () => {
    expect(conditionPasses({ kind: "self_shield", active: false }, ctx())).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_shield", active: false },
        ctx({ selfShieldActive: true }),
      ),
    ).toBe(false);
    expect(
      conditionPasses(
        { kind: "self_shield", active: true },
        ctx({ selfShieldActive: true }),
      ),
    ).toBe(true);
  });

  it("self_shield atMost/atLeast — 현재 보호막 수치를 경계 포함 비교", () => {
    const shielded = ctx({ selfShield: 120, selfShieldActive: true });
    expect(
      conditionPasses(
        { kind: "self_shield", op: "atMost", value: 120 },
        shielded,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_shield", op: "atLeast", value: 120 },
        shielded,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_shield", op: "atMost", value: 119 },
        shielded,
      ),
    ).toBe(false);
    expect(
      conditionPasses(
        { kind: "self_shield", op: "atLeast", value: 121 },
        shielded,
      ),
    ).toBe(false);
  });

  it("self_buff active/inactive — 재버프 방지 패턴", () => {
    const buffed = ctx({ selfBuffStats: new Set<StatKey>(["str"]) });
    // "str 버프 없을 때만" → 버프 중이면 false(재시전 안 함).
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: false }, buffed)).toBe(false);
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: false }, ctx())).toBe(true);
    expect(conditionPasses({ kind: "self_buff", stat: "str", active: true }, buffed)).toBe(true);
  });

  it("self_buff_pct active/inactive — 파생버프(회피/철포) 재시전 패턴", () => {
    const eva = ctx({ selfBuffPctTargets: new Set(["evasion" as const]) });
    // "회피 버프 없을 때만"(선풍각 기본조건) → 버프 중이면 false(평타), 만료면 true(재시전).
    expect(conditionPasses({ kind: "self_buff_pct", target: "evasion", active: false }, eva)).toBe(false);
    expect(conditionPasses({ kind: "self_buff_pct", target: "evasion", active: false }, ctx())).toBe(true);
    expect(conditionPasses({ kind: "self_buff_pct", target: "evasion", active: true }, eva)).toBe(true);
    // 다른 타깃은 독립.
    expect(conditionPasses({ kind: "self_buff_pct", target: "crit", active: false }, eva)).toBe(true);
  });

  it("self_buff_pct — 지속 회복·확정 회피 상태 효과도 판정한다", () => {
    const active = ctx({
      selfBuffPctTargets: new Set(["regen", "guaranteedEvade"]),
    });
    expect(
      conditionPasses(
        { kind: "self_buff_pct", target: "regen", active: true },
        active,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_buff_pct", target: "guaranteedEvade", active: false },
        active,
      ),
    ).toBe(false);
  });

  it("enemy_hp — 처형 패턴", () => {
    expect(conditionPasses({ kind: "enemy_hp", op: "below", pct: 30 }, ctx({ enemyHpPct: 25 }))).toBe(true);
    expect(conditionPasses({ kind: "enemy_hp", op: "below", pct: 30 }, ctx({ enemyHpPct: 80 }))).toBe(false);
  });

  it("enemy_status atLeast/atMost/none — 스택 조건 패턴", () => {
    const c = ctx({ enemyBleed: 3 });
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 3 }, c)).toBe(true);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 4 }, c)).toBe(false);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atMost", stacks: 3 }, c)).toBe(true);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "atMost", stacks: 2 }, c)).toBe(false);
    expect(conditionPasses({ kind: "enemy_status", tag: "poison", op: "none", stacks: 0 }, c)).toBe(true);
    expect(conditionPasses({ kind: "enemy_status", tag: "bleed", op: "none", stacks: 0 }, c)).toBe(false);
  });

  it("enemy_status 한기 — 현재 대상의 한기 스택을 경계 포함 비교한다", () => {
    const chilled = ctx({ enemyFrostChill: 4 });
    expect(
      conditionPasses(
        { kind: "enemy_status", tag: "frostChill", op: "atLeast", stacks: 4 },
        chilled,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "enemy_status", tag: "frostChill", op: "atMost", stacks: 3 },
        chilled,
      ),
    ).toBe(false);
    expect(
      conditionPasses(
        { kind: "enemy_status", tag: "frostChill", op: "none", stacks: 0 },
        ctx(),
      ),
    ).toBe(true);
  });

  it("self_resource none/atLeast/atMost — 내 전투 자원을 경계 포함 비교", () => {
    const charged = ctx({
      selfResources: { impact: 3, ironWallReflect: 2 },
    });
    expect(
      conditionPasses(
        { kind: "self_resource", resource: "impact", op: "atLeast", value: 3 },
        charged,
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_resource", resource: "impact", op: "atMost", value: 2 },
        charged,
      ),
    ).toBe(false);
    expect(
      conditionPasses(
        { kind: "self_resource", resource: "ironWallReflect", op: "none", value: 99 },
        ctx(),
      ),
    ).toBe(true);
    expect(
      conditionPasses(
        { kind: "self_resource", resource: "ironWallReflect", op: "none", value: 0 },
        charged,
      ),
    ).toBe(false);
  });

  it("중량 자원을 다른 직업 스킬의 패턴에서도 판정한다", () => {
    const mutation = ctx({
      selfResources: { weight: 3 },
    });

    expect(
      conditionPasses(
        { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
        mutation,
      ),
    ).toBe(true);
  });

  it("법칙 각인 총합 자원을 파싱하고 누락된 옛 컨텍스트는 0으로 판정한다", () => {
    const condition = {
      kind: "self_resource" as const,
      resource: "inscription" as const,
      op: "atLeast" as const,
      value: 4,
    };
    expect(
      conditionPasses(
        condition,
        ctx({ selfResources: { inscription: 4 } }),
      ),
    ).toBe(true);
    expect(conditionPasses(condition, ctx())).toBe(false);
    expect(
      parseCombatPattern({
        blocks: [
          {
            condition,
            action: { kind: "skill", skillId: "v2c_lawweaver_release" },
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          condition,
          action: { kind: "skill", skillId: "v2c_lawweaver_release" },
        },
      ],
    });
  });

  it("enemy_debuff — 봉쇄 효과가 없을 때만 재시전한다", () => {
    const condition = {
      kind: "enemy_debuff" as const,
      target: "damageDown" as const,
      active: false,
    };
    expect(conditionPasses(condition, ctx())).toBe(true);
    expect(
      conditionPasses(
        condition,
        ctx({ enemyDamageDownActive: true }),
      ),
    ).toBe(false);
  });

  it("enemy_debuff — 상대 회복 감소 활성 여부를 판정한다", () => {
    const condition = {
      kind: "enemy_debuff" as const,
      target: "healReduction" as const,
      active: true,
    };
    expect(conditionPasses(condition, ctx())).toBe(false);
    expect(
      conditionPasses(
        condition,
        ctx({ enemyHealReductionActive: true }),
      ),
    ).toBe(true);
  });

  it("enemy_debuff — 상대 능력치 감소 활성 여부를 판정하고 저장한다", () => {
    const condition = {
      kind: "enemy_debuff",
      target: "vit",
      active: true,
    } satisfies V2CombatPattern["blocks"][number]["condition"];
    const debuffed = Object.assign(ctx(), {
      enemyStatDebuffs: new Set<StatKey>(["vit"]),
    });

    expect(conditionPasses(condition, debuffed)).toBe(true);
    expect(conditionPasses(condition, ctx())).toBe(false);
    expect(
      parseCombatPattern({
        blocks: [
          {
            condition,
            action: { kind: "skill", skillId: "v2c_swordsaint_flash" },
          },
        ],
      }).blocks[0]?.condition,
    ).toEqual({ kind: "enemy_debuff", target: "vit", active: true });
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

  it("역할 액션은 현재 로드아웃 resolver 가 돌려준 스킬로 평가", () => {
    const byRole: V2CombatPattern = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "role", role: "heal" } },
        { condition: { kind: "always" }, action: { kind: "role", role: "main_attack" } },
      ],
    };
    const resolveRole = (role: string) =>
      role === "heal" ? "recover" : role === "main_attack" ? "strike" : null;

    expect(evaluateCombatPattern(byRole, ctx(), all, resolveRole)).toBe("strike");
    expect(evaluateCombatPattern(byRole, ctx({ selfHpPct: 20 }), all, resolveRole)).toBe("recover");
    expect(
      evaluateCombatPattern(byRole, ctx({ selfHpPct: 20 }), (id) => id !== "recover", resolveRole),
    ).toBe("strike");
  });

  it("아무 블록도 안 맞으면 null(평타 폴백)", () => {
    const noFallback: V2CombatPattern = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: "heal" } },
      ],
    };
    expect(evaluateCombatPattern(noFallback, ctx(), all)).toBeNull();
  });

  it("명시한 일반 공격은 조건이 맞으면 아래 스킬 후보를 중단한다", () => {
    const explicitBasicAttack = parseCombatPattern({
      blocks: [
        {
          condition: { kind: "always" },
          action: { kind: "basic_attack" },
        },
        {
          condition: { kind: "always" },
          action: { kind: "skill", skillId: "strike" },
        },
      ],
    });

    expect(explicitBasicAttack.blocks[0]?.action).toEqual({
      kind: "basic_attack",
    });
    expect(evaluateCombatPattern(explicitBasicAttack, ctx(), all)).toBeNull();
  });
});

describe("parseCombatPattern (저장 검증)", () => {
  it("중량 조건은 보존하고 제거된 분열체 조건은 버린다", () => {
    const parsed = parseCombatPattern({
      blocks: [
        {
          condition: { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
          action: { kind: "skill", skillId: "v2c_golem_tectoniccollapse" },
        },
        {
          condition: { kind: "self_resource", resource: "split", op: "atMost", value: 1 },
          action: { kind: "skill", skillId: "v2c_slime_split" },
        },
      ],
    });

    expect(parsed.blocks).toHaveLength(1);
    expect(parsed.blocks.map((block) => block.condition)).toEqual([
      { kind: "self_resource", resource: "weight", op: "atLeast", value: 3 },
    ]);
  });

  it("self_resource 조건을 정규화하고 알 수 없는 자원은 블록째 버린다", () => {
    const parsed = parseCombatPattern({
      blocks: [
        {
          condition: {
            kind: "self_resource",
            resource: "impact",
            op: "atLeast",
            value: 3.9,
          },
          action: { kind: "skill", skillId: "ram" },
        },
        {
          condition: {
            kind: "self_resource",
            resource: "unknown",
            op: "none",
            value: 0,
          },
          action: { kind: "skill", skillId: "guard" },
        },
      ],
    });

    expect(parsed.blocks).toEqual([
      {
        condition: {
          kind: "self_resource",
          resource: "impact",
          op: "atLeast",
          value: 3,
        },
        action: { kind: "skill", skillId: "ram" },
      },
    ]);
  });

  it("유효 블록만 통과, 잘못된 블록은 drop", () => {
    const raw = {
      blocks: [
        { condition: { kind: "self_hp", op: "below", pct: 30 }, action: { kind: "skill", skillId: "heal" } },
        { condition: { kind: "self_shield", active: false }, action: { kind: "skill", skillId: "shield" } },
        {
          condition: {
            kind: "all",
            conditions: [
              { kind: "self_hp", op: "below", pct: 50 },
              { kind: "self_shield", active: false },
            ],
          },
          action: { kind: "skill", skillId: "guard" },
        },
        { condition: { kind: "always" }, action: { kind: "skill", skillId: "strike" } },
        { condition: { kind: "always" }, action: { kind: "role", role: "main_attack" } },
        { condition: { kind: "bogus" }, action: { kind: "skill", skillId: "x" } }, // 잘못된 조건 → drop
        { condition: { kind: "always" }, action: { kind: "nope" } }, // 잘못된 행동 → drop
        { condition: { kind: "always" }, action: { kind: "role", role: "unknown" } }, // 잘못된 역할 → drop
        { condition: { kind: "self_hp", op: "below" }, action: { kind: "skill", skillId: "x" } }, // pct 누락 → drop
      ],
    };
    const p = parseCombatPattern(raw);
    expect(p.blocks).toHaveLength(5);
    expect(p.blocks[0].action).toEqual({ kind: "skill", skillId: "heal" });
    expect(p.blocks[1].condition).toEqual({ kind: "self_shield", active: false });
    expect(p.blocks[2].condition.kind).toBe("all");
    expect(p.blocks[3].condition).toEqual({ kind: "always" });
    expect(p.blocks[4].action).toEqual({ kind: "role", role: "main_attack" });
  });

  it("비객체/blocks 누락 → 빈 패턴", () => {
    expect(parseCombatPattern(null).blocks).toEqual([]);
    expect(parseCombatPattern("x").blocks).toEqual([]);
    expect(parseCombatPattern({}).blocks).toEqual([]);
    expect(parseCombatPattern({ blocks: "no" }).blocks).toEqual([]);
  });

  it("pct/stacks 클램프 + 블록 상한", () => {
    const p = parseCombatPattern({
      blocks: [
        { condition: { kind: "enemy_hp", op: "below", pct: 999 }, action: { kind: "skill", skillId: "a" } },
        { condition: { kind: "enemy_status", tag: "poison", op: "atMost", stacks: 4.9 }, action: { kind: "skill", skillId: "b" } },
      ],
    });
    expect(p.blocks[0].condition).toEqual({ kind: "enemy_hp", op: "below", pct: 100 });
    expect(p.blocks[1].condition).toEqual({ kind: "enemy_status", tag: "poison", op: "atMost", stacks: 4 });
    // 상한 초과 → 잘림.
    const many = parseCombatPattern({
      blocks: Array.from({ length: V2_COMBAT_PATTERN_MAX_BLOCKS + 5 }, () => ({
        condition: { kind: "always" },
        action: { kind: "skill", skillId: "a" },
      })),
    });
    expect(many.blocks).toHaveLength(V2_COMBAT_PATTERN_MAX_BLOCKS);
  });

  it("한기 조건을 저장 데이터에서 안전하게 파싱한다", () => {
    const parsed = parseCombatPattern({
      blocks: [
        {
          condition: {
            kind: "enemy_status",
            tag: "frostChill",
            op: "atLeast",
            stacks: 4,
          },
          action: { kind: "skill", skillId: "v2c_cryomancer_absolutezero" },
        },
      ],
    });

    expect(parsed.blocks[0]?.condition).toEqual({
      kind: "enemy_status",
      tag: "frostChill",
      op: "atLeast",
      stacks: 4,
    });
  });

  it("보호막 수치 조건은 0 이상의 정수로 정규화하고 잘못된 값은 버린다", () => {
    const parsed = parseCombatPattern({
      blocks: [
        {
          condition: { kind: "self_shield", op: "atLeast", value: 12.9 },
          action: { kind: "skill", skillId: "shield-up" },
        },
        {
          condition: { kind: "self_shield", op: "atMost", value: -3 },
          action: { kind: "skill", skillId: "shield-zero" },
        },
        {
          condition: { kind: "self_shield", op: "equal", value: 10 },
          action: { kind: "skill", skillId: "bad-op" },
        },
        {
          condition: { kind: "self_shield", op: "atLeast" },
          action: { kind: "skill", skillId: "missing-value" },
        },
      ],
    });

    expect(parsed.blocks).toHaveLength(2);
    expect(parsed.blocks[0].condition).toEqual({
      kind: "self_shield",
      op: "atLeast",
      value: 12,
    });
    expect(parsed.blocks[1].condition).toEqual({
      kind: "self_shield",
      op: "atMost",
      value: 0,
    });
  });

  it("상대 디버프 조건만 안전하게 파싱한다", () => {
    const parsed = parseCombatPattern({
      blocks: [
        {
          condition: {
            kind: "enemy_debuff",
            target: "healReduction",
            active: true,
          },
          action: { kind: "skill", skillId: "anti-heal" },
        },
        {
          condition: {
            kind: "enemy_debuff",
            target: "skillProcDown",
            active: false,
          },
          action: { kind: "skill", skillId: "sealing-field" },
        },
        {
          condition: {
            kind: "enemy_debuff",
            target: "str",
            active: true,
          },
          action: { kind: "skill", skillId: "weaken" },
        },
        {
          condition: {
            kind: "enemy_debuff",
            target: "unknown",
            active: false,
          },
          action: { kind: "skill", skillId: "invalid" },
        },
      ],
    });
    expect(parsed.blocks).toHaveLength(3);
    expect(parsed.blocks[0].condition).toEqual({
      kind: "enemy_debuff",
      target: "healReduction",
      active: true,
    });
    expect(parsed.blocks[1].condition).toEqual({
      kind: "enemy_debuff",
      target: "skillProcDown",
      active: false,
    });
    expect(parsed.blocks[2].condition).toEqual({
      kind: "enemy_debuff",
      target: "str",
      active: true,
    });
  });

  it("지속 회복·확정 회피 상태 효과 조건을 안전하게 파싱한다", () => {
    const parsed = parseCombatPattern({
      blocks: ["regen", "guaranteedEvade"].map((target) => ({
        condition: { kind: "self_buff_pct", target, active: false },
        action: { kind: "skill", skillId: target },
      })),
    });
    expect(parsed.blocks.map((block) => block.condition)).toEqual([
      { kind: "self_buff_pct", target: "regen", active: false },
      { kind: "self_buff_pct", target: "guaranteedEvade", active: false },
    ]);
  });

  it("광전사 내부 준비 상태를 조건으로 안전하게 파싱한다", () => {
    const parsed = parseCombatPattern({
      blocks: ["berserkerFinisher", "berserkerDeathOvercome"].map((target) => ({
        condition: { kind: "self_buff_pct", target, active: true },
        action: { kind: "skill", skillId: target },
      })),
    });
    expect(parsed.blocks.map((block) => block.condition)).toEqual([
      { kind: "self_buff_pct", target: "berserkerFinisher", active: true },
      { kind: "self_buff_pct", target: "berserkerDeathOvercome", active: true },
    ]);
  });
});

describe("defaultPatternFromEquipped", () => {
  it("장착 순서대로 항상→스킬 블록", () => {
    const p = defaultPatternFromEquipped(["a", "b", "c"]);
    expect(p.blocks).toHaveLength(3);
    expect(p.blocks[0]).toEqual({ condition: { kind: "always" }, action: { kind: "skill", skillId: "a" } });
    expect(p.blocks[2].action).toEqual({ kind: "skill", skillId: "c" });
    // 평가 시 슬롯 순서대로 첫 사용가능 스킬(옛 동작 재현, proc 없음).
    expect(evaluateCombatPattern(p, ctx(), () => true)).toBe("a");
    expect(evaluateCombatPattern(p, ctx(), (id) => id !== "a")).toBe("b");
  });
});

describe("parseCombatPresets (C4 저장 검증)", () => {
  it("유효 항목 통과 + 이름 trim/길이 클램프 + pattern 재검증", () => {
    const out = parseCombatPresets([
      {
        name: "  보스용  ",
        pattern: {
          blocks: [
            { condition: { kind: "always" }, action: { kind: "skill", skillId: "strike" } },
            { condition: { kind: "bogus" }, action: { kind: "skill", skillId: "x" } }, // 블록 drop
          ],
        },
      },
      { name: "x".repeat(40), pattern: { blocks: [] } }, // 이름 길이 클램프
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].name).toBe("보스용"); // trim
    expect(out[0].pattern.blocks).toHaveLength(1); // 잘못된 블록 drop(parseCombatPattern 재사용)
    expect(out[1].name).toHaveLength(V2_COMBAT_PRESET_NAME_MAXLEN);
  });

  it("이름 없는/비객체 항목은 drop", () => {
    const out = parseCombatPresets([
      { pattern: { blocks: [] } }, // 이름 없음 → drop
      { name: "   ", pattern: { blocks: [] } }, // 공백뿐 → drop
      "nope", // 비객체 → drop
      { name: "유효", pattern: { blocks: [] } },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].name).toBe("유효");
  });

  it("중복 이름 drop — 이름 = 키(first-wins)", () => {
    const out = parseCombatPresets([
      { name: "보스용", pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: "a" } }] } },
      { name: "보스용", pattern: { blocks: [] } }, // 중복 → drop(첫 항목 유지)
      { name: " 보스용 ", pattern: { blocks: [] } }, // trim 후 중복 → drop
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].pattern.blocks).toHaveLength(1);
  });

  it("배열 아님 → 빈 라이브러리, 개수 상한 적용", () => {
    expect(parseCombatPresets(null)).toEqual([]);
    expect(parseCombatPresets({ presets: [] })).toEqual([]);
    const many = parseCombatPresets(
      Array.from({ length: V2_COMBAT_PATTERN_MAX_PRESETS + 5 }, (_, i) => ({
        name: `p${i}`,
        pattern: { blocks: [] },
      })),
    );
    expect(many).toHaveLength(V2_COMBAT_PATTERN_MAX_PRESETS);
  });
});

describe("v2PureSkillFormulaCoefficients 주스탯 공격력 환산 보정", () => {
  it("물리·마법 1~3차는 공격력 환산 0.7에서도 기존 주스탯 피해 기울기를 보존한다", () => {
    const cases = [
      { scaling: "physical" as const, tier: 1 as const, attack: 1.08, primary: 0.197 },
      { scaling: "physical" as const, tier: 2 as const, attack: 1.12, primary: 0.643 },
      { scaling: "physical" as const, tier: 3 as const, attack: 1.2, primary: 1.075 },
      { scaling: "magic" as const, tier: 1 as const, attack: 1.05, primary: 0.035 },
      { scaling: "magic" as const, tier: 2 as const, attack: 1.08, primary: 0.3695 },
      { scaling: "magic" as const, tier: 3 as const, attack: 1.1, primary: 0.88 },
    ];

    for (const testCase of cases) {
      const actual = v2PureSkillFormulaCoefficients({
        tier: testCase.tier,
        scaling: testCase.scaling,
        directDamageEffectCount: 1,
        resolvedAttackCoef: testCase.tier === 1 ? 1.3 : testCase.tier === 2 ? 1.5 : 1.75,
      });
      expect(actual.attackCoef, `${testCase.scaling} tier ${testCase.tier}`).toBeCloseTo(
        testCase.attack,
        6,
      );
      expect(
        actual.primaryStatCoef,
        `${testCase.scaling} tier ${testCase.tier}`,
      ).toBeCloseTo(testCase.primary, 6);
    }
  });

  it("다단 스킬도 타격별 공격력 환산 증가분을 직접 계수에서 차감한다", () => {
    const actual = v2PureSkillFormulaCoefficients({
      tier: 2,
      scaling: "physical",
      directDamageEffectCount: 3,
      resolvedAttackCoef: 0.5,
    });

    expect(actual.attackCoef).toBeCloseTo(0.373333, 6);
    expect(actual.primaryStatCoef).toBeCloseTo(0.214333, 6);
  });

  it("공격력 계수가 높은 스킬의 보정 직접 계수는 0 아래로 내려가지 않는다", () => {
    const actual = v2PureSkillFormulaCoefficients({
      tier: 1,
      scaling: "magic",
      directDamageEffectCount: 1,
      resolvedAttackCoef: 4,
    });

    expect(actual.attackCoef).toBe(3.75);
    expect(actual.primaryStatCoef).toBe(0);
  });
});
