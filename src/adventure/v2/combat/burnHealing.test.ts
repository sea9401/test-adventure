import { afterEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, applyEnemyV2SkillCast, finishPlayerTurn, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP, endAttackerPhase } from "./engine-pvp";
import { V2_DOT_PRESETS } from "@/adventure/data/v2/statusEffects";
import { tickV2Dots } from "./combatShared";

const burn = { ...V2_DOT_PRESETS.연소, sourceAtk: 100 };
const heal = "v2c_acolyte_smite";
const skills = { learned: [heal], equipped: [heal] } as const;
const player: PlayerCombat = { hp: 100, maxHp: 10000, mp: 10000, maxMp: 10000, atk: 100, magicAtk: 100, intStat: 100, spiStat: 100, def: 0, spd: 100, accuracyPct: 100, evasionPct: 0, attackCount: 1 };
const enemy = { name: "허수아비", hp: 10000, atk: 1, def: 0, spd: 1, tags: [], exp: 0, drops: [] };
afterEach(() => vi.restoreAllMocks());

describe("연소의 공통 회복 감소", () => {
  it("PvE 회복 스킬은 연소 중 절반이며 마지막 틱으로 연소가 끝나면 복구된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const initial = initialBattleState(player, enemy, "시전자", { learned: [...skills.learned], equipped: [...skills.equipped] });
    const run = (dots: typeof initial.playerV2Dots) => applyPlayerV2SkillCast({ ...initial, playerV2Dots: dots }, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} }).state.playerHp - initial.playerHp;
    expect(run([burn])).toBe(Math.floor(run([]) * 0.5));
    expect(run(tickV2Dots([{ ...burn, turns: 1 }]).nextDots)).toBe(run([]));
    expect(run([{ ...burn, stacks: 0 }])).toBe(run([]));
  });
  it("연소 상태인 PvE 적의 회복도 줄어든다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const initial = initialBattleState(player, enemy, "시전자");
    const kit = { learned: [...skills.learned], equipped: [...skills.equipped] };
    const run = (burned: boolean) => applyEnemyV2SkillCast({ ...initial, enemyHp: 100, enemyMp: 10000, enemyV2Skills: kit, enemyV2Dots: burned ? [burn] : [] }, player).state.enemyHp - 100;
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(Math.floor(run(false) * 0.5));
  });
  it("회복 감소 패턴은 별도 디버프 없이 연소만 있어도 만족한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const kit = { learned: [...skills.learned], equipped: [...skills.equipped], pattern: { blocks: [{ condition: { kind: "enemy_debuff" as const, target: "healReduction" as const, active: true }, action: { kind: "skill" as const, skillId: heal } }] } };
    const initial = initialBattleState(player, enemy, "시전자", kit);
    const cast = (burned: boolean) => applyPlayerV2SkillCast({ ...initial, enemyV2Dots: burned ? [burn] : [] }, player, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
    expect(cast(true).castFired).toBe(true);
    expect(cast(false).castFired).toBe(false);
  });
  it("PvE 재생도 연소 중 절반이다", () => {
    const caster = { ...player, regen: { amount: 200, interval: 1 } };
    const initial = initialBattleState(caster, enemy, "시전자");
    const run = (burned: boolean) => finishPlayerTurn({ ...initial, turn: { ...initial.turn, completedPlayerTurns: 1 }, playerV2Dots: burned ? [burn] : [] }, caster, "시전자").playerHp - initial.playerHp;
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(Math.floor(run(false) * 0.5));
  });
  it.each(["p1", "p2"] as const)("PvP %s의 재생·운기도 연소에 의해 감소한다", who => {
    const caster = { ...player, regen: { amount: 200, interval: 1 } };
    const initial = initialBattleStatePvP(caster, caster, "A", "B");
    const run = (burned: boolean) => {
      const side = { ...initial[who], turn: { ...initial[who].turn, completedPlayerTurns: 1 }, v2Dots: burned ? [burn] : [], stacks: { ...initial[who].stacks, skillRegenPct: 2, skillRegenTurns: 3 } };
      return endAttackerPhase({ ...initial, [who]: side }, who, who === "p1" ? "p2" : "p1");
    };
    const plain = run(false);
    const reduced = run(true);
    expect(plain[who].hp).toBeGreaterThan(initial[who].hp);
    expect(reduced[who].hp - initial[who].hp).toBe(Math.floor((plain[who].hp - initial[who].hp) * 0.5));
  });
  it.each(["p1", "p2"] as const)("PvP %s는 연소와 별도 회복 감소 중 강한 쪽만 적용한다", who => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const kit = { learned: [...skills.learned], equipped: [...skills.equipped] };
    const initial = initialBattleStatePvP(player, player, "A", "B", kit, kit);
    const run = (burned: boolean, reduction = 0) => {
      const side = { ...initial[who], v2Dots: burned ? [burn] : [], stacks: { ...initial[who].stacks, healReducePct: reduction, healReduceTurns: reduction ? 3 : 0 } };
      return castV2SkillOnAttackerTurnPvP({ ...initial, [who]: side }, who).state[who].hp - side.hp;
    };
    expect(run(false)).toBeGreaterThan(0);
    expect(run(true)).toBe(Math.floor(run(false) * 0.5));
    expect(run(true, 30)).toBe(run(true));
    expect(run(true, 70)).toBe(run(false, 70));
  });
});
