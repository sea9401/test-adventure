import {
  V2_CORE_LOOP_V2,
  spendGoldWith,
} from "@/adventure/data/v2/coreLoopConfig";

type ArenaTournamentBetBalance = {
  ok: boolean;
  gold: number;
  bankedGold: number;
  availableGold: number;
};

function nonNegativeInt(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.floor(value))
    : 0;
}

export function spendArenaTournamentBetGoldWith(
  value: unknown,
  amount: number,
  bankFirst: boolean,
): ArenaTournamentBetBalance {
  const raw = (value ?? {}) as { gold?: unknown; bankedGold?: unknown };
  const gold = nonNegativeInt(raw.gold);
  const bankedGold = nonNegativeInt(raw.bankedGold);
  return {
    ...spendGoldWith(gold, bankedGold, amount, bankFirst),
    availableGold: bankFirst ? gold + bankedGold : gold,
  };
}

export function spendArenaTournamentBetGold(
  value: unknown,
  amount: number,
): ArenaTournamentBetBalance {
  return spendArenaTournamentBetGoldWith(
    value,
    amount,
    V2_CORE_LOOP_V2,
  );
}
