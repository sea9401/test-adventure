import type { V2CombatPattern } from "./combatPattern";
import type { Monster } from "@/adventure/data/monsters";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import { describe, expect, it, vi } from "vitest";
import {
  advanceTurn,
  applyEnemyV2SkillCast,
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";

function player(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 2_000,
    maxHp: 2_000,
    maxMp: 1_000,
    mp: 1_000,
    atk: 1,
    def: 0,
    magicDef: 0,
    spd: 1,
    accuracyPct: 100,
    evasionPct: 0,
    attackCount: 1,
    ...over,
  };
}

function enemy(over: Partial<Monster> = {}): Monster {
  return {
    name: "결계 시험체",
    tags: ["spirit"],
    hp: 99_999,
    atk: 200,
    def: 0,
    spd: 99,
    exp: 1,
    ...over,
  };
}

const GRANDWARDER = {
  learned: ["v2c_grandwarder_tripleward" as const],
  equipped: ["v2c_grandwarder_tripleward" as const],
};

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

describe("삼중 결계 PvE", () => {
  it("전투 시작 시 장착한 패시브 단계의 결계를 전개한다", () => {
    expect(
      initialBattleState(player(), enemy(), "봉인자", GRANDWARDER).stacks
        .tripleWard,
    ).toMatchObject({ rank: 1, physical: 1, magic: 1, purification: 1 });
    expect(
      initialBattleState(player(), enemy(), "봉인자", LAWGUARDIAN).stacks
        .tripleWard,
    ).toMatchObject({ rank: 2, physical: 3, magic: 3, purification: 3 });
  });

  it("직접 물리 피해를 1회 줄이고 금강결계와 영역 안정을 갱신한다", () => {
    const combatant = player();
    const start = initialBattleState(combatant, enemy(), "봉인자", LAWGUARDIAN);
    const after = advanceTurn(start, combatant, "봉인자");

    expect(start.playerHp - after.playerHp).toBe(80);
    expect(after.stacks.tripleWard).toMatchObject({
      physical: 2,
      magic: 3,
      stabilityStacks: 1,
    });
    expect(after.log.some((entry) => entry.text.includes("[금강결계]"))).toBe(true);
  });

  it("마법형 직접 피해에는 봉마결계를 소비한다", () => {
    const combatant = player();
    const start = initialBattleState(
      combatant,
      enemy({ atkType: "magic" }),
      "봉인자",
      GRANDWARDER,
    );
    const after = advanceTurn(start, combatant, "봉인자");

    expect(start.playerHp - after.playerHp).toBe(110);
    expect(after.stacks.tripleWard).toMatchObject({ physical: 1, magic: 0 });
    expect(after.log.some((entry) => entry.text.includes("[봉마결계]"))).toBe(true);
  });

  it("장비 상태 방어를 정화결계보다 먼저 소비한다", () => {
    const signature: SignatureEffect = {
      trigger: "status_block_once",
      label: "성역 정화",
      statusBlockOnce: true,
    };
    const combatant = player({ equipSignatures: [signature] });
    const chilling = enemy({
      skill: {
        kind: "chill",
        name: "시험 한기",
        perHit: 2,
        dmgPerStack: 1,
        threshold: 99,
      },
    });
    const first = advanceTurn(
      initialBattleState(combatant, chilling, "봉인자", GRANDWARDER),
      combatant,
      "봉인자",
    );

    expect(first.flags.statusBlockUsed).toBe(true);
    expect(first.stacks.tripleWard.purification).toBe(1);
    expect(first.stacks.chillStacks).toBe(0);

    const second = advanceTurn(
      { ...first, phase: "enemy" },
      combatant,
      "봉인자",
    );
    expect(second.stacks.tripleWard.purification).toBe(0);
    expect(second.stacks.chillStacks).toBe(0);
    expect(second.log.some((entry) => entry.text.includes("[정화결계]"))).toBe(true);
  });

  it("만법불침 시전은 소모된 결계를 최대치로 갱신한다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const combatant = player();
      const start = initialBattleState(combatant, enemy(), "봉인자", LAWGUARDIAN);
      const depleted = {
        ...start,
        playerHp: 1_000,
        phase: "player" as const,
        stacks: {
          ...start.stacks,
          tripleWard: {
            ...start.stacks.tripleWard,
            physical: 0,
            magic: 1,
            purification: 2,
          },
        },
      };
      const cast = applyPlayerV2SkillCast(
        depleted,
        combatant,
        { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} },
        "봉인자",
      );

      expect(cast.castFired).toBe(true);
      expect(cast.state.stacks.tripleWard).toMatchObject({
        physical: 3,
        magic: 3,
        purification: 3,
      });
      expect(
        cast.state.log.some((entry) => entry.text.includes("삼중 결계 3회 재전개")),
      ).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("몬스터의 직접 마법 스킬에도 봉마결계를 적용한다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const combatant = player();
      const caster = enemy({
        v2Skills: {
          learned: ["mob_arcane_bolt"],
          equipped: ["mob_arcane_bolt"],
        },
        v2MaxMp: 999,
      });
      const start = initialBattleState(
        combatant,
        caster,
        "봉인자",
        LAWGUARDIAN,
      );
      const cast = applyEnemyV2SkillCast(start, combatant);

      expect(cast.castFired).toBe(true);
      expect(cast.state.stacks.tripleWard).toMatchObject({
        physical: 3,
        magic: 2,
        stabilityStacks: 1,
      });
      expect(cast.state.log.some((entry) => entry.text.includes("[봉마결계]"))).toBe(true);
    } finally {
      random.mockRestore();
    }
  });

  it("몬스터 상태 스킬은 정화결계가 막는다", () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const combatant = player();
      const caster = enemy({
        v2Skills: {
          learned: ["mob_venom_bite"],
          equipped: ["mob_venom_bite"],
        },
        v2MaxMp: 999,
      });
      const start = initialBattleState(
        combatant,
        caster,
        "봉인자",
        LAWGUARDIAN,
      );
      const cast = applyEnemyV2SkillCast(start, combatant);

      expect(cast.castFired).toBe(true);
      expect(cast.state.playerV2Dots).toEqual([]);
      expect(cast.state.stacks.tripleWard).toMatchObject({
        purification: 2,
        stabilityStacks: 1,
      });
      expect(cast.state.log.some((entry) => entry.text.includes("[정화결계]"))).toBe(true);
    } finally {
      random.mockRestore();
    }
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

describe("결계 소진 패턴 PvE", () => {
  it.each(["physical", "magic", "purification"] as const)("%s가 소진될 때만 재전개한다", (ward) => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0);
    try {
      const combatant = player();
      const start = initialBattleState(combatant, enemy(), "봉인자", {
        ...LAWGUARDIAN, pattern: WARD_PATTERN,
      });
      const cast = (state: typeof start) => applyPlayerV2SkillCast(
        state, combatant, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }, "봉인자",
      );
      expect(cast(start).castFired).toBe(false);
      const depleted = { ...start, stacks: { ...start.stacks,
        tripleWard: { ...start.stacks.tripleWard, [ward]: 0 },
      } };
      const refreshed = cast(depleted);
      expect(refreshed.castFired).toBe(true);
      expect(refreshed.state.stacks.tripleWard).toMatchObject({ physical: 3, magic: 3, purification: 3 });
      expect(cast({ ...start, stacks: refreshed.state.stacks }).castFired).toBe(false);
    } finally { random.mockRestore(); }
  });
});
