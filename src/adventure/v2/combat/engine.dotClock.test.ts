// DoT 행동 틱(ATB) — 출혈/중독/연소가 대상의 행동 시작 시 먼저 틱하는지 검증.
// 라이브(V2_CORE_LOOP_V2=ATB) 경로 전용.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true, V2_ATB_SKILLS: true };
});

import { resolveBattle, type PlayerCombat } from "./engine";
import { pickAutoAction } from "./pickAutoAction";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import {
  emptyV2SkillsState,
  V2_SKILLS,
} from "@/adventure/data/v2/v2Skills";
import { derivePlayerCombatV2Pure } from "@/lib/server/derivePlayerCombatV2";
import { BLEED_ATK_COEF_PER_STACK } from "@/adventure/data/v2/v2CombatConstants";
import type { Monster } from "@/adventure/data/monsters";
import { actionInterval, effectiveMonsterSpd } from "./combatTimeline";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

afterEach(() => vi.restoreAllMocks());

const derive = (over: Partial<PlayerCombat> = {}): PlayerCombat => ({
  ...derivePlayerCombatV2Pure({
    level: 50,
    playerClass: "warrior",
    allocatedStats: { str: 120, vit: 40 },
    v2Equipped: { weapon: "v2_greatsword" } as never,
  }).player,
  ...over,
});
const m = (k: string): Monster => V2_MONSTERS[k];

function bleedTicks(log: { text: string; t?: number; turn?: "player" | "enemy" }[]) {
  return log.filter(
    (l) => l.text.includes("출혈로") && l.text.includes("피해를 입었다"),
  );
}

function firstBleedDamage(
  log: { text: string; t?: number; turn?: "player" | "enemy" }[],
): number {
  const match = bleedTicks(log)[0]?.text.match(/출혈로 (\d+) 피해/);
  return Number(match?.[1] ?? 0);
}

function firstPoisonDamage(
  log: { text: string; t?: number; turn?: "player" | "enemy" }[],
): number {
  const match = log
    .find((entry) => entry.text.includes("중독으로"))
    ?.text.match(/중독으로 (\d+) 피해/);
  return Number(match?.[1] ?? 0);
}

describe("DoT 행동 틱 (ATB) — 대상 행동 시작 시 틱", () => {
  it("적에게 걸린 출혈은 적 행동 tick 에 붙는다", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(1));
    const bleeder = derive({
      bleedOnHit: {
        flatPerStack: 10,
        atkCoefPerStack: BLEED_ATK_COEF_PER_STACK,
      },
    });
    const enemy = m("부서진 골렘");
    const enemyActionInterval = actionInterval(effectiveMonsterSpd(enemy.spd));
    const res = resolveBattle(bleeder, enemy, "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    const ticks = bleedTicks(res.finalState.log);
    expect(ticks.length).toBeGreaterThan(0); // DoT 가 실제로 틱함
    // 핵심: 적에게 걸린 출혈은 적 행동 묶음에 붙고, 첫 틱은 적의 첫 행동 tick 에서 발생한다.
    expect(ticks[0].t).toBe(enemyActionInterval);
    for (const tk of ticks) {
      expect(typeof tk.t).toBe("number");
      expect(tk.turn).toBe("enemy");
    }
  });

  it("DoT 미보유 빌드는 출혈 틱이 없다 (누출 가드)", () => {
    vi.spyOn(Math, "random").mockImplementation(mulberry32(1));
    const plain = derive();
    const res = resolveBattle(plain, m("부서진 골렘"), "용사", {
      pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
      potions: {},
      v2Skills: emptyV2SkillsState(),
    });
    expect(bleedTicks(res.finalState.log).length).toBe(0);
  });

  it("몬스터의 상태 피해 감소가 실제 적 DoT 틱에 적용된다", () => {
    const bleeder = derive({
      bleedOnHit: { flatPerStack: 100, atkCoefPerStack: 0 },
    });
    const baseEnemy = { ...m("부서진 골렘"), hp: 10_000, atk: 1 };
    const run = (statusDamageReductionPct?: number) => {
      vi.spyOn(Math, "random").mockImplementation(mulberry32(7));
      return resolveBattle(
        bleeder,
        { ...baseEnemy, statusDamageReductionPct },
        "용사",
        {
          pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
          potions: {},
          v2Skills: emptyV2SkillsState(),
        },
      );
    };

    const normalDamage = firstBleedDamage(run().finalState.log);
    const reducedDamage = firstBleedDamage(run(50).finalState.log);
    expect(normalDamage).toBeGreaterThan(0);
    expect(reducedDamage).toBe(Math.floor(normalDamage * 0.5));
  });

  it("만독개화의 침식은 ATB 사냥에서 중독 피해를 28% 증폭한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.1);
    const venomer: PlayerCombat = {
      hp: 10_000,
      maxHp: 10_000,
      atk: 100,
      def: 100,
      spd: 100,
      evasionPct: 0,
      attackCount: 1,
      accuracyPct: 100,
      maxMp: 100_000,
      mp: 100_000,
    };
    const enemy: Monster = {
      name: "침식 허수아비",
      tags: [],
      hp: 100_000,
      atk: 1,
      def: 1_000,
      spd: 10,
      exp: 0,
      evasionPct: 0,
    };
    const skill = V2_SKILLS.v2c_myriadvenom_mutation;
    const erosion = skill.effects.find(
      (effect) => effect.kind === "enemyDotVuln",
    );
    expect(erosion).toBeDefined();
    const mutableErosion = erosion as { pct: number };
    const originalPct = mutableErosion.pct;
    const run = () =>
      resolveBattle(venomer, enemy, "테스터", {
        pickAction: () => ({ kind: "attack" }),
        potions: {},
        v2Skills: {
          learned: ["v2c_myriadvenom_mutation"],
          equipped: ["v2c_myriadvenom_mutation"],
        },
        maxTurns: 5,
      });

    try {
      mutableErosion.pct = 0;
      const baseDamage = firstPoisonDamage(run().finalState.log);
      mutableErosion.pct = originalPct;
      const amplifiedDamage = firstPoisonDamage(run().finalState.log);

      expect(baseDamage).toBeGreaterThan(0);
      expect(amplifiedDamage).toBe(Math.floor(baseDamage * 1.28));
    } finally {
      mutableErosion.pct = originalPct;
    }
  });

  it("ATB 보스는 중독의 최대 HP 비례 피해를 20% 감소해 받는다", () => {
    const venomer = derive({
      atk: 100,
      spd: 10,
      poisonOnHit: { pctMaxHpPerStack: 0.0005 },
    });
    const enemy: Monster = {
      ...m("부서진 골렘"),
      hp: 100_000,
      atk: 1,
      def: 0,
      spd: 10,
    };
    const run = (isBoss: boolean) => {
      vi.spyOn(Math, "random").mockImplementation(mulberry32(11));
      return resolveBattle(venomer, enemy, "용사", {
        pickAction: (s) => pickAutoAction(s, { rules: [], potions: {} }),
        potions: {},
        v2Skills: emptyV2SkillsState(),
        isBoss,
        maxTurns: 3,
      });
    };

    const normalDamage = firstPoisonDamage(run(false).finalState.log);
    const bossDamage = firstPoisonDamage(run(true).finalState.log);
    expect(normalDamage).toBe(50);
    expect(bossDamage).toBe(40);
  });
});
