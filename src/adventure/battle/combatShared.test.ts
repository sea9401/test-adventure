import { describe, it, expect, vi, afterEach } from "vitest";
import { rollAttackCount, potionHealAmount } from "./combatShared";
import type { PlayerCombat } from "./engine";
import type { Potion } from "../data/potions";

afterEach(() => vi.restoreAllMocks());

// rollAttackCount 가 읽는 필드만 채운 최소 PlayerCombat.
function combat(p: Partial<PlayerCombat>): PlayerCombat {
  return { attackCount: 1, ...p } as PlayerCombat;
}

describe("rollAttackCount (PvE/PvP 공유 — divergence 방지)", () => {
  it("추가확률 0 이면 base", () => {
    expect(rollAttackCount(combat({ attackCount: 1 }))).toBe(1);
    expect(rollAttackCount(combat({ attackCount: 2 }))).toBe(2);
  });

  it("100% 초과는 정수부만큼 확정 추가타 (random 무관)", () => {
    // 200% → +2 확정. (옛 PvP 판은 최대 +1 만 굴려 여기서 어긋났음.)
    vi.spyOn(Math, "random").mockReturnValue(0.99);
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 200 })),
    ).toBe(3);
  });

  it("나머지 %는 확률 굴림", () => {
    // 150% → +1 확정 + 50% 확률.
    vi.spyOn(Math, "random").mockReturnValue(0.4); // 40 < 50 → +1
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 150 })),
    ).toBe(3);
    vi.restoreAllMocks();
    vi.spyOn(Math, "random").mockReturnValue(0.6); // 60 >= 50 → +0
    expect(
      rollAttackCount(combat({ attackCount: 1, extraAttackChancePct: 150 })),
    ).toBe(2);
  });

  it("universalLuckBonusPct 가 추가확률에 가산", () => {
    // 60 + 60 = 120% → +1 확정 + 20% 확률.
    vi.spyOn(Math, "random").mockReturnValue(0.99); // 99 >= 20 → +0
    expect(
      rollAttackCount(
        combat({
          attackCount: 1,
          extraAttackChancePct: 60,
          universalLuckBonusPct: 60,
        }),
      ),
    ).toBe(2);
  });
});

describe("potionHealAmount", () => {
  const potion: Potion = {
    id: "potion_heal_s",
    name: "테스트 회복약",
    effect: { kind: "heal_hp", flat: 20, pct: 0 },
  } as Potion;

  it("potionHealPct 0 이면 computeHealAmount 그대로 (flat 20)", () => {
    expect(potionHealAmount(potion, 100, 0)).toBe(20);
  });

  it("potionHealPct 가산 후 floor", () => {
    expect(potionHealAmount(potion, 100, 50)).toBe(30); // floor(20 * 1.5)
  });
});
