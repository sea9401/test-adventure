import { describe, expect, it, vi } from "vitest";

vi.mock("@/adventure/data/v2/coreLoopConfig", async (importActual) => {
  const actual =
    await importActual<typeof import("@/adventure/data/v2/coreLoopConfig")>();
  return { ...actual, V2_CORE_LOOP_V2: true };
});

import {
  spendArenaTournamentBetGold,
  spendArenaTournamentBetGoldWith,
} from "./arenaTournamentBetGold";

describe("arena tournament bet gold", () => {
  it("은행 잔액만으로 베팅 금액을 전액 충당한다", () => {
    expect(
      spendArenaTournamentBetGold({ gold: 0, bankedGold: 10_000 }, 3_000),
    ).toEqual({
      ok: true,
      gold: 0,
      bankedGold: 7_000,
      availableGold: 10_000,
    });
  });

  it("은행을 먼저 소진하고 부족분만 지갑에서 차감한다", () => {
    expect(
      spendArenaTournamentBetGoldWith(
        { gold: 5_000, bankedGold: 2_000 },
        4_000,
        true,
      ),
    ).toEqual({
      ok: true,
      gold: 3_000,
      bankedGold: 0,
      availableGold: 7_000,
    });
  });

  it("지갑과 은행 합계가 부족하면 두 잔액을 보존한다", () => {
    expect(
      spendArenaTournamentBetGoldWith(
        { gold: 500, bankedGold: 1_000 },
        2_000,
        true,
      ),
    ).toEqual({
      ok: false,
      gold: 500,
      bankedGold: 1_000,
      availableGold: 1_500,
    });
  });
});
