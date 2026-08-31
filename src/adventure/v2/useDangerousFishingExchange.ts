"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DANGEROUS_BAITS,
  DANGEROUS_FISHING_MATERIALS,
  isDangerousBaitId,
  isDangerousCatchMaterialId,
  isDangerousLineId,
  isDangerousReelId,
  isDangerousRodId,
  type DangerousFishRarity,
  type DangerousGearKind,
} from "@/adventure/data/v2/dangerousFishing";
import { materialSellPriceOf } from "@/adventure/data/v2/dungeonDrops";
import { useSingleFlightGuard } from "@/lib/useSingleFlight";
import type { DangerousFishingState } from "./dangerousFishingState";
import {
  DANGEROUS_FISHING_EXCHANGE_ENTRIES,
  type DangerousFishingExchangeEntry,
} from "./dangerousFishingExchange";
import { DANGEROUS_GEAR_ENHANCEMENT_COSTS } from "./dangerousFishingEnhancement";
import type { BuyResult } from "./useFishingShop";
import { useGameResourceState } from "./GameStateProvider";
import { shopSaleBalancePatch } from "./shopSaleBalance";

export type DangerousFishingExchangeEntryView =
  DangerousFishingExchangeEntry & {
    alreadyOwned: boolean;
    maxBatches: number;
  };

export type DangerousFishingExchangeViewModel = {
  ok: true;
  unlocked: boolean;
  requiredLevel: number;
  fishingLevel: number;
  materials: Record<string, number>;
  fishingCoins: number;
  state: Pick<
    DangerousFishingState,
    "ownedGear" | "baitCounts" | "gearEnhancements"
  >;
  enhancementCosts: Record<
    1 | 2 | 3,
    DangerousFishingEnhancementCost
  >;
  enhancementItems: DangerousFishingEnhancementItemView[];
  ownedTitleIds: string[];
  ownedCosmeticIds: string[];
  entries: DangerousFishingExchangeEntryView[];
};

export type DangerousFishingEnhancementCost = {
  materials: Partial<Record<DangerousFishRarity, number>>;
  fishingCoins: number;
};

export type DangerousFishingEnhancementItemView = {
  gearKind: DangerousGearKind;
  gearId: string;
  level: number;
  nextEnhancement: {
    level: 1 | 2 | 3;
    cost: DangerousFishingEnhancementCost;
    affordable: boolean;
  } | null;
};

export type DangerousFishingExchangeRequest = {
  operationId: string;
  entryId: string;
  batches: number;
  selectedMaterials?: Record<string, number>;
};

export type DangerousFishingEnhanceRequest = {
  operationId: string;
  gearKind: DangerousGearKind;
  gearId: string;
  expectedCurrentLevel: number;
  expectedNextLevel: 1 | 2 | 3;
};

export type DangerousFishingExchangeResult = BuyResult & {
  fishingCoins?: number;
  alreadyProcessed?: boolean;
  nextLevel?: number;
};

export type DangerousFishingCatchSaleResult = BuyResult & {
  gold?: number;
  bankedGold?: number;
  materials?: Record<string, number>;
  sold?: { id: string; count: number; gold: number };
  refreshFailed?: boolean;
};

export function dangerousFishingExchangeMessage(
  ok: boolean,
  error?: string,
  alreadyProcessed = false,
): string {
  if (ok) {
    return alreadyProcessed
      ? "이미 처리된 교환을 확인했다. 추가 차감은 없었다."
      : "위험 해역 교환을 완료했다.";
  }
  if (error === "fishing_level_locked") return "낚시 15레벨부터 교환할 수 있다.";
  if (error === "insufficient_materials") return "교환에 필요한 재료가 부족하다.";
  if (error === "insufficient_coins") return "교환에 필요한 낚시 코인이 부족하다.";
  if (error === "already_owned") return "이미 보유한 보상이다.";
  if (error === "invalid_material_selection") return "납품할 어획물 구성이 올바르지 않다.";
  if (error === "invalid_quantity") return "교환 횟수를 다시 확인해 주세요.";
  if (error === "invalid_entry" || error === "bad_request") return "교환할 수 없는 항목이다.";
  return "교환 처리 중 문제가 생겼다. 같은 확인창에서 다시 시도해 주세요.";
}

export function dangerousFishingEnhancementMessage(
  ok: boolean,
  error?: string,
  alreadyProcessed = false,
  nextLevel?: number,
): string {
  if (ok) {
    return alreadyProcessed
      ? "이미 처리된 강화를 확인했다. 추가 차감은 없었다."
      : `위험 해역 장비를 +${nextLevel ?? 0} 강화했다.`;
  }
  if (error === "insufficient_materials") return "강화에 필요한 등급별 어획물이 부족하다.";
  if (error === "insufficient_coins") return "강화에 필요한 낚시 코인이 부족하다.";
  if (error === "not_owned") return "보유하지 않은 위험 해역 장비다.";
  if (error === "max_level") return "이미 최대 +3 강화 상태다.";
  if (error === "stale_enhancement") return "강화 단계가 다른 곳에서 변경됐다. 최신 상태를 확인하고 다시 선택해 주세요.";
  if (error === "operation_conflict") return "이 강화 확인 번호가 다른 요청에 사용됐다. 확인창을 닫고 다시 선택해 주세요.";
  if (error === "invalid_kind" || error === "invalid_item" || error === "bad_request") {
    return "강화할 수 없는 장비다.";
  }
  return "강화 처리 중 문제가 생겼다. 같은 확인창에서 다시 시도해 주세요.";
}

function dangerousFishingCatchSaleMessage(
  ok: boolean,
  args: {
    materialId: string;
    count?: number;
    gold?: number;
    error?: string;
    refreshFailed?: boolean;
  },
): string {
  if (ok) {
    const name = DANGEROUS_FISHING_MATERIALS[args.materialId]?.name ?? "어획물";
    const message = `${name} ${args.count ?? 0}개를 판매해 은행에 ${(args.gold ?? 0).toLocaleString()}골드를 입금했다.`;
    return args.refreshFailed
      ? `${message} 판매는 완료됐지만 교환 목록 새로고침에는 실패했다.`
      : message;
  }
  if (args.error === "invalid_amount") return "판매 수량은 보유량 이내의 양의 정수여야 한다.";
  if (args.error === "not_owned") return "보유 어획물이 바뀌어 판매하지 못했다. 잔액을 새로 확인했다.";
  if (args.error === "not_sellable" || args.error === "invalid_id") {
    return "NPC에게 판매할 수 없는 재료다.";
  }
  if (args.error === "rate_limited") return "판매 요청이 많다. 잠시 후 다시 시도해 주세요.";
  return "어획물 판매 중 문제가 생겼다.";
}

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return Boolean(raw && typeof raw === "object" && !Array.isArray(raw));
}

function isSafeNonnegativeInteger(raw: unknown): raw is number {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= 0;
}

function hasExactKeys(raw: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(raw);
  return actual.length === keys.length && keys.every((key) => key in raw);
}

function sameData(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameData(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every((key) => key in right && sameData(left[key], right[key]))
  );
}

function readDangerousMaterialBalances(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const materials: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (!isDangerousCatchMaterialId(id) || !isSafeNonnegativeInteger(count)) {
      return null;
    }
    materials[id] = count;
  }
  return materials;
}

function readSaleMaterialBalances(raw: unknown): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const materials: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (typeof count !== "number" || !Number.isFinite(count) || count <= 0) continue;
    materials[id] = Math.floor(count);
  }
  return materials;
}

function readUniqueStrings(raw: unknown): string[] | null {
  if (!Array.isArray(raw) || !raw.every((item) => typeof item === "string")) {
    return null;
  }
  return new Set(raw).size === raw.length ? raw : null;
}

function readOwnedIds(
  raw: unknown,
  validate: (id: unknown) => boolean,
): string[] | null {
  const ids = readUniqueStrings(raw);
  return ids && ids.every(validate) ? ids : null;
}

function readCountRecord(
  raw: unknown,
  validateId: (id: unknown) => boolean,
  validateCount: (count: unknown) => boolean = isSafeNonnegativeInteger,
): Record<string, number> | null {
  if (!isRecord(raw)) return null;
  const result: Record<string, number> = {};
  for (const [id, count] of Object.entries(raw)) {
    if (!validateId(id) || !validateCount(count)) return null;
    result[id] = count as number;
  }
  return result;
}

function readEnhancementCost(raw: unknown, level: 1 | 2 | 3) {
  if (!sameData(raw, DANGEROUS_GEAR_ENHANCEMENT_COSTS[level])) return null;
  return DANGEROUS_GEAR_ENHANCEMENT_COSTS[level];
}

function parseExchangeView(
  raw: unknown,
  expectedOk: true | false = true,
): DangerousFishingExchangeViewModel | null {
  if (!isRecord(raw)) return null;
  const view = raw;
  const materials = readDangerousMaterialBalances(view.materials);
  if (
    view.ok !== expectedOk ||
    typeof view.unlocked !== "boolean" ||
    !isSafeNonnegativeInteger(view.requiredLevel) ||
    !isSafeNonnegativeInteger(view.fishingLevel) ||
    !isSafeNonnegativeInteger(view.fishingCoins) ||
    !materials ||
    !isRecord(view.state) ||
    !hasExactKeys(view.state, ["ownedGear", "baitCounts", "gearEnhancements"]) ||
    !isRecord(view.enhancementCosts) ||
    !hasExactKeys(view.enhancementCosts, ["1", "2", "3"]) ||
    !Array.isArray(view.enhancementItems) ||
    !Array.isArray(view.entries)
  ) {
    return null;
  }
  const cost1 = readEnhancementCost(view.enhancementCosts[1], 1);
  const cost2 = readEnhancementCost(view.enhancementCosts[2], 2);
  const cost3 = readEnhancementCost(view.enhancementCosts[3], 3);
  if (!cost1 || !cost2 || !cost3) return null;
  const costs = { 1: cost1, 2: cost2, 3: cost3 };

  const ownedGearRaw = view.state.ownedGear;
  if (!isRecord(ownedGearRaw) || !hasExactKeys(ownedGearRaw, ["rods", "reels", "lines"])) {
    return null;
  }
  const rods = readOwnedIds(ownedGearRaw.rods, isDangerousRodId);
  const reels = readOwnedIds(ownedGearRaw.reels, isDangerousReelId);
  const lines = readOwnedIds(ownedGearRaw.lines, isDangerousLineId);
  const baitCounts = readCountRecord(
    view.state.baitCounts,
    (id) => isDangerousBaitId(id) && id in DANGEROUS_BAITS,
  );
  const enhancementsRaw = view.state.gearEnhancements;
  if (
    !rods ||
    !reels ||
    !lines ||
    !baitCounts ||
    !isRecord(enhancementsRaw) ||
    !hasExactKeys(enhancementsRaw, ["rods", "reels", "lines"])
  ) {
    return null;
  }
  const enhancementLevel = (value: unknown) =>
    isSafeNonnegativeInteger(value) && value <= 3;
  const rodLevels = readCountRecord(
    enhancementsRaw.rods,
    (id) => isDangerousRodId(id) && rods.includes(id),
    enhancementLevel,
  );
  const reelLevels = readCountRecord(
    enhancementsRaw.reels,
    (id) => isDangerousReelId(id) && reels.includes(id),
    enhancementLevel,
  );
  const lineLevels = readCountRecord(
    enhancementsRaw.lines,
    (id) => isDangerousLineId(id) && lines.includes(id),
    enhancementLevel,
  );
  if (!rodLevels || !reelLevels || !lineLevels) return null;

  const ownedKeys = new Set([
    ...rods.map((id) => `rod:${id}`),
    ...reels.map((id) => `reel:${id}`),
    ...lines.map((id) => `line:${id}`),
  ]);
  const seenItems = new Set<string>();
  const enhancementItems: DangerousFishingEnhancementItemView[] = [];
  for (const rawItem of view.enhancementItems) {
    if (!isRecord(rawItem) || !hasExactKeys(rawItem, ["gearKind", "gearId", "level", "nextEnhancement"])) {
      return null;
    }
    const { gearKind, gearId, level } = rawItem;
    const validId =
      (gearKind === "rod" && isDangerousRodId(gearId)) ||
      (gearKind === "reel" && isDangerousReelId(gearId)) ||
      (gearKind === "line" && isDangerousLineId(gearId));
    if (!validId || !isSafeNonnegativeInteger(level) || level > 3) return null;
    const itemKey = `${gearKind}:${gearId}`;
    const levels = gearKind === "rod" ? rodLevels : gearKind === "reel" ? reelLevels : lineLevels;
    if (!ownedKeys.has(itemKey) || seenItems.has(itemKey) || (levels[gearId] ?? 0) !== level) {
      return null;
    }
    seenItems.add(itemKey);
    if (level === 3) {
      if (rawItem.nextEnhancement !== null) return null;
      enhancementItems.push({ gearKind, gearId, level, nextEnhancement: null });
      continue;
    }
    if (!isRecord(rawItem.nextEnhancement) || !hasExactKeys(rawItem.nextEnhancement, ["level", "cost", "affordable"])) {
      return null;
    }
    const nextLevel = (level + 1) as 1 | 2 | 3;
    if (
      rawItem.nextEnhancement.level !== nextLevel ||
      typeof rawItem.nextEnhancement.affordable !== "boolean" ||
      !readEnhancementCost(rawItem.nextEnhancement.cost, nextLevel)
    ) {
      return null;
    }
    enhancementItems.push({
      gearKind,
      gearId,
      level,
      nextEnhancement: {
        level: nextLevel,
        cost: costs[nextLevel],
        affordable: rawItem.nextEnhancement.affordable,
      },
    });
  }
  if (seenItems.size !== ownedKeys.size) return null;

  const ownedTitleIds = readUniqueStrings(view.ownedTitleIds);
  const ownedCosmeticIds = readUniqueStrings(view.ownedCosmeticIds);
  if (!ownedTitleIds || !ownedCosmeticIds || view.entries.length !== DANGEROUS_FISHING_EXCHANGE_ENTRIES.length) {
    return null;
  }
  const entryCatalog = new Map(DANGEROUS_FISHING_EXCHANGE_ENTRIES.map((entry) => [entry.id, entry]));
  const seenEntries = new Set<string>();
  const entries: DangerousFishingExchangeEntryView[] = [];
  for (const rawEntry of view.entries) {
    if (!isRecord(rawEntry) || !hasExactKeys(rawEntry, ["id", "name", "description", "cost", "output", "repeatable", "alreadyOwned", "maxBatches"])) {
      return null;
    }
    const catalogEntry = typeof rawEntry.id === "string" ? entryCatalog.get(rawEntry.id) : undefined;
    if (
      !catalogEntry ||
      seenEntries.has(catalogEntry.id) ||
      typeof rawEntry.alreadyOwned !== "boolean" ||
      !isSafeNonnegativeInteger(rawEntry.maxBatches) ||
      rawEntry.maxBatches > 100 ||
      !sameData(
        {
          id: rawEntry.id,
          name: rawEntry.name,
          description: rawEntry.description,
          cost: rawEntry.cost,
          output: rawEntry.output,
          repeatable: rawEntry.repeatable,
        },
        catalogEntry,
      )
    ) {
      return null;
    }
    seenEntries.add(catalogEntry.id);
    entries.push({
      ...catalogEntry,
      alreadyOwned: rawEntry.alreadyOwned,
      maxBatches: rawEntry.maxBatches,
    });
  }

  return {
    ok: true,
    unlocked: view.unlocked,
    requiredLevel: view.requiredLevel,
    fishingLevel: view.fishingLevel,
    materials,
    fishingCoins: view.fishingCoins,
    state: {
      ownedGear: { rods, reels, lines },
      baitCounts,
      gearEnhancements: {
        rods: rodLevels,
        reels: reelLevels,
        lines: lineLevels,
      },
    } as DangerousFishingExchangeViewModel["state"],
    enhancementCosts: costs,
    enhancementItems,
    ownedTitleIds,
    ownedCosmeticIds,
    entries,
  };
}

export function useDangerousFishingExchange() {
  const { applyResourcePatch } = useGameResourceState();
  const [model, setModel] =
    useState<DangerousFishingExchangeViewModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState<string | null>(null);
  const [sellingCatch, setSellingCatch] = useState<string | null>(null);
  const beginExchange = useSingleFlightGuard();
  const beginCatchSale = useSingleFlightGuard();

  const refresh = useCallback(async (silent = false) => {
    try {
      const response = await fetch("/api/v2/dangerous-fishing/exchange");
      const json = await response.json().catch(() => null);
      const view = parseExchangeView(json);
      if (!response.ok || !view) throw new Error("load_failed");
      setModel(view);
      setError(null);
      return true;
    } catch {
      if (!silent) setError("위험 해역 교환 목록을 불러오지 못했다.");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void refresh(), 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  const submitExchange = useCallback(
    async (
      request:
        | DangerousFishingExchangeRequest
        | ({ action: "enhance" } & DangerousFishingEnhanceRequest),
    ): Promise<DangerousFishingExchangeResult> => {
      const release = beginExchange();
      if (!release) {
        return { ok: false, message: "다른 교환을 처리하고 있다." };
      }
      const enhancement = "action" in request && request.action === "enhance";
      setExchanging(
        "action" in request
          ? `enhance:${request.gearKind}:${request.gearId}`
          : request.entryId,
      );
      try {
        const response = await fetch("/api/v2/dangerous-fishing/exchange", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(request),
        });
        const json = (await response.json().catch(() => null)) as
          | (Record<string, unknown> & { ok?: boolean; error?: string })
          | null;
        if (response.ok && json?.ok === true) {
          const next = parseExchangeView(json);
          const responseMatchesEnhancement =
            !enhancement ||
            (json.operationId === request.operationId &&
              json.gearKind === request.gearKind &&
              json.gearId === request.gearId &&
              json.nextLevel === request.expectedNextLevel &&
              next?.enhancementItems.some(
                (item) =>
                  item.gearKind === request.gearKind &&
                  item.gearId === request.gearId &&
                  item.level === request.expectedNextLevel,
              ) === true);
          if (!next || !responseMatchesEnhancement) {
            return {
              ok: false,
              message: enhancement
                ? dangerousFishingEnhancementMessage(false, "protocol")
                : dangerousFishingExchangeMessage(false, "protocol"),
            };
          }
          setModel(next);
          setError(null);
          const alreadyProcessed = json.alreadyProcessed === true;
          const nextLevel =
            json.nextLevel === 1 || json.nextLevel === 2 || json.nextLevel === 3
              ? json.nextLevel
              : undefined;
          return {
            ok: true,
            message: enhancement
              ? dangerousFishingEnhancementMessage(
                  true,
                  undefined,
                  alreadyProcessed,
                  nextLevel,
                )
              : dangerousFishingExchangeMessage(true, undefined, alreadyProcessed),
            fishingCoins: next.fishingCoins,
            alreadyProcessed,
            ...(nextLevel !== undefined ? { nextLevel } : {}),
          };
        }
        const code = typeof json?.error === "string" ? json.error : "network";
        if (enhancement && code === "stale_enhancement") {
          const authoritative = parseExchangeView(json, false);
          if (authoritative) {
            setModel(authoritative);
            setError(null);
          }
        }
        if (
          enhancement &&
          (code === "insufficient_materials" || code === "insufficient_coins")
        ) {
          await refresh(true);
        }
        return {
          ok: false,
          message: enhancement
            ? dangerousFishingEnhancementMessage(false, code)
            : dangerousFishingExchangeMessage(false, code),
        };
      } catch {
        return {
          ok: false,
          message:
            "action" in request && request.action === "enhance"
              ? dangerousFishingEnhancementMessage(false, "network")
              : dangerousFishingExchangeMessage(false, "network"),
        };
      } finally {
        release();
        setExchanging(null);
      }
    },
    [beginExchange, refresh],
  );

  const exchange = useCallback(
    (request: DangerousFishingExchangeRequest) => submitExchange(request),
    [submitExchange],
  );

  const enhanceGear = useCallback(
    (request: DangerousFishingEnhanceRequest) =>
      submitExchange({ action: "enhance", ...request }),
    [submitExchange],
  );

  const sellCatch = useCallback(
    async (
      materialId: string,
      amount: number,
    ): Promise<DangerousFishingCatchSaleResult> => {
      const owned = Math.max(0, Math.floor(model?.materials[materialId] ?? 0));
      if (
        materialSellPriceOf(materialId) == null ||
        !Number.isInteger(amount) ||
        amount <= 0 ||
        amount > owned
      ) {
        return {
          ok: false,
          message: dangerousFishingCatchSaleMessage(false, {
            materialId,
            error: "invalid_amount",
          }),
        };
      }
      const release = beginCatchSale();
      if (!release) {
        return { ok: false, message: "다른 어획물 판매를 처리하고 있다." };
      }
      setSellingCatch(materialId);
      try {
        const response = await fetch("/api/v2/shop/material/sell", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id: materialId, amount }),
        });
        const json = (await response.json().catch(() => null)) as
          | {
              ok?: boolean;
              error?: string;
              gold?: unknown;
              bankedGold?: unknown;
              materials?: unknown;
              sold?: { id?: unknown; count?: unknown; gold?: unknown };
            }
          | null;
        const materials = readSaleMaterialBalances(json?.materials);
        const sold = json?.sold;
        if (
          response.ok &&
          json?.ok === true &&
          materials &&
          sold?.id === materialId &&
          typeof sold.count === "number" &&
          Number.isInteger(sold.count) &&
          sold.count > 0 &&
          typeof sold.gold === "number" &&
          Number.isFinite(sold.gold) &&
          sold.gold >= 0
        ) {
          const balancePatch = shopSaleBalancePatch(json);
          setModel((current) =>
            current ? { ...current, materials } : current,
          );
          setError(null);
          applyResourcePatch(balancePatch);
          const refreshed = await refresh(true);
          return {
            ok: true,
            message: dangerousFishingCatchSaleMessage(true, {
              materialId,
              count: sold.count,
              gold: sold.gold,
              refreshFailed: !refreshed,
            }),
            materials,
            sold: { id: materialId, count: sold.count, gold: sold.gold },
            ...(balancePatch.gold != null ? { gold: balancePatch.gold } : {}),
            ...(balancePatch.bankedGold != null
              ? { bankedGold: balancePatch.bankedGold }
              : {}),
            ...(!refreshed ? { refreshFailed: true } : {}),
          };
        }
        const code = typeof json?.error === "string" ? json.error : "network";
        if (code === "not_owned" || code === "invalid_amount") {
          await refresh(true);
        }
        return {
          ok: false,
          message: dangerousFishingCatchSaleMessage(false, {
            materialId,
            error: code,
          }),
        };
      } catch {
        return {
          ok: false,
          message: dangerousFishingCatchSaleMessage(false, {
            materialId,
            error: "network",
          }),
        };
      } finally {
        release();
        setSellingCatch(null);
      }
    },
    [applyResourcePatch, beginCatchSale, model, refresh],
  );

  return {
    model,
    loading,
    error,
    exchanging,
    sellingCatch,
    refresh,
    exchange,
    enhanceGear,
    sellCatch,
  };
}
