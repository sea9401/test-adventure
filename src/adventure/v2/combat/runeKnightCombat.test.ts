import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2FromSaves } from "@/lib/server/derivePlayerCombatV2";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_SKILL_PROC_IN_PATTERN: true };
});

const flurry = "v2c_spellswordmaster_flurry";
const release = "v2c_spellswordemperor_release";
const player: PlayerCombat = { hp: 100000, maxHp: 100000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, strStat: 100, intStat: 100, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1, critChancePct: 0 };
const enemy = { name: "허수아비", tags: [], hp: 1000000, atk: 1, def: 0, magicDef: 0, spd: 1, exp: 0, drops: [] };
const skills = (id: V2SkillId): V2SkillsState => ({ learned: [id], equipped: [id], pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: id } }] } });
const damageTo = (target: typeof enemy, id: V2SkillId, actor = player) => {
  const initial = initialBattleState(actor, target, "마검", skills(id));
  const cast = applyPlayerV2SkillCast(initial, actor, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
  expect(cast.castFired).toBe(true);
  return { damage: initial.enemyHp - cast.state.enemyHp, state: cast.state };
};

beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.1));
afterEach(() => vi.restoreAllMocks());

describe("룬 기사 계보 전투", () => {
  it("룬 연격은 물리 두 타와 마법 한 타가 각자의 방어로 줄어든다", () => {
    const open = damageTo(enemy, flurry).damage;
    const physWall = damageTo({ ...enemy, def: 100000 }, flurry).damage;
    const magicWall = damageTo({ ...enemy, magicDef: 100000 }, flurry).damage;
    expect(open).toBeGreaterThan(0);
    // 물리 방어만 높으면 마법 한 타가, 마법 방어만 높으면 물리 두 타가 온전히 들어간다.
    expect(physWall).toBeLessThan(magicWall);
    expect(magicWall).toBeLessThan(open);
    expect(physWall + magicWall).toBeGreaterThan(open * 0.9);
  });

  it("힘만 올리면 물리 타격만, 지능만 올리면 마법 타격만 강해진다", () => {
    const base = damageTo(enemy, flurry).damage;
    const strong = damageTo(enemy, flurry, { ...player, atk: 200, strStat: 200 }).damage;
    const wise = damageTo(enemy, flurry, { ...player, magicAtk: 200, intStat: 200 }).damage;
    expect(strong).toBeGreaterThan(wise);
    expect(wise).toBeGreaterThan(base);
  });

  it("마검 해방은 두 타 모두 관통하고 취약 14%를 3행동 건다", () => {
    const open = damageTo(enemy, release);
    const walled = damageTo({ ...enemy, def: 100000, magicDef: 100000 }, release);
    expect(open.state.stacks.enemyVulnPct).toBe(14);
    expect(open.state.stacks.enemyVulnTurns).toBe(3);
    // 0방어 피해 = 기본 × 1.15(관통 포함). 방어가 아무리 높아도 기본의 15%는 남는다.
    const pierceOnly = (open.damage * 0.15) / 1.15;
    expect(walled.damage).toBeGreaterThanOrEqual(Math.floor(pierceOnly) - 2);
    expect(walled.damage).toBeLessThanOrEqual(Math.ceil(pierceOnly) + 6);
  });

  it("대전에서도 물리와 마법 피해를 함께 준다", () => {
    const initial = initialBattleStatePvP(player, player, "A", "B", skills(release), skills(release));
    const cast = castV2SkillOnAttackerTurnPvP(initial, "p1");
    expect(initial.p2.hp - cast.state.p2.hp).toBeGreaterThan(0);
    expect(cast.state.p1.stacks.enemyVulnPct).toBe(14);
    expect(cast.state.p1.stacks.enemyVulnTurns).toBe(3);
  });

  it("저장된 장착 패시브를 서버 전투 스탯에 전달한다", () => {
    const ids: V2SkillId[] = [
      "v2c_spellswordmaster_dualmark",
      "v2c_spellswordmaster_fissure",
      "v2c_spellswordemperor_unity",
      "v2c_spellswordemperor_rift",
    ];
    const withPassives = derivePlayerCombatV2FromSaves({ character: { level: 50, hp: 500, mp: 100, class: "warrior" }, equipmentSave: { owned: [], equipped: {} }, proficiencyRaw: {}, skillsRaw: { learned: ids, equipped: ids } });
    const without = derivePlayerCombatV2FromSaves({ character: { level: 50, hp: 500, mp: 100, class: "warrior" }, equipmentSave: { owned: [], equipped: {} }, proficiencyRaw: {}, skillsRaw: { learned: [], equipped: [] } });
    // 8%와 12%는 남은 방어력에 차례로 적용: 1 - 0.92 × 0.88 = 19.04%.
    expect(withPassives?.player.enemyPhysicalDefReductionPct).toBeCloseTo(19.04, 2);
    expect(withPassives?.player.enemyMagicDefReductionPct).toBeCloseTo(19.04, 2);
    expect(withPassives?.player.physicalSkillDamagePct).toBe(6);
    expect(withPassives?.player.magicSkillDamagePct).toBe(6);
    expect(withPassives!.player.atk).toBeGreaterThan(without!.player.atk);
    expect(withPassives!.player.magicAtk!).toBeGreaterThan(without!.player.magicAtk!);
  });

  it("전격 패시브의 스킬 치명타 피해도 서버 전투 스탯에 전달한다", () => {
    const ids: V2SkillId[] = ["v2c_electromancer_capacitor", "v2c_thundersovereign_thunderclap"];
    const result = derivePlayerCombatV2FromSaves({ character: { level: 50, hp: 500, mp: 100, class: "mage" }, equipmentSave: { owned: [], equipped: {} }, proficiencyRaw: {}, skillsRaw: { learned: ids, equipped: ids } });
    expect(result?.player.skillCritDmgPct).toBe(50);
  });
});
