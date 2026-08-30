import { describe, expect, it } from "vitest";
import type { APSkill } from "@/adventure/character/apSkills";
import {
  effectiveCombatPatternFromEquipped,
  smartDefaultPatternFromEquipped,
} from "@/adventure/data/v2/v2Skills";
import {
  composeDuelistDeclaration,
  consumeDuelistBasicHit,
  consumeDuelistCritHaste,
  duelistDeclarationProgress,
  duelistStanceSnapshot,
  highestEquippedDeclaration,
  interruptDuelistRamp,
} from "./duelistCombat";

describe("결투가 행동 가속", () => {
  it("평타 치명 가속은 다음 행동 간격에 한 번만 적용되고 소모된다", () => {
    expect(consumeDuelistCritHaste(100, 8, true)).toEqual({
      interval: 92,
      pending: false,
    });
    expect(consumeDuelistCritHaste(100, 8, false)).toEqual({
      interval: 100,
      pending: false,
    });
  });
});

describe("선언 전투 상태 문구", () => {
  it("남은 평타 횟수와 다음 연속타 증가량을 함께 보여준다", () => {
    const active = composeDuelistDeclaration(
      [
        "v2c_duelist_declaration",
        "v2c_contender_insight",
        "v2c_undefeated_momentum",
        "v2c_grandchampion_hour",
      ],
      "v2c_grandchampion_hour",
    )!;
    const after = consumeDuelistBasicHit(active).buff;
    expect(duelistDeclarationProgress(after, active.declarationName)).toBe(
      "[선언 유지] 챔피언의 시간 · 남은 평타 4회 · 다음 연속 +5%",
    );
    expect(duelistDeclarationProgress(null, active.declarationName)).toBe(
      "[선언 종료] 챔피언의 시간",
    );
  });
});

const AP_SKILL_FIXTURES: Record<string, APSkill> = {
  focused_breath: {
    id: "focused_breath",
    name: "집중의 호흡",
    description: "",
    apCost: 2,
    effect: { kind: "crit_buff_next_attack", critDmgBonusPct: 30 },
  },
  combo_strike: {
    id: "combo_strike",
    name: "연환격",
    description: "",
    apCost: 2,
    effect: { kind: "extra_attack_this_turn", count: 1 },
  },
  frenzy: {
    id: "frenzy",
    name: "폭주",
    description: "",
    apCost: 4,
    effect: { kind: "player_spd_mult_turns", mult: 1.5, turns: 3 },
  },
  storm_strike: {
    id: "storm_strike",
    name: "폭풍 일격",
    description: "",
    apCost: 3,
    effect: { kind: "atk_plus_spd_pct_bonus", spdPct: 100 },
  },
  mad_slash: {
    id: "mad_slash",
    name: "광살참",
    description: "",
    apCost: 4,
    effect: {
      kind: "multi_hit_self_damage",
      atkMult: 2,
      hits: 2,
      selfDmgPct: 15,
    },
  },
  thunder_strike: {
    id: "thunder_strike",
    name: "천뢰 일격",
    description: "",
    apCost: 5,
    effect: {
      kind: "atk_multiplier_with_silence",
      atkMult: 2.5,
      silenceTurns: 1,
    },
  },
};

const ap = (id: string): APSkill => {
  const skill = AP_SKILL_FIXTURES[id];
  if (!skill) throw new Error(`Unknown AP skill fixture: ${id}`);
  return skill;
};

describe("결투 태세 판정", () => {
  it.each([
    ["duelist", 35],
    ["contender", 40],
    ["undefeated", 45],
    ["grandchampion", 50],
  ])("%s는 공격 스킬이 없으면 평타 피해 +%d%%", (jobId, bonusPct) => {
    expect(duelistStanceSnapshot(jobId, ["v2c_duelist_declaration"], [])).toEqual({
      active: true,
      bonusPct,
      blockingSkillName: null,
    });
  });

  it("다른 직업은 선언을 장착해도 태세를 받지 않는다", () => {
    expect(duelistStanceSnapshot("paladin", ["v2c_duelist_declaration"], [])).toEqual({
      active: false,
      bonusPct: 0,
      blockingSkillName: null,
    });
  });

  it("v2 attack 스킬 이름을 비활성 사유로 돌려준다", () => {
    expect(duelistStanceSnapshot("duelist", ["v2c_paladin_cleave"], [])).toEqual({
      active: false,
      bonusPct: 0,
      blockingSkillName: "심판",
    });
  });

  it.each(["focused_breath", "combo_strike", "frenzy"])("평타 보조 AP %s는 허용한다", (id) => {
    expect(duelistStanceSnapshot("duelist", [], [ap(id)]).active).toBe(true);
  });

  it.each(["storm_strike", "mad_slash", "thunder_strike"])("직접 피해 AP %s는 태세를 끈다", (id) => {
    const snapshot = duelistStanceSnapshot("duelist", [], [ap(id)]);
    expect(snapshot.active).toBe(false);
    expect(snapshot.blockingSkillName).toBe(ap(id).name);
  });
});

describe("선언 계보 합성", () => {
  it("장착한 선언 중 가장 높은 차수만 시전 후보가 된다", () => {
    expect(highestEquippedDeclaration([
      "v2c_contender_insight",
      "v2c_duelist_declaration",
      "v2c_grandchampion_hour",
    ])).toBe("v2c_grandchampion_hour");
  });

  it("스마트 패턴은 최고 선언 하나만 버프가 없을 때 시도한다", () => {
    expect(smartDefaultPatternFromEquipped([
      "v2c_duelist_declaration",
      "v2c_contender_insight",
      "v2c_grandchampion_hour",
    ]).blocks).toEqual([
      {
        condition: {
          kind: "self_buff_pct",
          target: "duelistDeclaration",
          active: false,
        },
        action: { kind: "skill", skillId: "v2c_grandchampion_hour" },
      },
    ]);
  });

  it("사용자 패턴에 하위 선언이 있어도 최고 선언 외에는 제거한다", () => {
    const pattern = effectiveCombatPatternFromEquipped(
      ["v2c_duelist_declaration", "v2c_grandchampion_hour"],
      {
        blocks: [
          { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_duelist_declaration" } },
          { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_grandchampion_hour" } },
        ],
      },
    );
    expect(pattern.blocks).toEqual([
      { condition: { kind: "always" }, action: { kind: "skill", skillId: "v2c_grandchampion_hour" } },
    ]);
  });

  it("중간 선언이 없어도 각 하위 효과를 독립적으로 합성한다", () => {
    expect(composeDuelistDeclaration([
      "v2c_duelist_declaration",
      "v2c_undefeated_momentum",
      "v2c_grandchampion_hour",
    ], "v2c_grandchampion_hour")).toMatchObject({
      declarationName: "챔피언의 시간",
      chainCount: 3,
      remainingBasicHits: 5,
      basicDamagePct: 15,
      basicCritChancePct: 15,
      basicDefPenetrationPct: 0,
      rampPctPerPriorHit: 5,
      landedBasicHits: 0,
      basicCritMultAdd: 0.25,
      basicCritChanceCap: 95,
    });
  });

  it("네 선언을 모두 연결하면 최고 선언의 5회에 모든 효과가 붙는다", () => {
    expect(composeDuelistDeclaration([
      "v2c_duelist_declaration",
      "v2c_contender_insight",
      "v2c_undefeated_momentum",
      "v2c_grandchampion_hour",
    ], "v2c_grandchampion_hour")).toEqual({
      declarationId: "v2c_grandchampion_hour",
      declarationName: "챔피언의 시간",
      chainCount: 4,
      remainingBasicHits: 5,
      basicDamagePct: 15,
      basicCritChancePct: 15,
      basicDefPenetrationPct: 15,
      rampPctPerPriorHit: 5,
      landedBasicHits: 0,
      basicCritMultAdd: 0.25,
      basicCritChanceCap: 95,
    });
  });

  it("평타만 횟수를 소비하고 연속타 단계를 올린다", () => {
    const buff = composeDuelistDeclaration([
      "v2c_undefeated_momentum",
    ], "v2c_undefeated_momentum")!;
    const first = consumeDuelistBasicHit(buff);
    expect(first.modifiers.rampDamagePct).toBe(0);
    expect(first.buff).toMatchObject({ remainingBasicHits: 3, landedBasicHits: 1 });
    const second = consumeDuelistBasicHit(first.buff!);
    expect(second.modifiers.rampDamagePct).toBe(5);
    expect(interruptDuelistRamp(second.buff!)).toMatchObject({
      remainingBasicHits: 2,
      landedBasicHits: 0,
    });
  });
});
