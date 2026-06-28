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
import { emptyV2SkillsState } from "@/adventure/data/v2/v2Skills";
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
    (l) => l.text.includes("출혈") && l.text.includes("피해를 입혔다"),
  );
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
});
