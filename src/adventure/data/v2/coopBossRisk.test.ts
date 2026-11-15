import { describe, expect, it } from "vitest";
import {
  COOP_BOSSES,
  coopBossForBattle,
  coopBossRiskTier,
  coopBossSessionMaxHp,
  coopImmortalBerserkerState,
  parseCoopMechanicState,
  withCoopBossRiskTier,
} from "./coopBosses";
import { UNEXPLORED_BOSS_STAT_MULTIPLIER } from "./unexploredBosses";

// 개인 보스 위험도가 협동 보스 세션과 전투 보스에 반영되는지 본다.

const fortress = COOP_BOSSES.invincible_fortress;
const berserker = COOP_BOSSES.immortal_berserker;

describe("개인 보스 위험도 세션", () => {
  it("세션 최대 체력은 위험도마다 50%씩 늘고 일반 협동 보스는 그대로다", () => {
    expect(coopBossSessionMaxHp(fortress, 0)).toBe(fortress.sharedMaxHp);
    expect(coopBossSessionMaxHp(fortress, 4)).toBe(fortress.sharedMaxHp * 3);
    expect(coopBossSessionMaxHp(COOP_BOSSES.mountain_chief, 4)).toBe(COOP_BOSSES.mountain_chief.sharedMaxHp);
  });

  it("기믹 상태에 위험도를 적고, 다른 값을 고쳐 써도 남는다", () => {
    const state = withCoopBossRiskTier({ bossMp: 12 }, 7);

    expect(coopBossRiskTier(state)).toBe(7);
    expect(parseCoopMechanicState({ ...state, bossMp: 3 })).toMatchObject({ riskTier: 7, bossMp: 3 });
    expect(coopBossRiskTier({})).toBe(0);
    expect(coopBossRiskTier({ riskTier: -4 })).toBe(0);
    expect(withCoopBossRiskTier({ bossMp: 12 }, 0)).not.toHaveProperty("riskTier");
  });

  it("체력에 묶인 기믹은 위험도 체력을 기준으로 읽는다", () => {
    const maxHp = coopBossSessionMaxHp(berserker, 6);
    const raw = withCoopBossRiskTier({ immortalBerserker: { kind: "immortal_berserker", lifeIndex: 0 } }, 6);

    // 위험도 체력의 90%가 남아 있어도 첫 목숨으로 읽는다(기본 체력으로 자르면 다음 목숨으로 넘어간다).
    const fromParse = parseCoopMechanicState(raw).immortalBerserker;
    const fromSession = coopImmortalBerserkerState(berserker, raw, Math.floor(maxHp * 0.9), maxHp);
    expect(fromParse?.lifeIndex).toBe(0);
    expect(fromSession.lifeIndex).toBe(0);
  });
});

describe("개인 보스 위험도 전투", () => {
  it("위험도마다 능력치 배율이 8%씩 오르고 체력은 세션 최대 체력까지 유지된다", () => {
    const base = coopBossForBattle(fortress, fortress.sharedMaxHp).monster;
    const maxHp = coopBossSessionMaxHp(fortress, 10);
    const risky = coopBossForBattle(fortress, maxHp, { sharedMaxHp: maxHp, riskTier: 10 }).monster;

    expect(risky.hp).toBe(maxHp);
    expect(risky.atk / base.atk).toBeCloseTo(1.8, 1);
    expect(risky.def / base.def).toBeCloseTo(1.8, 1);
    expect(UNEXPLORED_BOSS_STAT_MULTIPLIER).toBe(1.3);
  });

  it("위험도 0은 지금과 같다", () => {
    const base = coopBossForBattle(fortress, fortress.sharedMaxHp).monster;
    const same = coopBossForBattle(fortress, fortress.sharedMaxHp, { sharedMaxHp: fortress.sharedMaxHp, riskTier: 0 }).monster;

    expect(same).toEqual(base);
  });

  it("일반 협동 보스에는 위험도를 적용하지 않는다", () => {
    const kind = COOP_BOSSES.mountain_chief;
    const base = coopBossForBattle(kind, kind.sharedMaxHp).monster;

    expect(coopBossForBattle(kind, kind.sharedMaxHp, { riskTier: 10 }).monster).toEqual(base);
  });
});
