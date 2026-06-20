// PR-E2 — 원소술사 불=화상(연소 DoT + 적 회복 −50%). 회복 스킬·재생만 감소(흡혈 제외).
//   유닛: 불 시전이 enemyHealReduce 결과 생성. PvP: 시전 시 상대 side 에 회복감소 디버프 부착.
import { describe, expect, it, vi, afterEach } from "vitest";

import { resolveV2SkillCast } from "@/adventure/v2/combat/combatShared";
import {
  initialBattleStatePvP,
  castV2SkillOnAttackerTurnPvP,
} from "@/adventure/v2/combat/engine-pvp";
import type { PlayerCombat } from "@/adventure/v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

const ELE = "v2c_elementalist_magic";

describe("PR-E2 유닛: 불 시전 → enemyHealReduce 결과", () => {
  it("불 → enemyHealReduceToApply 50/3, nudge 없음", () => {
    const r = resolveV2SkillCast({
      skills: { learned: [ELE], equipped: [ELE] },
      cooldowns: {},
      procRoll: 0,
      attacker: {
        mp: 999, atk: 100, magicAtk: 100, maxHp: 1000, currentHp: 1000, maxMp: 999,
        selfBuffs: {}, selfDebuffs: {}, characterElement: "fire",
      },
      target: { def: 10, maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {}, element: "neutral" },
    } as never);
    expect(r.castSkillId).toBe(ELE);
    expect(r.enemyHealReduceToApply?.pct).toBe(50);
    expect(r.enemyHealReduceToApply?.turns).toBe(3);
    expect(r.selfHasteToApply).toBeUndefined();
    expect(r.enemyDelayToApply).toBeUndefined();
  });
});

describe("PR-E2 PvP: 불 시전 → 상대에게 회복감소 디버프 부착", () => {
  const fireMage: PlayerCombat = {
    hp: 400, maxHp: 400, atk: 20, def: 6, spd: 60, magicAtk: 80,
    evasionPct: 0, attackCount: 1, accuracyPct: 100, maxMp: 100000, mp: 100000,
    characterElement: "fire",
  } as PlayerCombat;
  const target: PlayerCombat = {
    hp: 4000, maxHp: 4000, atk: 10, def: 8, spd: 30,
    evasionPct: 0, attackCount: 1, accuracyPct: 100,
    characterElement: "neutral",
  } as PlayerCombat;

  it("p1 이 화상을 걸면 p2.stacks 에 healReduce 50/3 이 박힌다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.05); // proc 통과
    const state = initialBattleStatePvP(
      fireMage, target, "P1", "P2",
      { learned: [ELE], equipped: [ELE] },
      { learned: [], equipped: [] },
    );
    const out = castV2SkillOnAttackerTurnPvP(state, "p1");
    vi.restoreAllMocks();
    expect((out.state as { p2: { stacks: { healReducePct: number; healReduceTurns: number } } }).p2.stacks.healReducePct).toBe(50);
    expect((out.state as { p2: { stacks: { healReduceTurns: number } } }).p2.stacks.healReduceTurns).toBe(3);
  });

  it("화상 turns 는 피영향 side 의 턴마다 1씩 감소(off-by-one 가드)·pct 보존", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.99); // proc 안 함 — 턴 진행(tick)만 본다
    let state = initialBattleStatePvP(
      target, target, "P1", "P2",
      { learned: [], equipped: [] },
      { learned: [], equipped: [] },
    );
    // p2 에 화상 3턴 수동 부착 후, p2 가 행동할 때마다 turns 감소 확인.
    type S = { p2: { stacks: { healReducePct: number; healReduceTurns: number } } };
    state = { ...state, p2: { ...(state as never as S).p2, stacks: { ...(state as never as S).p2.stacks, healReducePct: 50, healReduceTurns: 3 } } } as never;
    const turnsAfter = (s: unknown) => (s as S).p2.stacks.healReduceTurns;
    state = castV2SkillOnAttackerTurnPvP(state, "p2").state as never;
    expect(turnsAfter(state)).toBe(2);
    state = castV2SkillOnAttackerTurnPvP(state, "p2").state as never;
    expect(turnsAfter(state)).toBe(1);
    state = castV2SkillOnAttackerTurnPvP(state, "p2").state as never;
    expect(turnsAfter(state)).toBe(0);
    expect((state as never as S).p2.stacks.healReducePct).toBe(50); // pct 는 보존, turns 만 0
    vi.restoreAllMocks();
  });
});
