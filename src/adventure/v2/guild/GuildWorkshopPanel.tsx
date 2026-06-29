import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Hammer, LockKey, SpinnerGap } from "@phosphor-icons/react";
import {
  PRODUCTION_KIND_ICON,
  PRODUCTION_KIND_NAME,
  SETTLEMENT_BUILDINGS,
  type ProductionKind,
  type SettlementResources,
} from "@/adventure/data/v2/settlement";
import {
  BLACKSMITH_REWARD_MILESTONES,
  nextArtisanMilestone,
} from "@/adventure/data/v2/artisan";
import { TITLES } from "@/adventure/data/titles";
import type { GuildWorkshopRecipeId } from "@/adventure/data/v2/guildWorkshop";
import {
  V2_EQUIP_TAG_SETS,
  V2_SLOT_LABEL,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type { GuildInfoResponse } from "./guildShared";
import { ArtisanLeaderboardPanel } from "./ArtisanLeaderboardPanel";
import { CraftOnlyBadge } from "../V2ItemCard";

type WorkshopRecipeView = {
  id: GuildWorkshopRecipeId;
  equipmentId: string;
  itemName: string;
  slot: V2EquipSlot;
  tier: number;
  craftOnly?: boolean;
  note: string;
  cost: Partial<Record<ProductionKind, number>>;
  profession: "blacksmith";
  requiredArtisanLevel: number;
  artisanXp: number;
  qualityChancePct: number;
  levelOk: boolean;
  smithyLevelOk: boolean;
  resourceOk: boolean;
  costText: string;
  canCraft: boolean;
  requiredSmithyLevel: number;
};

type ArtisanProfessionView = {
  name: string;
  xp: number;
  crafts: number;
  level: number;
  xpIntoLevel: number;
  xpForNext: number;
};

type WorkshopStatsView = {
  totalCrafts: number;
  qualityCrafts: number;
  craftedByRecipe: Partial<Record<GuildWorkshopRecipeId, number>>;
};

type GuildWorkshopBonusView = {
  totalCrafts: number;
  qualityChanceBonusPct: number;
  tier: number;
  nextTotalCrafts: number | null;
};

type WorkshopState = {
  hasGuildSmithy: boolean;
  resources: SettlementResources;
  artisan: { blacksmith: ArtisanProfessionView };
  workshopStats: WorkshopStatsView;
  guildBonus: GuildWorkshopBonusView;
  smithyLevel?: number;
  smithyBonus?: {
    qualityChanceBonusPct: number;
    weeklyProgressBonusPct: number;
    label: string;
  };
  recipes: WorkshopRecipeView[];
};

type WeeklyQuestView = {
  id: string;
  title: string;
  metric: "crafts" | "qualityCrafts";
  goal: number;
  rewardGold: number;
  rewardFame: number;
  progress: number;
  complete: boolean;
  claimed: boolean;
  canClaim: boolean;
};

type WeeklyState = {
  weekKey: string;
  endsAt: string;
  quests: WeeklyQuestView[];
};

type DeliveryView = {
  id: string;
  title: string;
  description: string;
  rewardArtisanXp: number;
  rewardGold: number;
  claimed: boolean;
  canClaim: boolean;
  deliverable: {
    iid: string;
    itemId: string;
    itemName: string;
    enhanceLevel: number;
    craftOnly: boolean;
    crafterLevel: number;
    rewardArtisanXp: number;
    rewardGold: number;
    bonusPct: number;
  }[];
};

type DeliveryState = {
  dayKey: string;
  deliveries: DeliveryView[];
};

type CraftResultView = {
  iid: string | null;
  itemName: string;
  slot: V2EquipSlot;
  tier: number;
  craftOnly: boolean;
  enhanceLevel: number;
  artisanXpGained: number;
  grantedTitleNames: string[];
};

const RESOURCE_KINDS: ProductionKind[] = ["crop", "ore"];
const WORKSHOP_MODE_STORAGE_KEY = "v2-guild-workshop-mode";

const ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드에 가입해야 사용할 수 있습니다.",
  smithy_required: "길드 대장간이 필요합니다.",
  invalid_recipe: "제작할 수 없는 의뢰입니다.",
  insufficient_artisan_level: "대장장이 숙련도가 부족합니다.",
  insufficient_smithy_level: "대장간 레벨이 부족합니다.",
  insufficient_resources: "길드 영지 재화가 부족합니다.",
};

const WEEKLY_ERROR_TEXT: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  no_guild: "길드에 가입해야 사용할 수 있습니다.",
  invalid_quest: "수령할 수 없는 의뢰입니다.",
  already_claimed: "이미 수령한 의뢰입니다.",
  not_complete: "아직 달성하지 못한 의뢰입니다.",
};

function emptyWorkshopStats(): WorkshopStatsView {
  return { totalCrafts: 0, qualityCrafts: 0, craftedByRecipe: {} };
}

function emptyGuildBonus(): GuildWorkshopBonusView {
  return {
    totalCrafts: 0,
    qualityChanceBonusPct: 0,
    tier: 0,
    nextTotalCrafts: 10,
  };
}

function nextWorkshopGoal(state: WorkshopState | null): string {
  if (!state) return "제작 정보를 불러오는 중입니다.";
  if (state.workshopStats.totalCrafts <= 0) {
    return "첫 제작 의뢰를 완료하세요.";
  }
  if (state.artisan.blacksmith.level < 2) {
    const remain = Math.max(
      0,
      state.artisan.blacksmith.xpForNext -
        state.artisan.blacksmith.xpIntoLevel,
    );
    return `대장장이 Lv 2까지 숙련도 ${remain.toLocaleString()} 남음`;
  }
  if (state.workshopStats.qualityCrafts <= 0) {
    return "+1 품질 장비 제작에 도전하세요.";
  }
  const locked = state.recipes.find((recipe) => !recipe.levelOk);
  if (locked) {
    return `${locked.itemName} 해금까지 대장장이 Lv ${locked.requiredArtisanLevel}`;
  }
  return "장인의 길 기본 목표를 모두 달성했습니다.";
}

function titleGoalLine(state: WorkshopState): string {
  if (state.artisan.blacksmith.level < 2) {
    return `${TITLES.artisan_blacksmith_apprentice.name}: 대장장이 Lv 2`;
  }
  if (state.workshopStats.totalCrafts < 30) {
    return `${TITLES.artisan_guild_crafter.name}: 제작 ${state.workshopStats.totalCrafts.toLocaleString()}/30회`;
  }
  if (state.workshopStats.qualityCrafts < 5) {
    return `${TITLES.artisan_masterwork.name}: 품질 제작 ${state.workshopStats.qualityCrafts.toLocaleString()}/5회`;
  }
  return "장인 칭호 목표를 모두 달성했습니다.";
}

// 대장간 제작 패널 — 길드 대장간을 실제 제작 기능 게이트로 사용한다.
export function GuildWorkshopPanel({
  info,
  localSmithy = false,
}: {
  info: GuildInfoResponse | null;
  localSmithy?: boolean;
}) {
  const smithy = SETTLEMENT_BUILDINGS.guild_smithy;
  const smithyCount = info?.settlementBuildings?.guild_smithy ?? 0;
  const hasSmithy =
    localSmithy || info?.hasGuildSmithy === true || smithyCount > 0;
  const [state, setState] = useState<WorkshopState | null>(null);
  const [loading, setLoading] = useState(false);
  const [craftingId, setCraftingId] = useState<GuildWorkshopRecipeId | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [craftResult, setCraftResult] = useState<CraftResultView | null>(null);
  const [mode, setMode] = useState<"craft" | "ranking">("craft");
  const [workshopMode, setWorkshopMode] = useState<
    "craft" | "delivery" | "growth"
  >("craft");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WORKSHOP_MODE_STORAGE_KEY);
      if (
        stored === "craft" ||
        stored === "delivery" ||
        stored === "growth"
      ) {
        setWorkshopMode(stored);
      }
    } catch {}
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(WORKSHOP_MODE_STORAGE_KEY, workshopMode);
    } catch {}
  }, [workshopMode]);
  const [recipeSlotFilter, setRecipeSlotFilter] = useState<"all" | V2EquipSlot>(
    "all",
  );
  const [recipeScopeFilter, setRecipeScopeFilter] = useState<
    "all" | "craftOnly" | "craftable"
  >("all");
  const [recipeSort, setRecipeSort] = useState<"level" | "tier" | "chance">(
    "level",
  );
  const [weekly, setWeekly] = useState<WeeklyState | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyClaimingId, setWeeklyClaimingId] = useState<string | null>(null);
  const [weeklyMessage, setWeeklyMessage] = useState<string | null>(null);
  const [delivery, setDelivery] = useState<DeliveryState | null>(null);
  const [deliveryLoading, setDeliveryLoading] = useState(false);
  const [deliveryBusyId, setDeliveryBusyId] = useState<string | null>(null);
  const [deliveryMessage, setDeliveryMessage] = useState<string | null>(null);
  const [selectedDeliveryIids, setSelectedDeliveryIids] = useState<
    Record<string, string>
  >({});

  const loadWeekly = useCallback(async () => {
    setWeeklyLoading(true);
    try {
      const res = await fetch("/api/v2/guild/workshop/weekly");
      const json = await res.json();
      if (json.ok && Array.isArray(json.quests)) {
        setWeekly({
          weekKey: String(json.weekKey ?? ""),
          endsAt: String(json.endsAt ?? ""),
          quests: json.quests,
        });
      } else {
        setWeeklyMessage(
          WEEKLY_ERROR_TEXT[json.error ?? ""] ??
            "주간 제작 의뢰를 불러오지 못했습니다.",
        );
      }
    } catch {
      setWeeklyMessage("주간 제작 의뢰를 불러오지 못했습니다.");
    } finally {
      setWeeklyLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWeekly();
  }, [loadWeekly]);

  const loadDelivery = useCallback(async () => {
    setDeliveryLoading(true);
    try {
      const res = await fetch("/api/v2/guild/workshop/delivery");
      const json = await res.json();
      if (json.ok && Array.isArray(json.deliveries)) {
        setDelivery({
          dayKey: String(json.dayKey ?? ""),
          deliveries: json.deliveries,
        });
      } else {
        setDeliveryMessage("일일 납품 정보를 불러오지 못했습니다.");
      }
    } catch {
      setDeliveryMessage("일일 납품 정보를 불러오지 못했습니다.");
    } finally {
      setDeliveryLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDelivery();
  }, [loadDelivery]);

  useEffect(() => {
    if (!delivery) return;
    setSelectedDeliveryIids((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const d of delivery.deliveries) {
        const valid = d.deliverable.some((item) => item.iid === next[d.id]);
        if (!valid) {
          if (d.deliverable[0]) {
            next[d.id] = d.deliverable[0].iid;
          } else if (next[d.id]) {
            delete next[d.id];
          }
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [delivery]);

  useEffect(() => {
    if (!hasSmithy) {
      setState(null);
      return;
    }
    let alive = true;
    setLoading(true);
    fetch("/api/v2/guild/workshop")
      .then((res) => res.json())
      .then((json: WorkshopState & { ok?: boolean; error?: string }) => {
        if (!alive) return;
        if (json.ok === false) {
          setMessage(
            ERROR_TEXT[json.error ?? ""] ?? "제작 정보를 불러오지 못했습니다.",
          );
          setState(null);
          return;
        }
        setState({
          hasGuildSmithy: json.hasGuildSmithy,
          resources: json.resources ?? {},
          artisan: json.artisan ?? {
            blacksmith: {
              name: "대장장이",
              xp: 0,
              crafts: 0,
              level: 1,
              xpIntoLevel: 0,
              xpForNext: 100,
            },
          },
          workshopStats: json.workshopStats ?? emptyWorkshopStats(),
          guildBonus: json.guildBonus ?? emptyGuildBonus(),
          smithyLevel: Number(json.smithyLevel ?? 1),
          smithyBonus: json.smithyBonus,
          recipes: json.recipes ?? [],
        });
      })
      .catch(() => {
        if (alive) setMessage("제작 정보를 불러오지 못했습니다.");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [hasSmithy]);

  const resources = state?.resources ?? {};
  const hasApiSmithy = state?.hasGuildSmithy ?? hasSmithy;
  const resourceText = useMemo(
    () =>
      RESOURCE_KINDS.map((kind) => {
        const amount = Math.max(0, Math.floor(resources[kind] ?? 0));
        return `${PRODUCTION_KIND_ICON[kind]} ${PRODUCTION_KIND_NAME[kind]} ${amount.toLocaleString()}`;
      }).join(" · "),
    [resources],
  );
  const blacksmithLevel = state?.artisan.blacksmith.level ?? 1;
  const nextBlacksmithReward = nextArtisanMilestone(
    BLACKSMITH_REWARD_MILESTONES,
    blacksmithLevel,
  );
  const filteredRecipes = useMemo(() => {
    const recipes = [...(state?.recipes ?? [])].filter((recipe) => {
      if (recipeSlotFilter !== "all" && recipe.slot !== recipeSlotFilter) {
        return false;
      }
      if (recipeScopeFilter === "craftOnly" && !recipe.craftOnly) return false;
      if (recipeScopeFilter === "craftable" && !recipe.canCraft) return false;
      return true;
    });
    recipes.sort((a, b) => {
      if (recipeSort === "tier") {
        return b.tier - a.tier || a.requiredArtisanLevel - b.requiredArtisanLevel;
      }
      if (recipeSort === "chance") {
        return (
          b.qualityChancePct - a.qualityChancePct ||
          a.requiredArtisanLevel - b.requiredArtisanLevel
        );
      }
      return (
        a.requiredArtisanLevel - b.requiredArtisanLevel ||
        a.tier - b.tier ||
        a.itemName.localeCompare(b.itemName, "ko")
      );
    });
    return recipes;
  }, [recipeScopeFilter, recipeSlotFilter, recipeSort, state?.recipes]);
  const artisanCraftedSet = V2_EQUIP_TAG_SETS.find(
    (set) => set.id === "artisan_crafted",
  );
  const nextSmithyUnlockRecipes = useMemo(() => {
    if (!state) return [];
    const currentLevel = state.smithyLevel ?? 1;
    const nextLevel = currentLevel + 1;
    return state.recipes
      .filter((recipe) => recipe.requiredSmithyLevel === nextLevel)
      .sort(
        (a, b) =>
          a.requiredArtisanLevel - b.requiredArtisanLevel ||
          a.itemName.localeCompare(b.itemName, "ko"),
      );
  }, [state]);

  async function craft(recipeId: GuildWorkshopRecipeId) {
    setCraftingId(recipeId);
    setMessage(null);
    setCraftResult(null);
    try {
      const res = await fetch("/api/v2/guild/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.");
        setCraftResult(null);
        if ((json.resources || json.artisan) && state) {
          setState({
            ...state,
            resources: json.resources ?? state.resources,
            ...(json.artisan ? { artisan: json.artisan } : {}),
          });
        }
        return;
      }
      const nextResources = json.resources ?? {};
      const nextArtisan = json.artisan ?? state?.artisan;
      const nextWorkshopStats = json.workshopStats ?? state?.workshopStats;
      const nextGuildBonus = json.guildBonus ?? state?.guildBonus;
      const crafted = state?.recipes.find((recipe) => recipe.id === recipeId);
      setState((prev) =>
        prev
          ? {
              ...prev,
              resources: nextResources,
              ...(nextArtisan ? { artisan: nextArtisan } : {}),
              ...(nextWorkshopStats
                ? { workshopStats: nextWorkshopStats }
                : {}),
              ...(nextGuildBonus ? { guildBonus: nextGuildBonus } : {}),
              recipes: Array.isArray(json.recipes)
                ? json.recipes
                : prev.recipes.map((recipe) => ({
                    ...recipe,
                    levelOk:
                      !nextArtisan ||
                      nextArtisan.blacksmith.level >=
                        recipe.requiredArtisanLevel,
                    smithyLevelOk:
                      (prev.smithyLevel ?? 1) >= recipe.requiredSmithyLevel,
                    resourceOk: Object.entries(recipe.cost).every(
                      ([kind, amount]) =>
                        Math.max(
                          0,
                          nextResources[kind as ProductionKind] ?? 0,
                        ) >= Math.max(0, amount ?? 0),
                    ),
                    canCraft:
                      (!nextArtisan ||
                        nextArtisan.blacksmith.level >=
                          recipe.requiredArtisanLevel) &&
                      (prev.smithyLevel ?? 1) >= recipe.requiredSmithyLevel &&
                      Object.entries(recipe.cost).every(
                        ([kind, amount]) =>
                          Math.max(
                            0,
                            nextResources[kind as ProductionKind] ?? 0,
                          ) >= Math.max(0, amount ?? 0),
                      ),
                  })),
            }
          : prev,
      );
      const grantedTitleNames = Array.isArray(json.grantedTitles)
        ? json.grantedTitles
            .map((id: unknown) =>
              typeof id === "string" ? TITLES[id]?.name : undefined,
            )
            .filter((name: unknown): name is string => typeof name === "string")
        : [];
      setCraftResult({
        iid: typeof json.iid === "string" ? json.iid : null,
        itemName: crafted?.itemName ?? "장비",
        slot: crafted?.slot ?? "weapon",
        tier: crafted?.tier ?? 1,
        craftOnly: crafted?.craftOnly === true,
        enhanceLevel: Math.max(0, Math.floor(Number(json.enhance?.level ?? 0))),
        artisanXpGained: Math.max(
          0,
          Math.floor(Number(json.artisanXpGained ?? crafted?.artisanXp ?? 0)),
        ),
        grantedTitleNames,
      });
      void loadWeekly();
    } catch {
      setMessage("제작 요청을 처리하지 못했습니다.");
      setCraftResult(null);
    } finally {
      setCraftingId(null);
    }
  }

  async function claimWeekly(questId: string) {
    setWeeklyClaimingId(questId);
    setWeeklyMessage(null);
    try {
      const res = await fetch("/api/v2/guild/workshop/weekly", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questId }),
      });
      const json = await res.json();
      if (!json.ok) {
        setWeeklyMessage(
          WEEKLY_ERROR_TEXT[json.error ?? ""] ?? "보상 수령에 실패했습니다.",
        );
        if (Array.isArray(json.quests) && weekly) {
          setWeekly({ ...weekly, quests: json.quests });
        }
        return;
      }
      setWeekly({
        weekKey: String(json.weekKey ?? weekly?.weekKey ?? ""),
        endsAt: String(json.endsAt ?? weekly?.endsAt ?? ""),
        quests: Array.isArray(json.quests) ? json.quests : [],
      });
      setWeeklyMessage(
        `보상 수령 완료 · 길드 자금 +${Number(
          json.rewardGold ?? 0,
        ).toLocaleString()} G · 명성 +${Number(
          json.rewardFame ?? 0,
        ).toLocaleString()}`,
      );
    } catch {
      setWeeklyMessage("보상 수령에 실패했습니다.");
    } finally {
      setWeeklyClaimingId(null);
    }
  }

  async function deliver(deliveryId: string, iid: string) {
    setDeliveryBusyId(deliveryId);
    setDeliveryMessage(null);
    try {
      const res = await fetch("/api/v2/guild/workshop/delivery", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deliveryId, iid }),
      });
      const json = await res.json();
      if (!json.ok) {
        setDeliveryMessage("납품에 실패했습니다.");
        return;
      }
      setDelivery({
        dayKey: String(json.dayKey ?? delivery?.dayKey ?? ""),
        deliveries: Array.isArray(json.deliveries) ? json.deliveries : [],
      });
      setDeliveryMessage(
        `납품 완료 · 길드 자금 +${Number(
          json.rewardGold ?? 0,
        ).toLocaleString()} G · 숙련도 +${Number(
          json.rewardArtisanXp ?? 0,
        ).toLocaleString()}`,
      );
      void loadDelivery();
    } catch {
      setDeliveryMessage("납품에 실패했습니다.");
    } finally {
      setDeliveryBusyId(null);
    }
  }

  const weeklyCard = (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            주간 제작 의뢰
          </h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            길드원 제작 기록을 합산합니다.
          </div>
        </div>
        {weeklyLoading ? (
          <SpinnerGap
            size={16}
            className="shrink-0 animate-spin text-zinc-400"
            aria-hidden
          />
        ) : null}
      </div>
      {weeklyMessage ? (
        <div className="mb-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {weeklyMessage}
        </div>
      ) : null}
      {!weekly && weeklyLoading ? (
        <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
          불러오는 중…
        </div>
      ) : (
        <div className="space-y-2">
          {(weekly?.quests ?? []).map((quest) => {
            const pct = Math.min(
              100,
              Math.max(0, (quest.progress / Math.max(1, quest.goal)) * 100),
            );
            const busy = weeklyClaimingId === quest.id;
            return (
              <div
                key={quest.id}
                className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {quest.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      보상 {quest.rewardGold.toLocaleString()} G · 명성{" "}
                      {quest.rewardFame.toLocaleString()}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!quest.canClaim || busy}
                    onClick={() => void claimWeekly(quest.id)}
                    className="shrink-0 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                  >
                    {busy ? "처리 중" : quest.claimed ? "완료" : "수령"}
                  </button>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="h-full rounded bg-emerald-600 dark:bg-emerald-400"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="mt-1 text-right text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {Math.min(quest.progress, quest.goal).toLocaleString()}/
                  {quest.goal.toLocaleString()}
                </div>
              </div>
            );
          })}
          {!weeklyLoading && (weekly?.quests.length ?? 0) === 0 ? (
            <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
              등록된 주간 의뢰가 없습니다.
            </div>
          ) : null}
        </div>
      )}
    </div>
  );

  const deliveryCard = (
    <div className="rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            일일 제작 납품
          </h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            대장간 Lv와 +품질에 따라 보상이 증가합니다.
          </div>
        </div>
        {deliveryLoading ? (
          <SpinnerGap
            size={16}
            className="shrink-0 animate-spin text-zinc-400"
            aria-hidden
          />
        ) : null}
      </div>
      {deliveryMessage ? (
        <div className="mb-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {deliveryMessage}
        </div>
      ) : null}
      <div className="space-y-2">
        {(delivery?.deliveries ?? []).map((d) => {
          const selectedIid = selectedDeliveryIids[d.id] ?? d.deliverable[0]?.iid;
          const selected = d.deliverable.find((item) => item.iid === selectedIid);
          const busy = deliveryBusyId === d.id;
          return (
            <div
              key={d.id}
              className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                    {d.title}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    {d.description}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    기본 보상 숙련도 +{d.rewardArtisanXp.toLocaleString()} · 길드 자금 +
                    {d.rewardGold.toLocaleString()} G
                  </div>
                  {d.deliverable.length > 0 ? (
                    <div className="mt-2 space-y-1">
                      <select
                        value={selected?.iid ?? ""}
                        disabled={d.claimed || busy || deliveryBusyId != null}
                        onChange={(e) =>
                          setSelectedDeliveryIids((prev) => ({
                            ...prev,
                            [d.id]: e.target.value,
                          }))
                        }
                        className="w-full rounded border border-zinc-300 bg-white px-2 py-1 text-xs text-zinc-800 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                      >
                        {d.deliverable.map((item) => (
                          <option key={item.iid} value={item.iid}>
                            {item.itemName}
                            {item.enhanceLevel > 0 ? ` +${item.enhanceLevel}` : ""}
                            {item.craftOnly ? " · 제작전용" : ""}
                            {` · 제작자 Lv ${item.crafterLevel}`}
                          </option>
                        ))}
                      </select>
                      {selected ? (
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          {selected.enhanceLevel > 0 ? (
                            <span className="rounded bg-amber-100 px-1.5 py-px text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              +{selected.enhanceLevel} 품질
                            </span>
                          ) : null}
                          {selected.craftOnly ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-px text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                              제작전용
                            </span>
                          ) : null}
                          <span className="rounded bg-zinc-200 px-1.5 py-px text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            제작자 Lv {selected.crafterLevel}
                          </span>
                          {selected.bonusPct > 0 ? (
                            <span className="rounded bg-sky-100 px-1.5 py-px text-sky-700 dark:bg-sky-950/60 dark:text-sky-300">
                              보상 +{selected.bonusPct}%
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                      {selected ? (
                        <div className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                          지급 숙련도 +{selected.rewardArtisanXp.toLocaleString()} · 길드 자금 +
                          {selected.rewardGold.toLocaleString()} G
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <button
                  type="button"
                  disabled={!selected || d.claimed || busy || deliveryBusyId != null}
                  onClick={() => selected && void deliver(d.id, selected.iid)}
                  className="shrink-0 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {busy ? "처리 중" : d.claimed ? "완료" : selected ? "납품" : "대상 없음"}
                </button>
              </div>
            </div>
          );
        })}
        {!deliveryLoading && (delivery?.deliveries.length ?? 0) === 0 ? (
          <div className="py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
            등록된 납품 의뢰가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  );

  if (mode === "ranking") {
    return <ArtisanLeaderboardPanel onBack={() => setMode("craft")} />;
  }

  if (!hasSmithy) {
    return (
      <section className="space-y-3">
        {weeklyCard}
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <LockKey
              size={24}
              weight="duotone"
              className="mt-0.5 shrink-0 text-zinc-400"
              aria-hidden
            />
            <div className="min-w-0">
              <h3 className="font-semibold text-zinc-800 dark:text-zinc-100">
                길드 대장간 필요
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                보유 마을의 건축물 슬롯에 {smithy.name}을 배치하면 제작을
                사용할 수 있습니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMode("ranking")}
            className="shrink-0 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            랭킹
          </button>
        </div>
        </div>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-3 text-sm shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-start gap-3">
        <Hammer
          size={24}
          weight="duotone"
          className="mt-0.5 shrink-0 text-zinc-700 dark:text-zinc-300"
          aria-hidden
        />
        <div className="min-w-0">
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {smithy.name} 가동 중
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
            {localSmithy
              ? "이 거점의 대장간에서 길드 영지 재화를 사용해 장비를 제작합니다."
              : `보유 수 ${smithyCount.toLocaleString()}개. 길드 영지 재화를 사용해 장비를 제작합니다.`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setMode("ranking")}
          className="ml-auto shrink-0 rounded border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          랭킹
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1 rounded border border-zinc-200 bg-zinc-50 p-1 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        {(
          [
            ["craft", "제작"],
            ["delivery", "납품"],
            ["growth", "성장 목표"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setWorkshopMode(value)}
            className={`rounded px-2 py-1.5 font-semibold transition ${
              workshopMode === value
                ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {workshopMode === "delivery" ? (
        <>
          {weeklyCard}
          {deliveryCard}
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-2 border-y border-zinc-200 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
        <span>{resourceText}</span>
        {loading ? (
          <span className="inline-flex items-center gap-1 text-zinc-500 dark:text-zinc-400">
            <SpinnerGap size={14} className="animate-spin" aria-hidden />
            불러오는 중
          </span>
        ) : null}
      </div>

      {state?.artisan.blacksmith ? (
        <div className="grid gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 sm:grid-cols-[1fr_auto] sm:items-center">
          <div className="min-w-0">
            <strong>{state.artisan.blacksmith.name}</strong>
            <span className="ml-2 text-zinc-500 dark:text-zinc-400">
              Lv {state.artisan.blacksmith.level.toLocaleString()} · 제작{" "}
              {state.artisan.blacksmith.crafts.toLocaleString()}회
            </span>
          </div>
          <div className="min-w-32">
            <div className="h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded bg-emerald-600 dark:bg-emerald-400"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (state.artisan.blacksmith.xpIntoLevel /
                        Math.max(1, state.artisan.blacksmith.xpForNext)) *
                        100,
                    ),
                  )}%`,
                }}
              />
            </div>
            <div className="mt-1 text-right text-[11px] text-zinc-500 dark:text-zinc-400">
              {state.artisan.blacksmith.xpIntoLevel}/
              {state.artisan.blacksmith.xpForNext}
            </div>
          </div>
        </div>
      ) : null}

      {workshopMode === "growth" && state ? (
        <div className="grid gap-2 border-b border-zinc-200 pb-3 text-xs text-zinc-900 dark:border-zinc-800 dark:text-zinc-100 md:grid-cols-2">
          <div>
            <div className="font-semibold">다음 목표</div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              {nextWorkshopGoal(state)}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              총 제작 {state.workshopStats.totalCrafts.toLocaleString()}회 ·
              품질 제작 {state.workshopStats.qualityCrafts.toLocaleString()}회
            </div>
          </div>
          <div>
            <div className="font-semibold">대장장이 효과</div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              {nextBlacksmithReward
                ? `다음 해금: Lv ${nextBlacksmithReward.level} ${nextBlacksmithReward.title}`
                : "모든 대장장이 보상을 해금했습니다."}
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              +1 품질 확률은 Lv1 3%, 이후 레벨당 +2%p, 길드 보너스 합산
              최대 25%
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              대장간 Lv {(state.smithyLevel ?? 1).toLocaleString()} ·{" "}
              {state.smithyBonus?.label ?? "기본 제작"} · 품질 보너스 +
              {state.smithyBonus?.qualityChanceBonusPct ?? 0}%p
            </div>
            <div className="mt-2 grid gap-1">
              {BLACKSMITH_REWARD_MILESTONES.map((milestone) => {
                const unlocked = blacksmithLevel >= milestone.level;
                return (
                  <div
                    key={milestone.level}
                    className={`rounded border px-2 py-1 ${
                      unlocked
                        ? "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950"
                        : "border-zinc-200 bg-white text-zinc-500 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">
                        Lv {milestone.level} · {milestone.title}
                      </span>
                      <span className="text-[10px]">
                        {unlocked ? "해금" : "잠김"}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] opacity-80">
                      {milestone.description}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 font-semibold">제작 품질 보너스</div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              제작 {state.guildBonus.totalCrafts.toLocaleString()}회 · 품질
              확률 +{state.guildBonus.qualityChanceBonusPct.toLocaleString()}%
            </div>
            <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
              {state.guildBonus.nextTotalCrafts == null
                ? "최대 보너스 단계입니다."
                : `다음 보너스까지 ${Math.max(
                    0,
                    state.guildBonus.nextTotalCrafts -
                      state.guildBonus.totalCrafts,
                  ).toLocaleString()}회 남음`}
            </div>
            <div className="mt-2 font-semibold">칭호 목표</div>
            <div className="mt-1 text-zinc-600 dark:text-zinc-400">
              {titleGoalLine(state)}
            </div>
            <div className="mt-2 font-semibold">다음 대장간 Lv 해금</div>
            {nextSmithyUnlockRecipes.length > 0 ? (
              <div className="mt-1 grid gap-1">
                {nextSmithyUnlockRecipes.slice(0, 4).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{recipe.itemName}</span>
                      <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                        대장간 Lv {recipe.requiredSmithyLevel}
                      </span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      대장장이 Lv {recipe.requiredArtisanLevel} ·{" "}
                      {recipe.costText}
                    </div>
                  </div>
                ))}
                {nextSmithyUnlockRecipes.length > 4 ? (
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    외 {nextSmithyUnlockRecipes.length - 4}종 추가 해금
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                다음 대장간 레벨에 새 제작품이 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : null}

      {message ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {message}
        </div>
      ) : null}

      {workshopMode === "craft" && craftResult ? (
        <div className="overflow-hidden rounded border border-amber-300 bg-white text-xs shadow-sm dark:border-amber-800 dark:bg-zinc-950">
          <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900 dark:bg-amber-950/40">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-amber-950 dark:text-amber-100">
                제작 완료
              </span>
              {craftResult.craftOnly ? <CraftOnlyBadge /> : null}
              {craftResult.enhanceLevel > 0 ? (
                <span className="rounded bg-amber-200 px-1.5 py-px font-semibold text-amber-900 dark:bg-amber-800 dark:text-amber-50">
                  +{craftResult.enhanceLevel} 품질
                </span>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2 px-3 py-2 text-zinc-700 dark:text-zinc-200 sm:grid-cols-[1fr_auto] sm:items-center">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-950 dark:text-zinc-50">
                {craftResult.itemName}
              </div>
              <div className="mt-1 text-zinc-500 dark:text-zinc-400">
                {V2_SLOT_LABEL[craftResult.slot]} · T{craftResult.tier} ·
                대장장이 숙련도 +{craftResult.artisanXpGained.toLocaleString()}
              </div>
            </div>
            <div className="flex flex-wrap gap-1 sm:justify-end">
              <Link
                href={`/character/inventory?tab=${craftResult.slot}${
                  craftResult.iid ? `&item=${craftResult.iid}` : ""
                }`}
                className="rounded border border-zinc-300 bg-white px-2 py-px font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
              >
                장비 보기
              </Link>
              {craftResult.craftOnly ? (
                <span className="rounded bg-emerald-100 px-1.5 py-px font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
                  도감 등록 대상
                </span>
              ) : null}
              {craftResult.craftOnly ? (
                <Link
                  href="/character/codex?tab=equipment"
                  className="rounded border border-emerald-300 bg-emerald-50 px-2 py-px font-medium text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 dark:hover:bg-emerald-900/60"
                >
                  도감 등록
                </Link>
              ) : null}
              {craftResult.grantedTitleNames.map((name) => (
                <span
                  key={name}
                  className="rounded bg-sky-100 px-1.5 py-px font-medium text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                >
                  칭호 {name}
                </span>
              ))}
            </div>
          </div>
        </div>
      ) : null}

      {!hasApiSmithy ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          서버 기준으로는 아직 길드 대장간이 확인되지 않았습니다.
        </div>
      ) : null}

      {workshopMode === "craft" ? (
      <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
        <div className="rounded border border-zinc-200 bg-white px-2 py-1.5 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="font-semibold text-zinc-900 dark:text-zinc-100">
            장인표 세트 목표
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {artisanCraftedSet?.thresholds.map((threshold) => (
              <span
                key={threshold.count}
                className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              >
                {threshold.count}세트 보너스
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["all", "전체"],
              ["weapon", V2_SLOT_LABEL.weapon],
              ["armor", V2_SLOT_LABEL.armor],
              ["gloves", V2_SLOT_LABEL.gloves],
              ["boots", V2_SLOT_LABEL.boots],
              ["ring", V2_SLOT_LABEL.ring],
              ["necklace", V2_SLOT_LABEL.necklace],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setRecipeSlotFilter(value)}
              className={`rounded-full px-2.5 py-1 font-medium transition ${
                recipeSlotFilter === value
                  ? "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950"
                  : "bg-white text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid gap-1.5 sm:grid-cols-2">
          <select
            value={recipeScopeFilter}
            onChange={(e) =>
              setRecipeScopeFilter(
                e.target.value as "all" | "craftOnly" | "craftable",
              )
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="all">모든 레시피</option>
            <option value="craftable">제작 가능</option>
            <option value="craftOnly">제작 전용</option>
          </select>
          <select
            value={recipeSort}
            onChange={(e) =>
              setRecipeSort(e.target.value as "level" | "tier" | "chance")
            }
            className="rounded border border-zinc-300 bg-white px-2 py-1 text-zinc-900 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          >
            <option value="level">해금 레벨순</option>
            <option value="tier">티어 높은순</option>
            <option value="chance">품질 확률순</option>
          </select>
        </div>
      </div>
      ) : null}

      {workshopMode === "craft" ? (
      <div className="divide-y divide-zinc-200 overflow-hidden rounded border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-950">
        {filteredRecipes.map((recipe) => {
          const busy = craftingId === recipe.id;
          return (
            <div
              key={recipe.id}
              className="grid gap-2 px-3 py-2 sm:grid-cols-[1fr_auto] sm:items-center"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <strong className="text-zinc-950 dark:text-zinc-50">
                    {recipe.itemName}
                  </strong>
                  {recipe.craftOnly ? <CraftOnlyBadge /> : null}
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    T{recipe.tier} · {recipe.note} · Lv{" "}
                    {recipe.requiredArtisanLevel} · 숙련도 +{recipe.artisanXp}
                    {recipe.requiredSmithyLevel > 1
                      ? ` · 대장간 Lv ${recipe.requiredSmithyLevel}`
                      : ""}
                  </span>
                </div>
                <div className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                  {recipe.costText} · +1 확률 {recipe.qualityChancePct}%
                  {recipe.craftOnly ? " · 획득 경로: 이 대장간 제작" : ""}
                </div>
              </div>
              <button
                type="button"
                disabled={!recipe.canCraft || busy || craftingId != null}
                onClick={() => void craft(recipe.id)}
                className="inline-flex h-8 min-w-20 items-center justify-center rounded border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
              >
                {busy ? (
                  <SpinnerGap size={14} className="animate-spin" aria-hidden />
                ) : !recipe.levelOk ? (
                  `Lv ${recipe.requiredArtisanLevel}`
                ) : !recipe.smithyLevelOk ? (
                  `대장간 Lv ${recipe.requiredSmithyLevel}`
                ) : recipe.canCraft ? (
                  "제작"
                ) : (
                  "부족"
                )}
              </button>
            </div>
          );
        })}
        {!loading && filteredRecipes.length === 0 ? (
          <div className="px-3 py-2 text-xs text-zinc-500 dark:text-zinc-400">
            조건에 맞는 제작 의뢰가 없습니다.
          </div>
        ) : null}
      </div>
      ) : null}
    </section>
  );
}
