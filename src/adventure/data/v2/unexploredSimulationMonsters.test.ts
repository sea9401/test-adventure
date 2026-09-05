import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_SIMULATION_DIFFICULTIES,
  unexploredBaseProxyMonsters,
  unexploredCommonBaseline,
  unexploredSpecialMonsters,
} from "./unexploredSimulationMonsters";
import { UNEXPLORED_MONSTER_POOLS } from "./unexploredMonsterPools";

describe("unexplored simulation monsters", () => {
  it("extends the five Star Grave combat profiles to the requested difficulty", () => {
    const proxies = unexploredBaseProxyMonsters(90);

    expect(proxies).toHaveLength(5);
    expect(proxies.map((entry) => entry.monsterId)).toEqual([
      "성해의 파수꾼",
      "혜성꼬리 추적자",
      "적색거성의 사제",
      "공허를 먹는 짐승",
      "죽은 별의 관측자",
    ]);
    expect(proxies.map((entry) => entry.monster.hp)).toEqual([
      194_330,
      124_371,
      124_371,
      186_557,
      147_691,
    ]);
    expect(proxies.map((entry) => entry.monster.spd)).toEqual([
      10, 42, 15, 15, 15,
    ]);
    expect(proxies[0].monster).toMatchObject({
      atk: 8_865,
      def: 1_743,
      magicDef: 1_811,
    });
    expect(proxies[1].monster).toMatchObject({
      evasionPct: 30,
      critPct: 30,
    });
    expect(proxies.every((entry) => entry.kind === "base")).toBe(true);
    expect(proxies.every((entry) => entry.difficulty === 90)).toBe(true);
  });

  it("raises every base speed role with unexplored difficulty", () => {
    expect(
      unexploredBaseProxyMonsters(100).map((entry) => entry.monster.spd),
    ).toEqual([17, 71, 27, 27, 27]);
  });

  it("compensates entry difficulties while preserving the accepted 110 anchor", () => {
    expect(unexploredBaseProxyMonsters(95)[0].monster).toMatchObject({
      hp: 397_012,
      atk: 14_710,
      def: 2_142,
      magicDef: 2_226,
      spd: 13,
    });
    expect(
      unexploredSpecialMonsters(95, "stats").find(
        (entry) => entry.monsterId === "armored_shieldman",
      )?.monster,
    ).toMatchObject({
      hp: 349_370,
      atk: 14_710,
      def: 2_754,
      magicDef: 2_365,
      spd: 13,
    });

    expect(unexploredBaseProxyMonsters(100)[0].monster).toMatchObject({
      hp: 494_969,
      atk: 15_769,
      def: 2_370,
      magicDef: 2_461,
      spd: 17,
    });
    expect(
      unexploredSpecialMonsters(100, "stats").find(
        (entry) => entry.monsterId === "armored_shieldman",
      )?.monster,
    ).toMatchObject({
      hp: 435_573,
      atk: 15_769,
      def: 3_047,
      magicDef: 2_615,
      spd: 17,
    });

    expect(unexploredBaseProxyMonsters(105)[0].monster).toMatchObject({
      hp: 617_588,
      atk: 18_253,
      def: 2_463,
      magicDef: 2_560,
      spd: 19,
    });
    expect(
      unexploredSpecialMonsters(105, "stats").find(
        (entry) => entry.monsterId === "armored_shieldman",
      )?.monster,
    ).toMatchObject({
      hp: 543_477,
      atk: 18_253,
      def: 3_167,
      magicDef: 2_720,
      spd: 19,
    });

    expect(unexploredBaseProxyMonsters(110)[0].monster).toMatchObject({
      hp: 868_429,
      atk: 23_600,
      def: 2_640,
      magicDef: 2_742,
      spd: 21,
    });
    expect(
      unexploredSpecialMonsters(110, "stats").find(
        (entry) => entry.monsterId === "armored_shieldman",
      )?.monster,
    ).toMatchObject({
      hp: 764_217,
      atk: 23_600,
      def: 3_394,
      magicDef: 2_913,
      spd: 21,
    });
  });

  it("keeps raising every numerical axis across all difficulty anchors", () => {
    for (const monsterId of ["성해의 파수꾼", "armored_shieldman"]) {
      const atDifficulty = (
        difficulty: (typeof UNEXPLORED_SIMULATION_DIFFICULTIES)[number],
      ) =>
        [
          ...unexploredBaseProxyMonsters(difficulty),
          ...unexploredSpecialMonsters(difficulty, "mechanics"),
        ].find((entry) => entry.monsterId === monsterId)?.monster;
      const monsters = UNEXPLORED_SIMULATION_DIFFICULTIES.map(atDifficulty);

      expect(monsters.every(Boolean), monsterId).toBe(true);
      for (let index = 1; index < monsters.length; index += 1) {
        const previous = monsters[index - 1];
        const current = monsters[index];
        expect(current?.hp, monsterId).toBeGreaterThan(previous?.hp ?? Infinity);
        expect(current?.atk, monsterId).toBeGreaterThan(
          previous?.atk ?? Infinity,
        );
        expect(current?.def, monsterId).toBeGreaterThan(
          previous?.def ?? Infinity,
        );
        expect(current?.magicDef, monsterId).toBeGreaterThan(
          previous?.magicDef ?? Infinity,
        );
      }
    }
  });

  it("uses the median Star Grave profile for every special monster", () => {
    expect(unexploredCommonBaseline(90)).toEqual({
      hp: 155_464,
      atk: 9_749,
      def: 1_245,
      magicDef: 2_264,
      spd: 9,
      accuracy: 391.88708338356605,
      magicPenetration: 486.1760117114877,
    });

    const shieldman = unexploredSpecialMonsters(90, "stats").find(
      (entry) => entry.monsterId === "armored_shieldman",
    );
    expect(shieldman?.monster).toMatchObject({
      hp: 171_010,
      atk: 8_865,
      def: 2_241,
      magicDef: 1_924,
      spd: 10,
      accuracy: 391.88708338356605,
      magicPenetration: 486.1760117114877,
      exp: 0,
    });
    expect(shieldman?.monster.skill).toBeUndefined();
    expect(shieldman?.monster.v2Skills).toBeUndefined();
  });

  it("keeps stat-only profiles free of semantic combat mechanics", () => {
    for (const entry of unexploredSpecialMonsters(90, "stats")) {
      expect(entry.monster.skill, entry.monsterId).toBeUndefined();
      expect(entry.monster.v2Skills, entry.monsterId).toBeUndefined();
      expect(entry.monster.atkType, entry.monsterId).toBeUndefined();
      expect(entry.monster.critPct, entry.monsterId).toBeUndefined();
      expect(entry.monster.evasionPct, entry.monsterId).toBeUndefined();
      expect(
        entry.monster.statusDamageReductionPct,
        entry.monsterId,
      ).toBeUndefined();
      expect(entry.monster.bonusAttackChancePct, entry.monsterId).toBeUndefined();
      expect(entry.monster.directActionSpd, entry.monsterId).toBeUndefined();
    }
  });

  it("keeps every generated monster on the normal monster speed path", () => {
    for (const difficulty of UNEXPLORED_SIMULATION_DIFFICULTIES) {
      const monsters = [
        ...unexploredBaseProxyMonsters(difficulty),
        ...unexploredSpecialMonsters(difficulty, "mechanics"),
      ];
      expect(monsters).toHaveLength(41);
      expect(
        monsters.every((entry) => entry.monster.directActionSpd == null),
      ).toBe(true);
    }
  });

  it("adapts every approved semantic ability to existing engine fields", () => {
    const mechanics = unexploredSpecialMonsters(90, "mechanics");
    const byId = Object.fromEntries(
      mechanics.map((entry) => [entry.monsterId, entry]),
    );

    expect(mechanics).toHaveLength(36);
    expect(
      UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
        pool.monsters.flatMap((monster) => monster.abilities),
      ).length,
    ).toBe(36);
    expect(byId.armored_shieldman.monster.skill?.kind).toBe("brace");
    expect(byId.rune_executor.monster.atkType).toBe("magic");
    expect(byId.proliferating_core.monster.v2Skills?.equipped).toContain(
      "v2_skill_recover",
    );
    expect(byId.proliferating_core.monster.v2MaxMp).toBe(32);
    expect(byId.red_berserker.monster.skill).toMatchObject({
      kind: "enrage",
      hpFraction: 0.4,
      atkBonus: Math.round(byId.red_berserker.monster.atk * 0.2),
    });
    expect(byId.blood_duelist.monster.critPct).toBe(38);
    expect(byId.red_executioner.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(byId.crystal_mage.monster).toMatchObject({ atkType: "magic" });
    expect(byId.crystal_mage.monster.v2Skills?.equipped).toContain(
      "mob_arcane_bolt",
    );
    expect(byId.refraction_artillery.monster).toMatchObject({
      atkType: "magic",
    });
    expect(byId.refraction_artillery.monster.v2Skills?.equipped).toContain(
      "mob_arcane_burst",
    );
    expect(byId.crystal_sentinel.monster).toMatchObject({
      atkType: "magic",
      v2MaxMp: 70,
    });
    expect(byId.crystal_sentinel.monster.v2Skills?.equipped).toContain(
      "mob_arcane_nova",
    );
    const accuracy = unexploredCommonBaseline(90).accuracy;
    expect(byId.precision_scout.monster.accuracy).toBe(accuracy + 20);
    expect(byId.lethal_sniper.monster).toMatchObject({
      accuracy: accuracy + 30,
      critPct: 38,
    });
    expect(byId.armor_hunter.monster.accuracy).toBe(accuracy + 30);
    expect(byId.armor_hunter.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(byId.barrier_guardian.monster.statusDamageReductionPct).toBe(20);
    expect(byId.seal_watcher.monster.statusDamageReductionPct).toBe(40);
    expect(byId.rushing_machine.monster.bonusAttackChancePct).toBeUndefined();
    expect(byId.combo_automaton.monster.bonusAttackChancePct).toBe(50);
    expect(byId.overheated_enforcer.monster.bonusAttackChancePct).toBe(50);
    expect(byId.overheated_enforcer.monster.skill).toMatchObject({
      kind: "enrage",
      hpFraction: 0.4,
      atkBonus: Math.round(byId.overheated_enforcer.monster.atk * 0.2),
    });
    expect(byId.shadow_scout.monster.evasionPct).toBe(35);
    expect(byId.night_assassin.monster).toMatchObject({
      evasionPct: 45,
      critPct: 38,
    });
    expect(byId.phantom_stalker.monster.evasionPct).toBe(50);
    expect(byId.phantom_stalker.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(byId.venom_fang_devourer.monster.v2Skills?.equipped).toEqual([
      "mob_venom_bite",
    ]);
    expect(byId.venom_sprayer.monster.v2Skills?.equipped).toEqual([
      "mob_catastrophe_venom",
    ]);
    expect(byId.corrosive_colony.monster.v2Skills?.equipped).toEqual([
      "mob_venom_sunder",
    ]);
    expect(byId.hooked_dead.monster.v2Skills?.equipped).toEqual([
      "mob_rending_claw",
    ]);
    expect(byId.bloodtrail_pursuer.monster.v2Skills?.equipped).toEqual([
      "mob_rending_claw",
    ]);
    expect(byId.severing_executioner.monster.v2Skills?.equipped).toEqual([
      "mob_rending_claw",
    ]);
    expect(byId.severing_executioner.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(byId.frost_toucher.monster.v2Skills?.equipped).toEqual([
      "mob_chilling_touch",
    ]);
    expect(byId.freezing_mage.monster).toMatchObject({ atkType: "magic" });
    expect(byId.freezing_mage.monster.v2Skills?.equipped).toEqual([
      "mob_deep_chill",
      "mob_arcane_bolt",
    ]);
    expect(byId.frozen_sentinel.monster).toMatchObject({
      atkType: "magic",
      v2MaxMp: 70,
    });
    expect(byId.frozen_sentinel.monster.v2Skills?.equipped).toEqual([
      "mob_glacial_chill",
      "mob_arcane_nova",
    ]);
    expect(byId.bedrock_colossus.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(byId.ironwall_crusher.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(byId.crust_destroyer.monster.v2Skills?.equipped).toEqual([
      "mob_crushing_blow",
    ]);
    expect(byId.crust_destroyer.monster.v2MaxMp).toBe(60);
  });
});
