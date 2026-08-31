import {
  DANGEROUS_BAITS,
  DANGEROUS_LINES,
  DANGEROUS_REELS,
  DANGEROUS_RODS,
  isDangerousBaitId,
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  type DangerousBaitId,
  type DangerousGearKind,
  type DangerousLineId,
  type DangerousReelId,
  type DangerousRodId,
} from "@/adventure/data/v2/dangerousFishing";
import type { DangerousFishingState } from "./dangerousFishingState";

type GearPurchaseError =
  | "invalid_item"
  | "already_owned"
  | "insufficient_coins";

type GearPurchaseResult =
  | { ok: true; state: DangerousFishingState; coins: number }
  | {
      ok: false;
      error: GearPurchaseError;
      state: DangerousFishingState;
      coins: number;
    };

function normalizedCoins(coins: number): number {
  return Number.isFinite(coins) ? Math.max(0, Math.floor(coins)) : 0;
}

function gearInfo(kind: DangerousGearKind, id: string) {
  if (kind === "rod" && isDangerousRodId(id)) {
    return {
      id,
      price: DANGEROUS_RODS[id].price,
      ownedKey: "rods" as const,
    };
  }
  if (kind === "reel" && isDangerousReelId(id)) {
    return {
      id,
      price: DANGEROUS_REELS[id].price,
      ownedKey: "reels" as const,
    };
  }
  if (kind === "line" && isDangerousLineId(id)) {
    return {
      id,
      price: DANGEROUS_LINES[id].price,
      ownedKey: "lines" as const,
    };
  }
  return null;
}

export function buyDangerousGear(
  state: DangerousFishingState,
  walletCoins: number,
  kind: DangerousGearKind,
  id: string,
): GearPurchaseResult {
  const coins = normalizedCoins(walletCoins);
  const gear = gearInfo(kind, id);
  if (!gear) return { ok: false, error: "invalid_item", state, coins };
  const owned = state.ownedGear[gear.ownedKey] as string[];
  if (owned.includes(gear.id)) {
    return { ok: false, error: "already_owned", state, coins };
  }
  if (coins < gear.price) {
    return { ok: false, error: "insufficient_coins", state, coins };
  }

  const ownedGear = { ...state.ownedGear };
  if (gear.ownedKey === "rods") {
    ownedGear.rods = [...state.ownedGear.rods, gear.id as DangerousRodId];
  } else if (gear.ownedKey === "reels") {
    ownedGear.reels = [...state.ownedGear.reels, gear.id as DangerousReelId];
  } else {
    ownedGear.lines = [...state.ownedGear.lines, gear.id as DangerousLineId];
  }
  return {
    ok: true,
    state: { ...state, ownedGear },
    coins: coins - gear.price,
  };
}

export function equipDangerousGear(
  state: DangerousFishingState,
  kind: DangerousGearKind,
  id: string,
):
  | { ok: true; state: DangerousFishingState }
  | {
      ok: false;
      error: "invalid_item" | "not_owned";
      state: DangerousFishingState;
    } {
  const gear = gearInfo(kind, id);
  if (!gear) return { ok: false, error: "invalid_item", state };
  const owned = state.ownedGear[gear.ownedKey] as string[];
  if (!owned.includes(gear.id)) return { ok: false, error: "not_owned", state };

  if (kind === "rod") {
    return {
      ok: true,
      state: {
        ...state,
        loadout: { ...state.loadout, rodId: gear.id as DangerousRodId },
      },
    };
  }
  if (kind === "reel") {
    return {
      ok: true,
      state: {
        ...state,
        loadout: { ...state.loadout, reelId: gear.id as DangerousReelId },
      },
    };
  }
  return {
    ok: true,
    state: {
      ...state,
      loadout: { ...state.loadout, lineId: gear.id as DangerousLineId },
    },
  };
}

export function buyDangerousBaitPack(
  state: DangerousFishingState,
  walletCoins: number,
  baitId: string,
):
  | { ok: true; state: DangerousFishingState; coins: number }
  | {
      ok: false;
      error: "invalid_item" | "already_unlimited" | "insufficient_coins";
      state: DangerousFishingState;
      coins: number;
    } {
  const coins = normalizedCoins(walletCoins);
  if (!isDangerousBaitId(baitId)) {
    return { ok: false, error: "invalid_item", state, coins };
  }
  const bait = DANGEROUS_BAITS[baitId];
  if (bait.unlimited) {
    return { ok: false, error: "already_unlimited", state, coins };
  }
  if (coins < bait.price) {
    return { ok: false, error: "insufficient_coins", state, coins };
  }
  return {
    ok: true,
    state: {
      ...state,
      baitCounts: {
        ...state.baitCounts,
        [baitId]: (state.baitCounts[baitId] ?? 0) + bait.packSize,
      },
    },
    coins: coins - bait.price,
  };
}

export function consumeDangerousBait(
  state: DangerousFishingState,
  baitId: DangerousBaitId,
):
  | { ok: true; consumed: boolean; state: DangerousFishingState }
  | { ok: false; error: "out_of_bait"; state: DangerousFishingState } {
  if (DANGEROUS_BAITS[baitId].unlimited) {
    return { ok: true, consumed: false, state };
  }
  const count = state.baitCounts[baitId] ?? 0;
  if (count <= 0) return { ok: false, error: "out_of_bait", state };
  const baitCounts = { ...state.baitCounts };
  if (count === 1) delete baitCounts[baitId];
  else baitCounts[baitId] = count - 1;
  return {
    ok: true,
    consumed: true,
    state: {
      ...state,
      loadout: { ...state.loadout, baitId },
      baitCounts,
    },
  };
}
