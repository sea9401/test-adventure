import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initialBattleState, applyPlayerV2SkillCast, type PlayerCombat } from "./engine";
import { initialBattleStatePvP, castV2SkillOnAttackerTurnPvP } from "./engine-pvp";
import { v2SkillMpCostValue, V2_SKILLS, type V2SkillId, type V2SkillsState } from "@/adventure/data/v2/v2Skills";
import { SKILL_CRIT_MULT } from "@/adventure/data/v2/v2CombatConstants";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_SKILL_PROC_IN_PATTERN: true };
});

const thunderbolt = "v2c_lightningmage_thunderbolt";
const chain = "v2c_electromancer_chain";
const conduction = "v2c_electromancer_conduction";
const descent = "v2c_thundersovereign_descent";
const heart = "v2c_thundersovereign_heart";

const START_MP = 10000;
const player: PlayerCombat = { hp: 100000, maxHp: 100000, mp: START_MP, maxMp: START_MP, atk: 100, magicAtk: 100, intStat: 100, def: 0, spd: 100, evasionPct: 0, accuracyPct: 100, attackCount: 1, critChancePct: 0 };
const enemy = { name: "허수아비", tags: [], hp: 1000000, atk: 1, def: 0, magicDef: 0, spd: 1, exp: 0, drops: [] };
const armored = { ...enemy, def: 400, magicDef: 400 };
/** 첫 스킬을 항상 시전하고 나머지는 장착 패시브로 둔다. */
const skills = (active: V2SkillId, ...passives: V2SkillId[]): V2SkillsState => ({
  learned: [active, ...passives],
  equipped: [active, ...passives],
  pattern: { blocks: [{ condition: { kind: "always" }, action: { kind: "skill", skillId: active } }] },
});
const castPve = (state: ReturnType<typeof initialBattleState>, actor = player) =>
  applyPlayerV2SkillCast(state, actor, { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} });
/** 피해 증폭 없이(0%) 취약 상태만 켠다 — 조건부 효과만 분리해서 본다. */
const vulnerable = (state: ReturnType<typeof initialBattleState>, turns = 2) => ({
  ...state,
  stacks: { ...state.stacks, enemyVulnPct: 0, enemyVulnTurns: turns },
});

// 0.1 고정: 발동 판정 통과, 치명타는 확률이 10%를 넘을 때만 발생.
beforeEach(() => vi.spyOn(Math, "random").mockReturnValue(0.1));
afterEach(() => vi.restoreAllMocks());

describe("전격 계보 사냥 전투", () => {
  it("연쇄 뇌격은 취약 대상에게만 치명타 확률 25%p를 얻는다", () => {
    const initial = initialBattleState(player, enemy, "전격", skills(chain));
    const plain = castPve(initial);
    const exposed = castPve(vulnerable(initial));
    expect(plain.castFired).toBe(true);
    const plainDamage = initial.enemyHp - plain.state.enemyHp;
    const exposedDamage = initial.enemyHp - exposed.state.enemyHp;
    expect(plainDamage).toBeGreaterThan(0);
    expect(exposedDamage / plainDamage).toBeCloseTo(SKILL_CRIT_MULT, 1);
    expect(exposed.state.log.some((entry) => entry.text.includes("[치명타]"))).toBe(true);
    expect(plain.state.log.some((entry) => entry.text.includes("[치명타]"))).toBe(false);
  });

  it("조건부 치명타 확률도 굴림을 넘지 못하면 치명타가 아니다", () => {
    vi.mocked(Math.random).mockReturnValue(0.26);
    const initial = initialBattleState(player, enemy, "전격", skills(chain));
    const exposed = castPve(vulnerable(initial));
    if (exposed.castFired) {
      expect(exposed.state.log.some((entry) => entry.text.includes("[치명타]"))).toBe(false);
    }
  });

  it("만뢰 강림은 이미 취약한 대상에게만 0방어 피해의 20%를 관통으로 더한다", () => {
    const zeroDef = initialBattleState(player, enemy, "전격", skills(descent));
    const zeroDefDamage = zeroDef.enemyHp - castPve(zeroDef).state.enemyHp;
    const initial = initialBattleState(player, armored, "전격", skills(descent));
    const plain = castPve(initial);
    const exposed = castPve(vulnerable(initial));
    const plainDamage = initial.enemyHp - plain.state.enemyHp;
    const exposedDamage = initial.enemyHp - exposed.state.enemyHp;
    expect(plainDamage).toBeLessThan(zeroDefDamage);
    expect(exposedDamage - plainDamage).toBeGreaterThan(0);
    expect(Math.abs(exposedDamage - plainDamage - zeroDefDamage * 0.2)).toBeLessThanOrEqual(2);
    // 이 시전이 새로 건 취약은 조건에 포함하지 않지만 다음 행동을 위해 남는다.
    expect(plain.state.stacks.enemyVulnPct).toBe(18);
    expect(plain.state.stacks.enemyVulnTurns).toBe(3);
  });

  it("전도는 새로 거는 취약을 1행동 늘리고 전격 주문 MP를 20% 줄인다", () => {
    for (const id of [thunderbolt, descent, "v2c_runeknight_carve"] as const) {
      const base = castPve(initialBattleState(player, enemy, "전격", skills(id)));
      const extended = castPve(initialBattleState(player, enemy, "전격", skills(id, conduction)));
      expect(base.state.stacks.enemyVulnTurns).toBe(3);
      expect(extended.state.stacks.enemyVulnTurns).toBe(4);
    }
    for (const id of [thunderbolt, chain, descent] as const) {
      const cost = v2SkillMpCostValue(V2_SKILLS[id]);
      const base = castPve(initialBattleState(player, enemy, "전격", skills(id)));
      const reduced = castPve(initialBattleState(player, enemy, "전격", skills(id, conduction)));
      expect(START_MP - base.state.playerMp).toBe(cost);
      expect(START_MP - reduced.state.playerMp).toBe(cost - Math.floor(cost * 0.2));
    }
    // 전격 주문이 아니면 MP가 줄지 않는다.
    const other = "v2c_infernomancer_collapse";
    const otherCost = v2SkillMpCostValue(V2_SKILLS[other]);
    const cast = castPve(initialBattleState(player, enemy, "전격", skills(other, conduction)));
    expect(START_MP - cast.state.playerMp).toBe(otherCost);
  });

  it("뇌신의 심장은 전격 주문이 치명타로 적중했을 때만 20% 가속한다", () => {
    const critter = { ...player, critChancePct: 50 };
    const crit = castPve(initialBattleState(critter, enemy, "전격", skills(chain, heart)), critter);
    expect(crit.selfHastePct).toBe(20);
    const noCrit = castPve(initialBattleState(player, enemy, "전격", skills(chain, heart)));
    expect(noCrit.selfHastePct).toBe(0);
    const unequipped = castPve(initialBattleState(critter, enemy, "전격", skills(chain)), critter);
    expect(unequipped.selfHastePct).toBe(0);
    const otherSpell = castPve(initialBattleState(critter, enemy, "전격", skills("v2c_infernomancer_collapse", heart)), critter);
    expect(otherSpell.selfHastePct).toBe(0);
    // 취약 대상 조건부 치명타로도 발동한다.
    const initial = initialBattleState(player, enemy, "전격", skills(chain, heart));
    expect(castPve(vulnerable(initial)).selfHastePct).toBe(20);
  });
});

describe("전격 계보 대전", () => {
  const pvp = (active: V2SkillId, ...passives: V2SkillId[]) =>
    initialBattleStatePvP(player, player, "A", "B", skills(active, ...passives), skills(active, ...passives));

  it.each(["p1", "p2"] as const)("%s의 연쇄 뇌격은 자신이 건 유효한 취약에만 치명타 보너스를 얻는다", (who) => {
    const other = who === "p1" ? "p2" : "p1";
    const initial = pvp(chain);
    const plain = castV2SkillOnAttackerTurnPvP(initial, who);
    const plainDamage = initial[other].hp - plain.state[other].hp;
    expect(plainDamage).toBeGreaterThan(0);

    // 이번 행동 시작에 1 줄어도 남는 취약(3)만 유효. 피해 증폭은 0%로 둔다.
    initial[who].stacks.enemyVulnPct = 0;
    initial[who].stacks.enemyVulnTurns = 3;
    const exposed = castV2SkillOnAttackerTurnPvP(initial, who);
    expect((initial[other].hp - exposed.state[other].hp) / plainDamage).toBeCloseTo(SKILL_CRIT_MULT, 1);

    // 이번 행동에 만료되는 취약(1)은 인정하지 않는다.
    initial[who].stacks.enemyVulnTurns = 1;
    const expiring = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(initial[other].hp - expiring.state[other].hp).toBe(plainDamage);

    // 상대가 나에게 건 취약은 내 조건이 아니다.
    initial[who].stacks.enemyVulnTurns = 0;
    initial[other].stacks.enemyVulnPct = 0;
    initial[other].stacks.enemyVulnTurns = 3;
    const reversed = castV2SkillOnAttackerTurnPvP(initial, who);
    expect(initial[other].hp - reversed.state[other].hp).toBe(plainDamage);
  });

  it("만뢰 강림의 관통 조건은 시전자 쪽 취약을 읽는다", () => {
    const armoredPlayer = { ...player, def: 400, magicDef: 400 };
    const initial = initialBattleStatePvP(player, armoredPlayer, "A", "B", skills(descent), skills(descent));
    const damage = (state: typeof initial) => initial.p2.hp - castV2SkillOnAttackerTurnPvP(state, "p1").state.p2.hp;
    const plain = damage(initial);

    // 대전은 이번 시전이 건 취약도 같은 시전 피해를 증폭하므로 비교 기준에 모두 18%가 들어 있다.
    initial.p2.stacks.enemyVulnPct = 0;
    initial.p2.stacks.enemyVulnTurns = 3;
    expect(damage(initial)).toBe(plain);

    initial.p2.stacks.enemyVulnTurns = 0;
    initial.p1.stacks.enemyVulnPct = 0;
    initial.p1.stacks.enemyVulnTurns = 3;
    expect(damage(initial)).toBeGreaterThan(plain);
  });

  it("전도와 뇌신의 심장이 대전에서도 적용된다", () => {
    const base = castV2SkillOnAttackerTurnPvP(pvp(thunderbolt), "p1");
    const extended = castV2SkillOnAttackerTurnPvP(pvp(thunderbolt, conduction), "p1");
    expect(base.state.p1.stacks.enemyVulnTurns).toBe(3);
    expect(extended.state.p1.stacks.enemyVulnTurns).toBe(4);

    const cost = v2SkillMpCostValue(V2_SKILLS[chain]);
    const reduced = castV2SkillOnAttackerTurnPvP(pvp(chain, conduction), "p1");
    expect(START_MP - reduced.state.p1.mp).toBe(cost - Math.floor(cost * 0.2));

    const critter = { ...player, critChancePct: 50 };
    const crit = castV2SkillOnAttackerTurnPvP(
      initialBattleStatePvP(critter, player, "A", "B", skills(chain, heart), skills(chain)),
      "p1",
    );
    expect(crit.selfHastePct).toBe(20);
    expect(castV2SkillOnAttackerTurnPvP(pvp(chain, heart), "p1").selfHastePct).toBe(0);

    // 확정 회피로 빗나가면 치명타 가속도 없다.
    const dodged = initialBattleStatePvP(critter, player, "A", "B", skills(chain, heart), skills(chain));
    dodged.p2.stacks.evadesRemaining = 1;
    expect(castV2SkillOnAttackerTurnPvP(dodged, "p1").selfHastePct).toBe(0);
  });
});
