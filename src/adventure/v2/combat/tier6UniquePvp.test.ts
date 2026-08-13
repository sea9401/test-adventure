import { afterEach, describe, expect, it, vi } from "vitest";
import type { SignatureEffect } from "@/adventure/data/v2/v2Equipment";
import {
  advanceTurnPvP,
  initialBattleStatePvP,
} from "./engine-pvp";
import type { PlayerCombat } from "./engineState";

function player(over: Partial<PlayerCombat> = {}): PlayerCombat {
  return {
    hp: 2_000,
    maxHp: 2_000,
    atk: 100,
    def: 0,
    spd: 10,
    evasionPct: 0,
    accuracyPct: 100,
    attackCount: 1,
    critChancePct: 0,
    ...over,
  };
}

const pursuit: SignatureEffect = {
  trigger: "tier6_unique",
  mechanic: "pursuit_mark",
  label: "지평선 추적",
};

function signature(mechanic: NonNullable<SignatureEffect["mechanic"]>): SignatureEffect {
  return { trigger: "tier6_unique", mechanic, label: mechanic };
}

afterEach(() => vi.restoreAllMocks());

describe("6T 유니크 PvP 대칭 연동", () => {
  it("미장착 사이드는 런타임 키를 만들지 않고 장착 사이드만 초기화한다", () => {
    const state = initialBattleStatePvP(
      player({ equipSignatures: [pursuit] }),
      player(),
      "P1",
      "P2",
    );
    expect(state.p1.stacks.tier6Uniques).toBeDefined();
    expect(state.p2.stacks.tier6Uniques).toBeUndefined();
  });

  it("P1과 P2를 바꿔도 5번째 추적 사격의 피해·자원 결과가 같다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const fast = player({ spd: 100, equipSignatures: [pursuit] });
    const slow = player({ spd: 1 });

    const p1Initial = initialBattleStatePvP(fast, slow, "추적자", "상대");
    const p1Primed = {
      ...p1Initial,
      p1: {
        ...p1Initial.p1,
        stacks: {
          ...p1Initial.p1.stacks,
          tier6Uniques: {
            ...p1Initial.p1.stacks.tier6Uniques!,
            pursuitMarks: 4,
          },
        },
      },
    };
    const p1After = advanceTurnPvP(p1Primed);

    const p2Initial = initialBattleStatePvP(slow, fast, "상대", "추적자");
    const p2Primed = {
      ...p2Initial,
      p2: {
        ...p2Initial.p2,
        stacks: {
          ...p2Initial.p2.stacks,
          tier6Uniques: {
            ...p2Initial.p2.stacks.tier6Uniques!,
            pursuitMarks: 4,
          },
        },
      },
    };
    const p2After = advanceTurnPvP(p2Primed);

    expect(p1Initial.p2.hp - p1After.p2.hp).toBe(
      p2Initial.p1.hp - p2After.p1.hp,
    );
    expect(p1After.p1.stacks.tier6Uniques?.pursuitMarks).toBe(0);
    expect(p2After.p2.stacks.tier6Uniques?.pursuitMarks).toBe(0);
    expect(p1After.log.some((entry) => entry.text.includes("추적 사격")))
      .toBe(true);
    expect(p2After.log.some((entry) => entry.text.includes("추적 사격")))
      .toBe(true);
  });

  it("방어자 보호막 소진은 해당 사이드의 중력 반발에 저장된다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const gravity: SignatureEffect = {
      trigger: "tier6_unique",
      mechanic: "gravity_reprisal",
      label: "중력 반발",
    };
    const initial = initialBattleStatePvP(
      player({ spd: 100, atk: 500 }),
      player({ spd: 1, equipSignatures: [gravity] }),
      "공격자",
      "중력기사",
    );
    const shielded = {
      ...initial,
      p2: {
        ...initial.p2,
        stacks: { ...initial.p2.stacks, playerShield: 100 },
      },
    };
    const after = advanceTurnPvP(shielded);

    expect(after.p2.stacks.playerShield).toBe(0);
    expect(after.p2.stacks.tier6Uniques?.gravityReprisal).toBeGreaterThan(0);
  });

  it("방어자의 HP가 35% 이하가 되면 해당 사이드의 성역을 소비한다", () => {
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const initial = initialBattleStatePvP(
      player({ spd: 100, atk: 100 }),
      player({ spd: 1, equipSignatures: [signature("sanctuary_reserve")] }),
      "공격자",
      "성역기사",
    );
    const primed = {
      ...initial,
      p2: {
        ...initial.p2,
        hp: 700,
        stacks: {
          ...initial.p2.stacks,
          tier6Uniques: {
            ...initial.p2.stacks.tier6Uniques!,
            sanctuaryReserve: 300,
          },
        },
      },
    };
    const after = advanceTurnPvP(primed);

    expect(after.p2.hp).toBeGreaterThan(700);
    expect(after.p2.stacks.tier6Uniques?.sanctuaryReserve).toBe(0);
    expect(after.log.some((entry) => entry.text.includes("성역 소비")))
      .toBe(true);
  });
});
