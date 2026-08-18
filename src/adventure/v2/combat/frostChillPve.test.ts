import { afterEach, describe, expect, it, vi } from "vitest";
import type { Monster } from "@/adventure/data/monsters";
import {
  applyPlayerV2SkillCast,
  initialBattleState,
  type PlayerCombat,
} from "./engine";

const enemy: Monster = {
  name: "한기 허수아비",
  tags: [],
  hp: 100_000,
  atk: 1,
  def: 0,
  magicDef: 0,
  spd: 1,
  exp: 0,
  evasionPct: 0,
};

const player: PlayerCombat = {
  hp: 10_000,
  maxHp: 10_000,
  mp: 10_000,
  maxMp: 1_000,
  intStat: 100,
  atk: 100,
  magicAtk: 100,
  def: 100,
  spd: 100,
  evasionPct: 0,
  accuracyPct: 100,
  attackCount: 1,
  classTier: 4,
};

const ticked = { selfBuffs: {}, selfDebuffs: {}, enemyDebuffs: {} };

function initial(skillId: "v2c_frostmage_glacier" | "v2c_cryomancer_absolutezero") {
  return initialBattleState(player, enemy, "테스터", {
    learned: [skillId],
    equipped: [skillId],
  });
}

afterEach(() => vi.restoreAllMocks());

describe("PvE 한기·빙결", () => {
  it("빙하진은 0 → 2 → 4 → 빙결 → 0으로 순환하고 지연을 한 번 반환한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const first = applyPlayerV2SkillCast(initial("v2c_frostmage_glacier"), player, ticked);
    const second = applyPlayerV2SkillCast(first.state, player, ticked);
    const third = applyPlayerV2SkillCast(second.state, player, ticked);

    expect(first.state.stacks.enemyFrostChillStacks).toBe(2);
    expect(second.state.stacks.enemyFrostChillStacks).toBe(4);
    expect(third.state.stacks.enemyFrostChillStacks).toBe(0);
    expect(first.enemyDelayPct).toBe(0);
    expect(second.enemyDelayPct).toBe(0);
    expect(third.enemyDelayPct).toBe(30);
    expect(third.state.log.some((entry) => entry.text === "한기 +2 (4/5)")).toBe(true);
    expect(
      third.state.log.some(
        (entry) => entry.text === "한기 5스택을 소비해 빙결이 발생했다.",
      ),
    ).toBe(true);
    expect(third.state.log.some((entry) => entry.text.startsWith("빙결! "))).toBe(true);
  });

  it("빙점 지배는 빙결 피해만 50% 높이고 지연을 40%로 바꾼다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const ready = {
      ...initial("v2c_cryomancer_absolutezero"),
      stacks: {
        ...initial("v2c_cryomancer_absolutezero").stacks,
        enemyFrostChillStacks: 2,
      },
    };
    const plain = applyPlayerV2SkillCast(ready, player, ticked);
    const mastered = applyPlayerV2SkillCast(
      ready,
      { ...player, freezeDamagePct: 50, freezeDelayPct: 40 },
      ticked,
    );
    const freezeDamage = (result: typeof plain) => {
      const line = result.state.log.find((entry) => entry.text.startsWith("빙결! "));
      const match = line?.text.match(/ (\d+) 피해/);
      return match ? Number(match[1]) : 0;
    };

    expect(plain.enemyDelayPct).toBe(30);
    expect(mastered.enemyDelayPct).toBe(40);
    expect(freezeDamage(mastered)).toBe(Math.round(freezeDamage(plain) * 1.5));
  });

  it("빙결 추가타는 원래 시전과 치명타 결과를 공유한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const ready = initial("v2c_cryomancer_absolutezero");
    ready.stacks.enemyFrostChillStacks = 2;
    const result = applyPlayerV2SkillCast(
      ready,
      { ...player, critChancePct: 100 },
      ticked,
    );

    expect(
      result.state.log.filter(
        (entry) =>
          entry.kind === "player_attack" && entry.text.includes("[치명타]"),
      ),
    ).toHaveLength(2);
  });

  it("한기 생성량은 추가 공격 횟수와 무관하게 시전당 한 번만 적용한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0);
    const state = initial("v2c_frostmage_glacier");
    state.playerAttacksLeft = 3;
    const result = applyPlayerV2SkillCast(state, player, ticked);

    expect(result.state.stacks.enemyFrostChillStacks).toBe(2);
    expect(result.state.log.filter((entry) => entry.text.startsWith("한기 +"))).toHaveLength(1);
  });
});
