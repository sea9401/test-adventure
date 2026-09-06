import type { V2CombatPattern } from "./combatPattern";
import { describe, expect, it, vi } from "vitest";
import {
  advanceTurnPvP,
  applyPvPOnHitDots,
  castV2SkillOnAttackerTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import type { PlayerCombat } from "./engine";

function combatant(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 5_000,
    maxHp: 5_000,
    maxMp: 1_000,
    mp: 1_000,
    atk: 200,
    magicAtk: 200,
    def: 0,
    magicDef: 0,
    spd: 10,
    accuracyPct: 100,
    accRating: 1_000,
    evasionPct: 0,
    evaRating: 0,
    attackCount: 1,
    ...over,
  };
}

const LAWGUARDIAN = {
  learned: [
    "v2c_lawguardian_inviolable" as const,
    "v2c_lawguardian_domain" as const,
  ],
  equipped: [
    "v2c_lawguardian_inviolable" as const,
    "v2c_lawguardian_domain" as const,
  ],
};

describe("삼중 결계 PvP", () => {
  it("양쪽이 장착한 단계대로 독립된 결계 상태를 시작한다", () => {
    const state = initialBattleStatePvP(
      combatant(),
      combatant(),
      "공격자",
      "수호자",
      { learned: [], equipped: [] },
      LAWGUARDIAN,
    );

    expect(state.p1.stacks.tripleWard.rank).toBe(0);
    expect(state.p2.stacks.tripleWard).toMatchObject({
      rank: 2,
      physical: 3,
      magic: 3,
      purification: 3,
    });
  });

  it("기본 물리 공격의 첫 피해를 40% 줄이고 금강결계를 소비한다", () => {
    const start = initialBattleStatePvP(
      combatant({ spd: 100 }),
      combatant({ spd: 1 }),
      "공격자",
      "수호자",
      { learned: [], equipped: [] },
      LAWGUARDIAN,
    );
    const after = advanceTurnPvP(start);

    expect(start.p2.hp - after.p2.hp).toBe(120);
    expect(after.p2.stacks.tripleWard).toMatchObject({
      physical: 2,
      magic: 3,
      stabilityStacks: 1,
    });
    expect(after.log.some((entry) => entry.text.includes("[금강결계]"))).toBe(true);
  });

  it("마법 평타는 봉마결계를 소비한다", () => {
    const start = initialBattleStatePvP(
      combatant({ spd: 100, passiveMagicBasicAttack: true, magicAtk: 300 }),
      combatant({ spd: 1 }),
      "공격자",
      "수호자",
      { learned: [], equipped: [] },
      LAWGUARDIAN,
    );
    const after = advanceTurnPvP(start);

    expect(after.p2.stacks.tripleWard).toMatchObject({ physical: 3, magic: 2 });
    expect(after.log.some((entry) => entry.text.includes("[봉마결계]"))).toBe(true);
  });

  it("만법불침은 시전자 자신의 삼중 결계를 3회로 갱신한다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const start = initialBattleStatePvP(
        combatant({ spd: 100, hp: 2_000 }),
        combatant({ spd: 1 }),
        "수호자",
        "상대",
        LAWGUARDIAN,
      );
      const depleted = {
        ...start,
        p1: {
          ...start.p1,
          stacks: {
            ...start.p1.stacks,
            tripleWard: {
              ...start.p1.stacks.tripleWard,
              physical: 0,
              magic: 1,
              purification: 2,
            },
          },
        },
      };
      const cast = castV2SkillOnAttackerTurnPvP(depleted, "p1");

      expect(cast.castFired).toBe(true);
      expect(cast.state.p1.stacks.tripleWard).toMatchObject({
        physical: 3,
        magic: 3,
        purification: 3,
      });
    } finally {
      random.mockRestore();
    }
  });

  it("직접 마법 스킬은 봉마결계를 한 번만 소비한다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const start = initialBattleStatePvP(
        combatant({ spd: 100, intStat: 100 }),
        combatant({ spd: 1 }),
        "마법사",
        "수호자",
        {
          learned: ["v2c_mage_barrage"],
          equipped: ["v2c_mage_barrage"],
        },
        LAWGUARDIAN,
      );
      const cast = castV2SkillOnAttackerTurnPvP(start, "p1");

      expect(cast.castFired).toBe(true);
      expect(cast.state.p2.stacks.tripleWard).toMatchObject({
        physical: 3,
        magic: 2,
        stabilityStacks: 1,
      });
      expect(cast.state.log.some((entry) => entry.text.includes("[봉마결계]"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("적대 상태 스킬은 정화결계로 막고 다른 결계는 유지한다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const start = initialBattleStatePvP(
        combatant({ spd: 100 }),
        combatant({ spd: 1 }),
        "시전자",
        "수호자",
        {
          learned: ["mob_venom_bite"],
          equipped: ["mob_venom_bite"],
        },
        LAWGUARDIAN,
      );
      const cast = castV2SkillOnAttackerTurnPvP(start, "p1");

      expect(cast.castFired).toBe(true);
      expect(cast.state.p2.v2Dots).toEqual([]);
      expect(cast.state.p2.stacks.tripleWard).toMatchObject({
        physical: 3,
        magic: 3,
        purification: 2,
        stabilityStacks: 1,
      });
      expect(cast.state.log.some((entry) => entry.text.includes("[정화결계]"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("한 행동의 상태이상을 이미 막았으면 같은 행동의 적중 독이 결계를 추가 소비하지 않는다", () => {
    const start = initialBattleStatePvP(
      combatant({ poisonOnHit: { pctMaxHpPerStack: 1 } }),
      combatant(),
      "공격자",
      "수호자",
      { learned: [], equipped: [] },
      LAWGUARDIAN,
    );
    const defender = {
      ...start.p2,
      stacks: {
        ...start.p2.stacks,
        tripleWard: { ...start.p2.stacks.tripleWard, purification: 2 },
      },
    };

    const after = applyPvPOnHitDots(defender, start.p1, {
      bleedStacks: 1,
      blockStatus: true,
    });

    expect(after.v2Dots).toEqual([]);
    expect(after.stacks.tripleWard.purification).toBe(2);
  });
});

const WARD_PATTERN: V2CombatPattern = {
  blocks: [{
    condition: {
      kind: "any",
      conditions: (["physicalWard", "magicWard", "purificationWard"] as const).map((resource) => ({
        kind: "self_resource", resource, op: "none", value: 0,
      })),
    },
    action: { kind: "skill", skillId: "v2c_lawguardian_inviolable" },
  }],
};

describe("결계 소진 패턴 PvP", () => {
  it.each(["p1", "p2"] as const)("%s 자신의 결계만 검사한다", (side) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const skills = { ...LAWGUARDIAN, pattern: WARD_PATTERN };
      const start = initialBattleStatePvP(combatant(), combatant(), "수호자1", "수호자2", skills, skills);
      const other = side === "p1" ? "p2" : "p1";
      expect(castV2SkillOnAttackerTurnPvP(start, side).castFired).toBe(false);
      for (const ward of ["physical", "magic", "purification"] as const) {
        const depleted = { ...start, [side]: { ...start[side], stacks: {
          ...start[side].stacks, tripleWard: { ...start[side].stacks.tripleWard, [ward]: 0 },
        } } };
        expect(castV2SkillOnAttackerTurnPvP(depleted, other).castFired).toBe(false);
        const refreshed = castV2SkillOnAttackerTurnPvP(depleted, side);
        expect(refreshed.castFired).toBe(true);
        expect(refreshed.state[side].stacks.tripleWard).toMatchObject({ physical: 3, magic: 3, purification: 3 });
        expect(refreshed.state[other].stacks.tripleWard).toEqual(start[other].stacks.tripleWard);
      }
    } finally { random.mockRestore(); }
  });
});
