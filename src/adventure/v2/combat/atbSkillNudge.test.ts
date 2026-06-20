// PR-E1 — 원소술사 바람(selfHaste)/대지(enemyDelay) ATB 템포 효과.
//   유닛: resolveV2SkillCast 가 속성에 따라 nudge 결과를 생성. 통합: ATB 틱에 실제 반영(가속/지연).
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("@/adventure/data/v2/coreLoopConfig")
    >();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type BattleResolution,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";
import { resolveV2SkillCast } from "@/adventure/v2/combat/combatShared";

afterEach(() => vi.restoreAllMocks());

const ELE = "v2c_elementalist_magic"; // 속성 마법

function castWith(charEl: string) {
  return resolveV2SkillCast({
    skills: { learned: [ELE], equipped: [ELE] },
    cooldowns: {},
    procRoll: 0, // 확정 발동
    attacker: {
      mp: 999, atk: 100, magicAtk: 100, maxHp: 1000, currentHp: 1000, maxMp: 999,
      selfBuffs: {}, selfDebuffs: {}, characterElement: charEl,
    },
    target: { def: 10, maxHp: 1000, currentHp: 1000, selfBuffs: {}, selfDebuffs: {}, element: "neutral" },
  } as never);
}

describe("PR-E1 유닛: 속성별 ATB nudge 결과 생성", () => {
  it("바람 → selfHasteToApply 50, enemyDelay 없음", () => {
    const r = castWith("wind");
    expect(r.castSkillId).toBe(ELE);
    expect(r.selfHasteToApply?.pct).toBe(50);
    expect(r.enemyDelayToApply).toBeUndefined();
  });
  it("대지 → enemyDelayToApply 50, selfHaste 없음", () => {
    const r = castWith("earth");
    expect(r.enemyDelayToApply?.pct).toBe(50);
    expect(r.selfHasteToApply).toBeUndefined();
  });
  it("불 → nudge 둘 다 없음(연소만)", () => {
    const r = castWith("fire");
    expect(r.selfHasteToApply).toBeUndefined();
    expect(r.enemyDelayToApply).toBeUndefined();
  });
});

// ── 통합: ATB 틱 반영 ──
const baseEle: PlayerCombat = {
  hp: 400, maxHp: 400, atk: 20, def: 6, spd: 30, magicAtk: 60,
  evasionPct: 0, attackCount: 1, accuracyPct: 100, maxMp: 1_000_000, mp: 1_000_000,
};
// 절대 안 죽는 적 — 양 런이 모두 틱 캡까지 가서 행동 빈도만 비교.
const immortal: Monster = {
  name: "불멸 허수아비", tags: [], hp: 1_000_000_000, atk: 6, def: 3, spd: 20, exp: 0, evasionPct: 0,
};

function run(charEl: string): BattleResolution {
  vi.spyOn(Math, "random").mockReturnValue(0.05); // 항상 proc → 매 행동이 속성 마법 시전
  const res = resolveBattle(
    { ...baseEle, characterElement: charEl } as PlayerCombat,
    immortal,
    "테스터",
    {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: { learned: [ELE], equipped: [ELE] },
    } as never,
  );
  vi.restoreAllMocks();
  return res;
}

function playerCasts(res: BattleResolution): number {
  return res.finalState.log.filter(
    (e) =>
      (e as { kind?: string }).kind === "player_attack" &&
      typeof (e as { text?: string }).text === "string" &&
      (e as { text: string }).text.includes("마법"),
  ).length;
}
function enemyActions(res: BattleResolution): number {
  return res.finalState.log.filter((e) => (e as { kind?: string }).kind === "enemy_attack").length;
}

describe("PR-E1 통합: ATB 틱 반영", () => {
  it("바람 마법이 ATB 전투에서 시전된다(elementNamed 동적 표기)", () => {
    const res = run("wind");
    const windCasts = res.finalState.log.filter(
      (e) =>
        typeof (e as { text?: string }).text === "string" &&
        (e as { text: string }).text.includes("바람 마법"),
    ).length;
    expect(windCasts).toBeGreaterThan(0);
  });

  it("바람(가속) → 무속성보다 플레이어 행동 수가 많다", () => {
    const wind = playerCasts(run("wind"));
    const neutral = playerCasts(run("neutral"));
    expect(wind).toBeGreaterThan(neutral);
  });

  it("대지(지연) → 무속성보다 적 행동 수가 적다", () => {
    const earth = enemyActions(run("earth"));
    const neutral = enemyActions(run("neutral"));
    expect(earth).toBeLessThan(neutral);
  });
});
