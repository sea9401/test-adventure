import { describe, expect, it } from "vitest";
import {
  UNEXPLORED_MONSTER_POOLS,
  type UnexploredPoolId,
} from "./unexploredMonsterPools";
import { unexploredResourceGrowthCompensation } from "./unexploredSimulationBalance";
import {
  UNEXPLORED_BASE_MONSTER_IDS,
  unexploredActiveSpecialMonstersAtDifficulty,
  unexploredBaseMonstersAtDifficulty,
  unexploredMonsterAtDifficulty,
} from "./unexploredMonsters";

describe("unexplored runtime monsters", () => {
  it("exposes five base monsters and every active special monster", () => {
    const base = unexploredBaseMonstersAtDifficulty(95);
    const special = unexploredActiveSpecialMonstersAtDifficulty(95, []);

    expect(base).toHaveLength(5);
    expect(special).toHaveLength(36);
    expect(new Set([...base, ...special].map((entry) => entry.monsterId)).size).toBe(41);
    expect(base.map((entry) => entry.monsterId)).toEqual(UNEXPLORED_BASE_MONSTER_IDS);
    expect(special.map((entry) => entry.monsterId)).toEqual(
      UNEXPLORED_MONSTER_POOLS.flatMap((pool) =>
        pool.activeMonsters.map((monster) => monster.id),
      ),
    );
    for (const entry of [...base, ...special]) {
      expect(entry.monster.image).toBe(
        `/images/monster/v2/${entry.imageFileName}`,
      );
      expect(entry.monster.exp).toBeGreaterThan(0);
    }
  });

  it("keeps every integer difficulty from 95 through 120 finite and continuous", () => {
    let previous = unexploredBaseMonstersAtDifficulty(95)[0].monster;
    for (let difficulty = 95; difficulty <= 120; difficulty += 1) {
      const monsters = [
        ...unexploredBaseMonstersAtDifficulty(difficulty),
        ...unexploredActiveSpecialMonstersAtDifficulty(difficulty, []),
      ];
      expect(monsters).toHaveLength(41);
      for (const { monster, monsterId } of monsters) {
        for (const stat of ["hp", "atk", "def", "magicDef", "spd"] as const) {
          expect(Number.isFinite(monster[stat]), `${monsterId}:${difficulty}:${stat}`).toBe(true);
          expect(monster[stat] ?? 0, `${monsterId}:${difficulty}:${stat}`).toBeGreaterThan(0);
        }
      }
      const current = monsters[0].monster;
      if (difficulty > 95) {
        expect(current.hp).toBeGreaterThan(previous.hp);
        expect(current.atk).toBeGreaterThanOrEqual(previous.atk);
        expect(current.def).toBeGreaterThanOrEqual(previous.def);
        expect(current.magicDef).toBeGreaterThanOrEqual(previous.magicDef ?? 0);
        expect(current.spd).toBeGreaterThanOrEqual(previous.spd);
      }
      previous = current;
    }
  });

  it("routes active iron legion variants to their combat profiles and images", () => {
    const spearman = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_spearman",
      focused: false,
      difficulty: 100,
    });
    const crusher = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "iron_legion",
      monsterId: "armored_crusher",
      focused: false,
      difficulty: 100,
    });

    expect(spearman.monsterId).toBe("armored_spearman");
    expect(spearman.imageFileName).toBe("unexplored-armored-spearman.webp");
    expect(spearman.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "iron_legion",
        monsterId: "armored_spearman",
        focused: true,
        difficulty: 100,
      }).monster.def,
    ).toBeGreaterThan(spearman.monster.def);
    expect(crusher.monsterId).toBe("armored_crusher");
    expect(crusher.imageFileName).toBe("unexplored-armored-crusher.webp");
    expect(crusher.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
  });

  it("routes active mana barrier variants to combat, focus, and images", () => {
    const runeExecutor = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "mana_barrier",
      monsterId: "rune_executor",
      focused: false,
      difficulty: 100,
    });
    const focusedRuneExecutor = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "mana_barrier",
      monsterId: "rune_executor",
      focused: true,
      difficulty: 100,
    });
    const sealWatcher = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "mana_barrier",
      monsterId: "seal_watcher",
      focused: false,
      difficulty: 100,
    });
    const focusedSealWatcher = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "mana_barrier",
      monsterId: "seal_watcher",
      focused: true,
      difficulty: 100,
    });

    expect(runeExecutor.imageFileName).toBe("unexplored-rune-executor.webp");
    expect(runeExecutor.monster.atkType).toBe("magic");
    expect(runeExecutor.monster.statusDamageReductionPct).toBeUndefined();
    expect(runeExecutor.monster.v2Skills?.equipped).toContain(
      "mob_arcane_bolt",
    );
    expect(focusedRuneExecutor.monster.magicDef).toBeGreaterThan(
      runeExecutor.monster.magicDef ?? 0,
    );
    expect(focusedRuneExecutor.monster.statusDamageReductionPct).toBe(10);

    expect(sealWatcher.imageFileName).toBe("unexplored-seal-watcher.webp");
    expect(sealWatcher.monster.statusDamageReductionPct).toBe(40);
    expect(sealWatcher.monster.skill).toMatchObject({
      kind: "brace",
      damageReduction: 6,
    });
    expect(focusedSealWatcher.monster.magicDef).toBeGreaterThan(
      sealWatcher.monster.magicDef ?? 0,
    );
    expect(focusedSealWatcher.monster.statusDamageReductionPct).toBe(50);
  });

  it("routes active regenerating swarm variants to recovery, focus, and images", () => {
    const devouringRegenerator = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "regenerating_swarm",
      monsterId: "devouring_regenerator",
      focused: false,
      difficulty: 100,
    });
    const focusedDevouringRegenerator = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "regenerating_swarm",
      monsterId: "devouring_regenerator",
      focused: true,
      difficulty: 100,
    });
    const proliferatingCore = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "regenerating_swarm",
      monsterId: "proliferating_core",
      focused: false,
      difficulty: 100,
    });
    const focusedProliferatingCore = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "regenerating_swarm",
      monsterId: "proliferating_core",
      focused: true,
      difficulty: 100,
    });

    expect(devouringRegenerator.imageFileName).toBe(
      "unexplored-devouring-regenerator.webp",
    );
    expect(devouringRegenerator.monster.v2Skills?.equipped).toContain(
      "v2_skill_recover",
    );
    expect(devouringRegenerator.monster.v2MaxMp).toBe(16);
    expect(focusedDevouringRegenerator.monster.hp).toBeGreaterThan(
      devouringRegenerator.monster.hp,
    );
    expect(focusedDevouringRegenerator.monster.v2MaxMp).toBe(32);

    expect(proliferatingCore.imageFileName).toBe(
      "unexplored-proliferating-core.webp",
    );
    expect(proliferatingCore.monster.v2Skills?.equipped).toContain(
      "v2_skill_recover",
    );
    expect(proliferatingCore.monster.v2MaxMp).toBe(32);
    expect(focusedProliferatingCore.monster.hp).toBeGreaterThan(
      proliferatingCore.monster.hp,
    );
    expect(focusedProliferatingCore.monster.v2MaxMp).toBe(64);
  });

  it("routes active red berserkers to enrage, critical, heavy blow, focus, and images", () => {
    const redBerserker = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "red_berserker",
      focused: false,
      difficulty: 100,
    });
    const bloodDuelist = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "blood_duelist",
      focused: false,
      difficulty: 100,
    });
    const focusedBloodDuelist = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "blood_duelist",
      focused: true,
      difficulty: 100,
    });
    const redExecutioner = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "red_executioner",
      focused: false,
      difficulty: 100,
    });
    const focusedRedExecutioner = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "red_berserkers",
      monsterId: "red_executioner",
      focused: true,
      difficulty: 100,
    });

    expect(redBerserker.monster.skill).toMatchObject({
      kind: "enrage",
      hpFraction: 0.4,
      atkBonus: Math.round(redBerserker.monster.atk * 0.2),
    });

    expect(bloodDuelist.imageFileName).toBe("unexplored-blood-duelist.webp");
    expect(bloodDuelist.monster.critPct).toBe(38);
    expect(focusedBloodDuelist.monster.atk).toBeGreaterThan(
      bloodDuelist.monster.atk,
    );
    expect(focusedBloodDuelist.monster.critPct).toBe(48);

    expect(redExecutioner.imageFileName).toBe(
      "unexplored-red-executioner.webp",
    );
    expect(redExecutioner.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(focusedRedExecutioner.monster.atk).toBeGreaterThan(
      redExecutioner.monster.atk,
    );
    expect(focusedRedExecutioner.monster.critPct).toBe(10);
  });

  it("routes active crystal artillery to magic skills, focus, limited casts, and images", () => {
    const refractionArtillery = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "crystal_artillery",
      monsterId: "refraction_artillery",
      focused: false,
      difficulty: 100,
    });
    const focusedRefractionArtillery = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "crystal_artillery",
      monsterId: "refraction_artillery",
      focused: true,
      difficulty: 100,
    });
    const crystalSentinel = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "crystal_artillery",
      monsterId: "crystal_sentinel",
      focused: false,
      difficulty: 100,
    });
    const focusedCrystalSentinel = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "crystal_artillery",
      monsterId: "crystal_sentinel",
      focused: true,
      difficulty: 100,
    });

    expect(refractionArtillery.imageFileName).toBe(
      "unexplored-refraction-artillery.webp",
    );
    expect(refractionArtillery.monster.atkType).toBe("magic");
    expect(refractionArtillery.monster.v2Skills?.equipped).toEqual([
      "mob_arcane_burst",
    ]);
    expect(focusedRefractionArtillery.monster.atk).toBeGreaterThan(
      refractionArtillery.monster.atk,
    );

    expect(crystalSentinel.imageFileName).toBe(
      "unexplored-crystal-sentinel.webp",
    );
    expect(crystalSentinel.monster.atkType).toBe("magic");
    expect(crystalSentinel.monster.v2Skills?.equipped).toEqual([
      "mob_arcane_nova",
    ]);
    expect(crystalSentinel.monster.v2MaxMp).toBe(70);
    expect(focusedCrystalSentinel.monster.atk).toBeGreaterThan(
      crystalSentinel.monster.atk,
    );
    expect(focusedCrystalSentinel.monster.v2MaxMp).toBe(140);
  });

  it("routes active precision hunters to accuracy, critical, piercing, focus, and images", () => {
    const lethalSniper = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "precision_hunters",
      monsterId: "lethal_sniper",
      focused: false,
      difficulty: 100,
    });
    const focusedLethalSniper = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "precision_hunters",
      monsterId: "lethal_sniper",
      focused: true,
      difficulty: 100,
    });
    const armorHunter = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "precision_hunters",
      monsterId: "armor_hunter",
      focused: false,
      difficulty: 100,
    });
    const focusedArmorHunter = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "precision_hunters",
      monsterId: "armor_hunter",
      focused: true,
      difficulty: 100,
    });

    expect(lethalSniper.imageFileName).toBe("unexplored-lethal-sniper.webp");
    expect(lethalSniper.monster.critPct).toBe(38);
    expect(focusedLethalSniper.monster.accuracy).toBe(
      (lethalSniper.monster.accuracy ?? 0) + 15,
    );
    expect(focusedLethalSniper.monster.critPct).toBe(46);
    expect(focusedLethalSniper.monster.playerDefVulnerable).toBe(0.05);

    expect(armorHunter.imageFileName).toBe("unexplored-armor-hunter.webp");
    expect(armorHunter.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(focusedArmorHunter.monster.accuracy).toBe(
      (armorHunter.monster.accuracy ?? 0) + 15,
    );
    expect(focusedArmorHunter.monster.critPct).toBe(8);
    expect(focusedArmorHunter.monster.playerDefVulnerable).toBe(0.05);
    expect(focusedArmorHunter.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
  });

  it("routes active runaway machines to bonus attacks, enrage, focus, and images", () => {
    const comboAutomaton = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "runaway_machines",
      monsterId: "combo_automaton",
      focused: false,
      difficulty: 100,
    });
    const focusedComboAutomaton = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "runaway_machines",
      monsterId: "combo_automaton",
      focused: true,
      difficulty: 100,
    });
    const overheatedEnforcer = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "runaway_machines",
      monsterId: "overheated_enforcer",
      focused: false,
      difficulty: 100,
    });
    const focusedOverheatedEnforcer = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "runaway_machines",
      monsterId: "overheated_enforcer",
      focused: true,
      difficulty: 100,
    });

    expect(comboAutomaton.imageFileName).toBe(
      "unexplored-combo-automaton.webp",
    );
    expect(comboAutomaton.monster.bonusAttackChancePct).toBe(50);
    expect(focusedComboAutomaton.monster.spd).toBe(
      Math.round(comboAutomaton.monster.spd * 1.1),
    );
    expect(focusedComboAutomaton.monster.bonusAttackChancePct).toBe(65);

    expect(overheatedEnforcer.imageFileName).toBe(
      "unexplored-overheated-enforcer.webp",
    );
    expect(overheatedEnforcer.monster.bonusAttackChancePct).toBe(50);
    expect(overheatedEnforcer.monster.skill).toMatchObject({
      kind: "enrage",
      hpFraction: 0.4,
      atkBonus: Math.round(overheatedEnforcer.monster.atk * 0.2),
    });
    expect(focusedOverheatedEnforcer.monster.spd).toBe(
      Math.round(overheatedEnforcer.monster.spd * 1.1),
    );
    expect(focusedOverheatedEnforcer.monster.bonusAttackChancePct).toBe(65);
    expect(focusedOverheatedEnforcer.monster.skill).toEqual(
      overheatedEnforcer.monster.skill,
    );
  });

  it("routes active shadow stalkers to evasion, critical, piercing, focus, and images", () => {
    const nightAssassin = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "shadow_stalkers",
      monsterId: "night_assassin",
      focused: false,
      difficulty: 100,
    });
    const focusedNightAssassin = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "shadow_stalkers",
      monsterId: "night_assassin",
      focused: true,
      difficulty: 100,
    });
    const phantomStalker = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "shadow_stalkers",
      monsterId: "phantom_stalker",
      focused: false,
      difficulty: 100,
    });
    const focusedPhantomStalker = unexploredMonsterAtDifficulty({
      source: "special",
      poolId: "shadow_stalkers",
      monsterId: "phantom_stalker",
      focused: true,
      difficulty: 100,
    });

    expect(nightAssassin.imageFileName).toBe(
      "unexplored-night-assassin.webp",
    );
    expect(nightAssassin.monster).toMatchObject({
      evasionPct: 45,
      critPct: 38,
    });
    expect(focusedNightAssassin.monster.spd).toBe(
      Math.round(nightAssassin.monster.spd * 1.1),
    );
    expect(focusedNightAssassin.monster).toMatchObject({
      evasionPct: 55,
      critPct: 38,
    });

    expect(phantomStalker.imageFileName).toBe(
      "unexplored-phantom-stalker.webp",
    );
    expect(phantomStalker.monster.evasionPct).toBe(50);
    expect(phantomStalker.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(focusedPhantomStalker.monster.spd).toBe(
      Math.round(phantomStalker.monster.spd * 1.1),
    );
    expect(focusedPhantomStalker.monster.evasionPct).toBe(60);
    expect(focusedPhantomStalker.monster.skill).toEqual(
      phantomStalker.monster.skill,
    );
  });

  it("routes active venom colony monsters to poison skills, focus, and images", () => {
    const runtime = (monsterId: string, focused: boolean) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "venom_colony",
        monsterId,
        focused,
        difficulty: 100,
      });

    const venomFangDevourer = runtime("venom_fang_devourer", false);
    const focusedVenomFangDevourer = runtime("venom_fang_devourer", true);
    const venomSprayer = runtime("venom_sprayer", false);
    const focusedVenomSprayer = runtime("venom_sprayer", true);
    const corrosiveColony = runtime("corrosive_colony", false);
    const focusedCorrosiveColony = runtime("corrosive_colony", true);

    expect(venomFangDevourer.monster.v2Skills?.equipped).toEqual([
      "mob_venom_bite",
    ]);
    expect(focusedVenomFangDevourer.monster.v2Skills?.equipped).toEqual([
      "mob_catastrophe_venom",
    ]);

    expect(venomSprayer.imageFileName).toBe(
      "unexplored-venom-sprayer.webp",
    );
    expect(venomSprayer.monster.v2Skills?.equipped).toEqual([
      "mob_catastrophe_venom",
    ]);
    expect(focusedVenomSprayer.monster.v2Skills?.equipped).toEqual([
      "mob_catastrophe_venom",
    ]);

    expect(corrosiveColony.imageFileName).toBe(
      "unexplored-corrosive-colony.webp",
    );
    expect(corrosiveColony.monster.v2Skills?.equipped).toEqual([
      "mob_venom_sunder",
    ]);
    expect(focusedCorrosiveColony.monster.v2Skills?.equipped).toEqual([
      "mob_venom_sunder",
    ]);
  });

  it("routes active bloodstained dead to bleed, heavy blow, focus, and images", () => {
    const runtime = (monsterId: string, focused: boolean) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "bloodstained_dead",
        monsterId,
        focused,
        difficulty: 100,
      });

    for (const monsterId of [
      "hooked_dead",
      "bloodtrail_pursuer",
      "severing_executioner",
    ]) {
      const normal = runtime(monsterId, false);
      const focused = runtime(monsterId, true);

      expect(normal.monster.v2Skills?.equipped).toEqual([
        "mob_rending_claw",
      ]);
      expect(focused.monster.v2Skills?.equipped).toEqual([
        "mob_rending_claw",
      ]);
      expect(focused.monster.spd).toBe(Math.round(normal.monster.spd * 1.1));
      expect(focused.monster.atk).toBe(Math.round(normal.monster.atk * 1.1));
    }

    const bloodtrailPursuer = runtime("bloodtrail_pursuer", false);
    const severingExecutioner = runtime("severing_executioner", false);
    const focusedSeveringExecutioner = runtime(
      "severing_executioner",
      true,
    );

    expect(bloodtrailPursuer.imageFileName).toBe(
      "unexplored-bloodtrail-pursuer.webp",
    );
    expect(severingExecutioner.imageFileName).toBe(
      "unexplored-severing-executioner.webp",
    );
    expect(severingExecutioner.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(focusedSeveringExecutioner.monster.skill).toEqual(
      severingExecutioner.monster.skill,
    );
  });

  it("routes active frozen legion to chill, magic attacks, focus, and images", () => {
    const runtime = (monsterId: string, focused: boolean) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "frozen_legion",
        monsterId,
        focused,
        difficulty: 100,
      });

    const frostToucher = runtime("frost_toucher", false);
    const focusedFrostToucher = runtime("frost_toucher", true);
    const freezingMage = runtime("freezing_mage", false);
    const focusedFreezingMage = runtime("freezing_mage", true);
    const frozenSentinel = runtime("frozen_sentinel", false);
    const focusedFrozenSentinel = runtime("frozen_sentinel", true);

    expect(frostToucher.monster.v2Skills?.equipped).toEqual([
      "mob_chilling_touch",
    ]);
    expect(focusedFrostToucher.monster.v2Skills?.equipped).toEqual([
      "mob_deep_chill",
    ]);

    expect(freezingMage.imageFileName).toBe(
      "unexplored-freezing-mage.webp",
    );
    expect(freezingMage.monster.atkType).toBe("magic");
    expect(freezingMage.monster.v2Skills?.equipped).toEqual([
      "mob_deep_chill",
      "mob_arcane_bolt",
    ]);
    expect(focusedFreezingMage.monster.v2Skills?.equipped).toEqual(
      freezingMage.monster.v2Skills?.equipped,
    );
    expect(focusedFreezingMage.monster.atkType).toBe("magic");

    expect(frozenSentinel.imageFileName).toBe(
      "unexplored-frozen-sentinel.webp",
    );
    expect(frozenSentinel.monster).toMatchObject({
      atkType: "magic",
      v2MaxMp: 70,
    });
    expect(frozenSentinel.monster.v2Skills?.equipped).toEqual([
      "mob_glacial_chill",
      "mob_arcane_nova",
    ]);
    expect(focusedFrozenSentinel.monster.v2Skills?.equipped).toEqual(
      frozenSentinel.monster.v2Skills?.equipped,
    );
    expect(focusedFrozenSentinel.monster).toMatchObject({
      atkType: "magic",
      v2MaxMp: 70,
    });
  });

  it("routes active crushing colossi to piercing, heavy blows, focus, and images", () => {
    const runtime = (monsterId: string, focused: boolean) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "crushing_colossi",
        monsterId,
        focused,
        difficulty: 100,
      });

    const bedrockColossus = runtime("bedrock_colossus", false);
    const focusedBedrockColossus = runtime("bedrock_colossus", true);
    const ironwallCrusher = runtime("ironwall_crusher", false);
    const focusedIronwallCrusher = runtime("ironwall_crusher", true);
    const crustDestroyer = runtime("crust_destroyer", false);
    const focusedCrustDestroyer = runtime("crust_destroyer", true);

    expect(bedrockColossus.monster.skill).toMatchObject({
      kind: "heavy_blow",
      everyPhases: 3,
      multiplier: 2,
    });
    expect(focusedBedrockColossus.monster.skill).toEqual(
      bedrockColossus.monster.skill,
    );

    expect(ironwallCrusher.imageFileName).toBe(
      "unexplored-ironwall-crusher.webp",
    );
    expect(ironwallCrusher.monster.skill).toMatchObject({
      kind: "pierce",
      armorPierce: 11,
    });
    expect(focusedIronwallCrusher.monster.skill).toEqual(
      ironwallCrusher.monster.skill,
    );

    expect(crustDestroyer.imageFileName).toBe(
      "unexplored-crust-destroyer.webp",
    );
    expect(crustDestroyer.monster.v2Skills?.equipped).toEqual([
      "mob_crushing_blow",
    ]);
    expect(crustDestroyer.monster.v2MaxMp).toBe(60);
    expect(focusedCrustDestroyer.monster.v2Skills?.equipped).toEqual(
      crustDestroyer.monster.v2Skills?.equipped,
    );
    expect(focusedCrustDestroyer.monster.v2MaxMp).toBe(60);

    for (const [normal, focused] of [
      [bedrockColossus, focusedBedrockColossus],
      [ironwallCrusher, focusedIronwallCrusher],
      [crustDestroyer, focusedCrustDestroyer],
    ]) {
      expect(focused.monster.atk).toBe(Math.round(normal.monster.atk * 1.1));
      expect(focused.monster.playerDefVulnerable).toBe(0.08);
    }
  });

  it("rejects special monster IDs outside the selected pool", () => {
    expect(() =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId: "frozen_legion",
        monsterId: "ironwall_crusher",
        focused: false,
        difficulty: 100,
      }),
    ).toThrow(/not active/i);
  });

  it("preserves the approved anchor values and ends resource compensation at 110", () => {
    expect(unexploredBaseMonstersAtDifficulty(95)[0].monster).toMatchObject({
      hp: 397_012,
      atk: 14_710,
      def: 2_142,
      magicDef: 2_226,
      spd: 13,
    });
    expect(unexploredBaseMonstersAtDifficulty(100)[0].monster).toMatchObject({
      hp: 494_969,
      atk: 16_372,
      def: 2_370,
      magicDef: 2_461,
      spd: 17,
    });
    for (let difficulty = 110; difficulty <= 120; difficulty += 1) {
      expect(unexploredResourceGrowthCompensation(difficulty)).toEqual({
        hp: 1,
        atk: 1,
        def: 1,
      });
    }
  });

  it("applies only each pool's declared focus axis", () => {
    const normal = (poolId: UnexploredPoolId) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId,
        focused: false,
        difficulty: 100,
      }).monster;
    const focused = (poolId: UnexploredPoolId) =>
      unexploredMonsterAtDifficulty({
        source: "special",
        poolId,
        focused: true,
        difficulty: 100,
      }).monster;

    expect(focused("iron_legion").def).toBeGreaterThan(normal("iron_legion").def);
    expect(focused("mana_barrier").magicDef).toBeGreaterThan(normal("mana_barrier").magicDef ?? 0);
    expect(focused("regenerating_swarm").hp).toBeGreaterThan(normal("regenerating_swarm").hp);
    expect(focused("red_berserkers").critPct).toBe((normal("red_berserkers").critPct ?? 0) + 10);
    expect(focused("crystal_artillery").v2MaxMp).toBeGreaterThan(normal("crystal_artillery").v2MaxMp ?? 0);
    expect(focused("precision_hunters").accuracy).toBe((normal("precision_hunters").accuracy ?? 0) + 15);
    expect(focused("runaway_machines").bonusAttackChancePct).toBe((normal("runaway_machines").bonusAttackChancePct ?? 0) + 15);
    expect(focused("shadow_stalkers").evasionPct).toBe((normal("shadow_stalkers").evasionPct ?? 0) + 10);
    expect(focused("venom_colony").v2Skills?.equipped).toContain("mob_catastrophe_venom");
    expect(focused("bloodstained_dead").atk).toBeGreaterThan(normal("bloodstained_dead").atk);
    expect(focused("frozen_legion").v2Skills?.equipped).toContain("mob_deep_chill");
    expect(focused("crushing_colossi").playerDefVulnerable).toBe(0.08);
  });
});
