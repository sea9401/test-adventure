import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: false, V2_ATB_SKILLS: false };
});

import type { Monster } from "@/adventure/data/monsters";
import {
  resolveBattle,
  type PlayerCombat,
} from "@/adventure/v2/combat/engine";

afterEach(() => vi.restoreAllMocks());

describe("레거시 몬스터 스킬 일반 회피 반응", () => {
  it("직접 피해를 경감하고 on_dodge 장비를 시전당 한 번 발동한다", () => {
    const player: PlayerCombat = {
      hp: 500,
      maxHp: 1_000,
      atk: 1_000,
      def: 0,
      spd: 5,
      evasionPct: 100,
      evaRating: 100,
      attackCount: 1,
      accuracyPct: 100,
      maxMp: 0,
      mp: 0,
      equipSignatures: [
        { trigger: "on_dodge", label: "해연", healPct: 6 },
      ],
    };
    const enemy: Monster = {
      name: "레거시 경감 시험체",
      tags: [],
      hp: 100,
      atk: 100,
      def: 0,
      spd: 30,
      accuracy: 0,
      exp: 0,
      evasionPct: 0,
      v2Skills: {
        learned: ["mob_crushing_blow"],
        equipped: ["mob_crushing_blow"],
      },
      v2MaxMp: 30,
    };
    const random = vi.spyOn(Math, "random").mockReturnValue(0);

    const result = resolveBattle(player, enemy, "그림자", {
      pickAction: () => ({ kind: "attack" }),
      potions: {},
      v2Skills: { learned: [], equipped: [] },
    } as never);

    const damageLog = result.finalState.log.find(
      (entry) =>
        entry.text.includes("분쇄 일격!") && entry.text.includes("피해를 입혔다"),
    );
    const damage = Number(damageLog?.text.match(/(\d+) 피해/)?.[1]);
    expect(damage).toBeGreaterThan(0);
    expect(result.finalState.playerHp).toBe(500 - damage + 60);
    expect(
      result.finalState.log.some((entry) => entry.text.includes("회피 경감")),
    ).toBe(true);
    expect(
      result.finalState.log.filter((entry) => entry.text.includes("[해연]")),
    ).toHaveLength(1);
    expect(random).toHaveBeenCalledTimes(3); // 적 proc + 회피 반응 + 플레이어 빈 스킬 proc
  });
});
