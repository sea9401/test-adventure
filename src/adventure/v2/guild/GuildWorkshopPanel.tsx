import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Hammer, LockKey, SpinnerGap } from "@phosphor-icons/react";
import {
  PRODUCTION_KIND_ICON,
  PRODUCTION_KIND_NAME,
  SETTLEMENT_BUILDINGS,
  type ProductionKind,
} from "@/adventure/data/v2/settlement";
import { blacksmithJobForLevel } from "@/adventure/data/v2/artisan";
import {
  GUILD_WORKSHOP_MATERIALS,
  GUILD_WORKSHOP_MATERIAL_IDS,
  GUILD_WORKSHOP_MATERIAL_DROP_PCT,
  GUILD_WORKSHOP_MATERIAL_SOURCES,
} from "@/adventure/data/v2/guildWorkshopMaterials";
import { TITLES } from "@/adventure/data/titles";
import { useRewardToast } from "@/adventure/v2/RewardToastProvider";
import type {
  GuildWorkshopCraftMode,
  GuildWorkshopRecipeId,
} from "@/adventure/data/v2/guildWorkshop";
import {
  GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT,
  GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT,
} from "@/adventure/data/v2/guildWorkshop";
import {
  V2_EQUIP_TAG_SETS,
  V2_SLOT_LABEL,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import type { GuildInfoResponse } from "./guildShared";
import { ArtisanLeaderboardPanel } from "./ArtisanLeaderboardPanel";
import { GuildArtisanContributionPanel } from "./GuildArtisanContributionPanel";
import { WorkshopDismantlePanel } from "./WorkshopDismantlePanel";
import { WorkshopGrowthPanel } from "./WorkshopGrowthPanel";
import {
  CraftOnlyBadge,
  CraftQualityBadge,
  MasterworkBadge,
} from "../V2ItemCard";

import {
  ERROR_TEXT,
  RESOURCE_KINDS,
  WEEKLY_ERROR_TEXT,
  WORKSHOP_MODE_STORAGE_KEY,
  buildWorkshopRecommendation,
  craftQualityFromLevel,
  craftResultHeadline,
  craftResultMasterworkSummary,
  craftResultMessage,
  craftResultTone,
  emptyGuildBonus,
  emptyWorkshopRecords,
  emptyWorkshopStats,
  masterworkButtonText,
  weeklyMetricLabel,
  weeklyRecipeHints,
  workshopRecordQualityText,
  type CraftResultView,
  type DeliveryState,
  type WorkshopState,
  type WeeklyState,
} from "./guildWorkshopPanelModel";

// 대장간 제작 패널 — 길드 대장간을 실제 제작 기능 게이트로 사용한다.
export function GuildWorkshopPanel({
  info,
  localSmithy = false,
}: {
  info: GuildInfoResponse | null;
  localSmithy?: boolean;
}) {
  const { notifyReward } = useRewardToast();
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
    "main" | "craft" | "dismantle" | "growth"
  >("main");
  useEffect(() => {
    try {
      const stored = localStorage.getItem(WORKSHOP_MODE_STORAGE_KEY);
      if (
        stored === "main" ||
        stored === "craft" ||
        stored === "dismantle" ||
        stored === "growth"
      ) {
        queueMicrotask(() => setWorkshopMode(stored));
      } else if (stored === "delivery") {
        queueMicrotask(() => setWorkshopMode("main"));
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
  // 해체(dismantle) 모드 — 상태/로드/실행 전부 WorkshopDismantlePanel 로 분리.
  const [contributionInfo, setContributionInfo] =
    useState<GuildInfoResponse | null>(null);
  const [selectedDeliveryIids, setSelectedDeliveryIids] = useState<
    Record<string, string>
  >({});
  const [registeredEquipmentIds, setRegisteredEquipmentIds] = useState<
    ReadonlySet<string>
  >(() => new Set());
  const [equipmentCodexReady, setEquipmentCodexReady] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/equipment-codex")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { registeredIds?: unknown } | null) => {
        if (!alive) return;
        const ids = Array.isArray(json?.registeredIds)
          ? json.registeredIds.filter(
              (id): id is string => typeof id === "string",
            )
          : [];
        setRegisteredEquipmentIds(new Set(ids));
        setEquipmentCodexReady(true);
      })
      .catch(() => {
        if (alive) setEquipmentCodexReady(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const loadContributionInfo = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/guild/info");
      const json = (await res.json().catch(() => null)) as GuildInfoResponse | null;
      if (res.ok && json?.guild) {
        setContributionInfo(json);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (info) return;
    let alive = true;
    fetch("/api/v2/me/guild/info")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: GuildInfoResponse | null) => {
        if (alive && json?.guild) setContributionInfo(json);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [info]);

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
    queueMicrotask(() => void loadWeekly());
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
    queueMicrotask(() => void loadDelivery());
  }, [loadDelivery]);

  useEffect(() => {
    if (!delivery) return;
    queueMicrotask(() => {
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
    });
  }, [delivery]);

  useEffect(() => {
    if (!hasSmithy) {
      queueMicrotask(() => setState(null));
      return;
    }
    let alive = true;
    queueMicrotask(() => {
      if (alive) setLoading(true);
    });
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
          materials: json.materials ?? {},
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
          workshopRecords: json.workshopRecords ?? emptyWorkshopRecords(),
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

  const resources = useMemo(() => state?.resources ?? {}, [state?.resources]);
  const materials = useMemo(() => state?.materials ?? {}, [state?.materials]);
  // 해체 패널 → 워크숍 상태 동기화(재료/대장장이 숙련도). 자식에 안정 참조로 전달.
  const applyWorkshopSync = useCallback(
    (sync: { materials?: Record<string, number>; artisan?: unknown }) => {
      setState((prev) =>
        prev
          ? {
              ...prev,
              materials: sync.materials ?? prev.materials,
              artisan: (sync.artisan as typeof prev.artisan) ?? prev.artisan,
            }
          : prev,
      );
    },
    [],
  );
  const hasApiSmithy = state?.hasGuildSmithy ?? hasSmithy;
  const resourceEntries = useMemo(
    () =>
      RESOURCE_KINDS.map((kind) => {
        const amount = Math.max(0, Math.floor(resources[kind] ?? 0));
        return {
          key: kind,
          label: `${PRODUCTION_KIND_ICON[kind]} ${PRODUCTION_KIND_NAME[kind]}`,
          amount,
        };
      }),
    [resources],
  );
  const materialEntries = useMemo(
    () =>
      GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
        const mat = GUILD_WORKSHOP_MATERIALS[id];
        const amount = Math.max(0, Math.floor(materials[id] ?? 0));
        return {
          key: id,
          label: mat.name,
          amount,
        };
      }),
    [materials],
  );
  const blacksmithLevel = state?.artisan.blacksmith.level ?? 1;
  const currentBlacksmithJob = blacksmithJobForLevel(blacksmithLevel);
  // 성장(growth) 모드의 파생값들(다음 차수/스킬/보상·효과 요약·기록 top)은
  // WorkshopGrowthPanel 이 state 에서 자체 계산한다.
  const workshopRecommendation = useMemo(
    () =>
      buildWorkshopRecommendation(
        state,
        weekly,
        registeredEquipmentIds,
        equipmentCodexReady,
      ),
    [equipmentCodexReady, registeredEquipmentIds, state, weekly],
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
      if (workshopRecommendation.recipeId) {
        const ar = a.id === workshopRecommendation.recipeId ? 1 : 0;
        const br = b.id === workshopRecommendation.recipeId ? 1 : 0;
        if (ar !== br) return br - ar;
      }
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
  }, [
    recipeScopeFilter,
    recipeSlotFilter,
    recipeSort,
    state?.recipes,
    workshopRecommendation.recipeId,
  ]);
  const artisanCraftedSet = V2_EQUIP_TAG_SETS.find(
    (set) => set.id === "artisan_crafted",
  );
  const workshopRecords = state?.workshopRecords ?? emptyWorkshopRecords();
  const craftResultQuality = craftResult
    ? craftQualityFromLevel(craftResult.craftQualityLevel)
    : undefined;
  const craftResultVisual = craftResult ? craftResultTone(craftResult) : null;
  const craftResultMasterworkLine = craftResult
    ? craftResultMasterworkSummary(craftResult)
    : null;
  async function craft(
    recipeId: GuildWorkshopRecipeId,
    craftMode: GuildWorkshopCraftMode = "normal",
  ) {
    setCraftingId(recipeId);
    setMessage(null);
    setCraftResult(null);
    try {
      const res = await fetch("/api/v2/guild/workshop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recipeId, mode: craftMode }),
      });
      const json = await res.json();
      if (!json.ok) {
        setMessage(ERROR_TEXT[json.error ?? ""] ?? "제작에 실패했습니다.");
        setCraftResult(null);
        if ((json.resources || json.artisan || json.materials || json.recipes) && state) {
          setState({
            ...state,
            resources: json.resources ?? state.resources,
            materials: json.materials ?? state.materials,
            ...(json.artisan ? { artisan: json.artisan } : {}),
            ...(Array.isArray(json.recipes) ? { recipes: json.recipes } : {}),
          });
        }
        return;
      }
      const nextResources = json.resources ?? {};
      const nextMaterials = json.materials ?? state?.materials ?? {};
      const nextArtisan = json.artisan ?? state?.artisan;
      const nextWorkshopStats = json.workshopStats ?? state?.workshopStats;
      const nextWorkshopRecords = json.workshopRecords ?? state?.workshopRecords;
      const nextGuildBonus = json.guildBonus ?? state?.guildBonus;
      const crafted = state?.recipes.find((recipe) => recipe.id === recipeId);
      setState((prev) =>
        prev
          ? {
              ...prev,
              resources: nextResources,
              materials: nextMaterials,
              ...(nextArtisan ? { artisan: nextArtisan } : {}),
              ...(nextWorkshopStats
                ? { workshopStats: nextWorkshopStats }
                : {}),
              ...(nextWorkshopRecords
                ? { workshopRecords: nextWorkshopRecords }
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
                      ) &&
                      Object.entries(recipe.materialCost ?? {}).every(
                        ([id, amount]) =>
                          Math.max(0, nextMaterials[id] ?? 0) >=
                          Math.max(0, amount ?? 0),
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
        craftQualityLevel: Math.max(
          0,
          Math.floor(Number(json.craftQuality?.level ?? 0)),
        ),
        craftMode:
          json.craftMode === "masterwork" || craftMode === "masterwork"
            ? "masterwork"
            : "normal",
        masterwork: json.craftMode === "masterwork" || craftMode === "masterwork",
        artisanXpGained: Math.max(
          0,
          Math.floor(Number(json.artisanXpGained ?? crafted?.artisanXp ?? 0)),
        ),
        grantedTitleNames,
      });
      void loadWeekly();
      void loadContributionInfo();
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
      const text = `길드 자금 +${Number(
        json.rewardGold ?? 0,
      ).toLocaleString()} G · 명성 +${Number(
        json.rewardFame ?? 0,
      ).toLocaleString()}`;
      setWeeklyMessage(`보상 수령 완료 · ${text}`);
      notifyReward("주간 제작 의뢰 보상", text);
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
      const text = `길드 자금 +${Number(
        json.rewardGold ?? 0,
      ).toLocaleString()} G · 숙련도 +${Number(
        json.rewardArtisanXp ?? 0,
      ).toLocaleString()}`;
      setDeliveryMessage(`납품 완료 · ${text}`);
      notifyReward("납품 완료", text);
      void loadDelivery();
    } catch {
      setDeliveryMessage("납품에 실패했습니다.");
    } finally {
      setDeliveryBusyId(null);
    }
  }

  const weeklyCard = (
    <div className="ui-workshop-card ui-smithy-card rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            주간 제작 의뢰
          </h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            길드원 제작 기록을 합산합니다.
            {weekly?.endsAt ? (
              <>
                {" "}
                · 종료{" "}
                {new Date(weekly.endsAt).toLocaleDateString("ko-KR", {
                  month: "numeric",
                  day: "numeric",
                })}
              </>
            ) : null}
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
                className={`ui-recipe-row rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 ${
                  quest.canClaim ? "ui-quest-card is-claimable" : ""
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {quest.title}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                        {weeklyMetricLabel(quest.metric)}
                      </span>{" "}
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
                <div className="war-meter-track mt-2 h-1.5 overflow-hidden rounded bg-zinc-200 dark:bg-zinc-800">
                  <div
                    className="war-meter-fill h-full rounded bg-emerald-600 dark:bg-emerald-400"
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
    <div className="ui-workshop-card ui-smithy-card rounded-md border border-zinc-200 bg-white p-3 text-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            일일 제작 납품
          </h3>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            대장간 Lv, ★ 품질, 명장 각인에 따라 보상이 증가합니다.
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
              className={`ui-recipe-row rounded border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900 ${
                selected ? "ui-codex-card is-ready" : ""
              }`}
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
                            {item.enhanceLevel > 0
                              ? ` · 강화 +${item.enhanceLevel}`
                              : ""}
                            {item.craftQualityLevel > 0
                              ? ` · ${"★".repeat(item.craftQualityLevel)} 품질`
                              : ""}
                            {item.craftOnly ? " · 제작 전용" : ""}
                            {item.masterwork ? " · 명장" : ""}
                            {` · 제작자 Lv ${item.crafterLevel}`}
                          </option>
                        ))}
                      </select>
                      {selected ? (
                        <div className="flex flex-wrap gap-1 text-[11px]">
                          <CraftQualityBadge level={selected.craftQualityLevel} />
                          {selected.craftOnly ? <CraftOnlyBadge /> : null}
                          {selected.masterwork ? <MasterworkBadge /> : null}
                          <span className="rounded bg-zinc-200 px-1.5 py-px text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            제작자 Lv {selected.crafterLevel}
                          </span>
                          {selected.masterworkBonusPct > 0 ? (
                            <span className="rounded bg-rose-100 px-1.5 py-px text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                              명장 +{selected.masterworkBonusPct}%
                            </span>
                          ) : null}
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

  const recommendationCard = (
    <div className="grid gap-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-900 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 md:grid-cols-[1.4fr_1fr]">
      <div className="min-w-0">
        <div className="font-semibold">추천 행동</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span
            className={`rounded px-1.5 py-px text-[10px] font-semibold ${
              workshopRecommendation.tone === "weekly"
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                : workshopRecommendation.tone === "codex"
                  ? "bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300"
                  : workshopRecommendation.tone === "masterwork"
                    ? "bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                    : "bg-zinc-200 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            }`}
          >
            {workshopRecommendation.tone === "weekly"
              ? "주간"
              : workshopRecommendation.tone === "codex"
                ? "도감"
                : workshopRecommendation.tone === "masterwork"
                  ? "명장"
                  : workshopRecommendation.tone === "craft"
                    ? "제작"
                    : "성장"}
          </span>
          <span className="font-medium text-zinc-800 dark:text-zinc-100">
            {workshopRecommendation.title}
          </span>
        </div>
        <div className="mt-1 text-zinc-600 dark:text-zinc-300">
          {workshopRecommendation.detail}
        </div>
        {workshopRecommendation.recipeId ? (
          <button
            type="button"
            disabled={craftingId != null || loading}
            onClick={() => {
              setWorkshopMode("craft");
              void craft(
                workshopRecommendation.recipeId as GuildWorkshopRecipeId,
                workshopRecommendation.craftMode ?? "normal",
              );
            }}
            className="mt-2 rounded border border-emerald-700 bg-emerald-700 px-2.5 py-1 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
          >
            {craftingId === workshopRecommendation.recipeId
              ? "처리 중"
              : workshopRecommendation.craftMode === "masterwork"
                ? "추천 명장 제작"
                : "추천 제작"}
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div className="rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            최고 티어
          </div>
          <div className="font-semibold">
            {workshopRecords.highestTier > 0
              ? `T${workshopRecords.highestTier}`
              : "-"}
          </div>
        </div>
        <div className="rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            최고 품질
          </div>
          <div className="font-semibold">
            {workshopRecordQualityText(workshopRecords.bestQualityLevel)}
          </div>
        </div>
        <div className="rounded border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950">
          <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
            명장 제작
          </div>
          <div className="font-semibold">
            {workshopRecords.masterworkCrafts.toLocaleString()}
          </div>
        </div>
      </div>
    </div>
  );

  const workshopStatusPanel = (
    <div className="grid gap-3 rounded-md border border-amber-200 bg-amber-50/90 p-3 text-xs text-stone-900 shadow-sm dark:border-amber-800/60 dark:bg-stone-900/95 dark:text-stone-100 lg:grid-cols-[1.05fr_1.4fr]">
      <div className="min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold text-amber-800 dark:text-amber-300">
              현재 내 대장장이
            </div>
            {state?.artisan.blacksmith ? (
              <>
                <div className="mt-1 truncate text-sm font-semibold text-stone-950 dark:text-stone-50">
                  {state.artisan.blacksmith.name} · {currentBlacksmithJob.name}
                </div>
                <div className="mt-1 text-stone-600 dark:text-stone-300">
                  Lv {state.artisan.blacksmith.level.toLocaleString()} · 제작{" "}
                  {state.artisan.blacksmith.crafts.toLocaleString()}회
                </div>
              </>
            ) : (
              <div className="mt-1 text-sm font-medium text-stone-600 dark:text-stone-300">
                정보를 불러오는 중
              </div>
            )}
          </div>
          {loading ? (
            <span className="inline-flex shrink-0 items-center gap-1 rounded border border-amber-200 bg-white/80 px-2 py-0.5 text-[11px] text-amber-800 dark:border-amber-800/60 dark:bg-stone-800 dark:text-amber-200">
              <SpinnerGap size={13} className="animate-spin" aria-hidden />
              갱신 중
            </span>
          ) : null}
        </div>
        {state?.artisan.blacksmith ? (
          <div className="mt-3">
            <div className="war-meter-track h-2 overflow-hidden rounded bg-amber-100 dark:bg-stone-800">
              <div
                className="war-meter-fill h-full rounded bg-amber-600 dark:bg-amber-400"
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
            <div className="mt-1 flex justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
              <span>
                {state.artisan.blacksmith.xpIntoLevel.toLocaleString()}/
                {state.artisan.blacksmith.xpForNext.toLocaleString()} XP
              </span>
              <span>{currentBlacksmithJob.tier}차</span>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid gap-2 md:grid-cols-[0.85fr_1.15fr]">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            길드 영지 재화
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            {resourceEntries.map((entry) => (
              <div
                key={entry.key}
                className="rounded border border-amber-200 bg-white/85 px-2 py-1 dark:border-stone-700 dark:bg-stone-800/80"
              >
                <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                  {entry.label}
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-stone-950 dark:text-stone-50">
                  {entry.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">
            보유 제작 재료
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1 sm:grid-cols-4">
            {materialEntries.map((entry) => (
              <div
                key={entry.key}
                className="rounded border border-amber-200 bg-white/85 px-2 py-1 dark:border-stone-700 dark:bg-stone-800/80"
              >
                <div className="truncate text-[11px] text-stone-500 dark:text-stone-400">
                  {entry.label}
                </div>
                <div className="mt-0.5 font-semibold tabular-nums text-stone-950 dark:text-stone-50">
                  {entry.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  if (mode === "ranking") {
    return <ArtisanLeaderboardPanel onBack={() => setMode("craft")} />;
  }

  if (!hasSmithy) {
    return (
      <section className="space-y-3">
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
    <section className="ui-workshop-card ui-smithy-card space-y-3 rounded-md border border-amber-200 bg-white p-3 text-sm shadow-sm dark:border-amber-900/60 dark:bg-stone-900/95">
      <div className="flex items-start gap-3">
        <Hammer
          size={24}
          weight="duotone"
          className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-300"
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

      <div className="grid grid-cols-4 gap-1 rounded border border-amber-200 bg-amber-50 p-1 text-xs dark:border-stone-700 dark:bg-stone-800">
        {(
          [
            ["main", "메인"],
            ["craft", "제작"],
            ["dismantle", "해체"],
            ["growth", "성장 목표"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setWorkshopMode(value)}
            className={`rounded px-2 py-1.5 font-semibold transition ${
              workshopMode === value
                ? "bg-amber-700 text-white dark:bg-amber-400 dark:text-stone-950"
                : "text-stone-600 hover:bg-white hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-50"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {workshopStatusPanel}

      {workshopMode === "main" ? (
        <div className="space-y-3">
          <GuildArtisanContributionPanel info={info ?? contributionInfo} />
          {recommendationCard}
          <div className="grid gap-3 lg:grid-cols-2">
            {weeklyCard}
            {deliveryCard}
          </div>
        </div>
      ) : null}

      {workshopMode === "growth" && state ? (
        <WorkshopGrowthPanel state={state} />
      ) : null}

      {message ? (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
          {message}
        </div>
      ) : null}

      {workshopMode === "craft" && craftResult ? (
        <div
          className={`ui-treasure-result overflow-hidden rounded border text-xs shadow-sm ${craftResultVisual?.frame ?? ""}`}
        >
          <div
            className={`border-b px-3 py-2 ${craftResultVisual?.header ?? ""}`}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-semibold ${craftResultVisual?.title ?? ""}`}>
                {craftResultHeadline(craftResult)}
              </span>
              {craftResult.masterwork ? <MasterworkBadge /> : null}
              {craftResult.craftOnly ? <CraftOnlyBadge /> : null}
              <CraftQualityBadge craftQuality={craftResultQuality} />
            </div>
            <div className="mt-1 text-[11px] text-zinc-600 dark:text-zinc-300">
              {craftResultMessage(craftResult)}
            </div>
            {craftResultMasterworkLine ? (
              <div className="mt-1 rounded border border-rose-200 bg-white/70 px-2 py-1 text-[11px] font-medium text-rose-800 dark:border-rose-800 dark:bg-rose-950/50 dark:text-rose-100">
                {craftResultMasterworkLine}
              </div>
            ) : null}
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

      {workshopMode === "dismantle" ? (
        <WorkshopDismantlePanel
          materials={materials}
          onWorkshopSync={applyWorkshopSync}
        />
      ) : null}

      {workshopMode === "craft" ? (
        <div className="space-y-2 rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs dark:border-zinc-800 dark:bg-zinc-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                제작 목록
              </div>
              <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                {filteredRecipes.length.toLocaleString()} /{" "}
                {(state?.recipes.length ?? 0).toLocaleString()}종 표시
              </div>
            </div>
            <details className="group">
              <summary className="cursor-pointer rounded border border-zinc-300 bg-white px-2.5 py-1 text-[11px] font-medium text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-800">
                제작 참고
              </summary>
              <div className="mt-2 w-full space-y-2 rounded border border-zinc-200 bg-white p-2 dark:border-zinc-800 dark:bg-zinc-950 sm:min-w-[420px]">
                <div>
                  <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                    재료 수급처
                  </div>
                  <div className="mt-1 grid gap-1 sm:grid-cols-2">
                    {GUILD_WORKSHOP_MATERIAL_IDS.map((id) => {
                      const mat = GUILD_WORKSHOP_MATERIALS[id];
                      const source = GUILD_WORKSHOP_MATERIAL_SOURCES[id];
                      const amount = Math.max(
                        0,
                        Math.floor(Number(materials[id]) || 0),
                      );
                      return (
                        <div
                          key={id}
                          className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-zinc-900 dark:text-zinc-100">
                              {mat.name}
                            </span>
                            <span className="font-mono text-[11px] text-sky-700 dark:text-sky-300">
                              {amount.toLocaleString()}개
                            </span>
                          </div>
                          <div className="mt-0.5 text-[11px] text-zinc-600 dark:text-zinc-400">
                            {source.source} · {source.depthText} · 드랍{" "}
                            {(GUILD_WORKSHOP_MATERIAL_DROP_PCT[id] * 100).toFixed(
                              1,
                            )}
                            %
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
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
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    해체는 대장장이 Lv 6부터 가능하며, 제작자 각인 장비와 제작
                    전용 장비에서 일부 재료를 회수합니다.
                  </div>
                </div>
              </div>
            </details>
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
          const masterwork = recipe.masterwork;
          const weeklyHints = weeklyRecipeHints(recipe, weekly);
          const recommended = workshopRecommendation.recipeId === recipe.id;
          return (
            <div
              key={recipe.id}
              className={`ui-recipe-row grid gap-3 px-3 py-2.5 ${
                recommended
                  ? "bg-emerald-50/70 dark:bg-emerald-950/20"
                  : ""
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <strong className="text-sm text-zinc-950 dark:text-zinc-50">
                      {recipe.itemName}
                    </strong>
                    {recommended ? (
                      <span className="rounded bg-emerald-700 px-1.5 py-px text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                        추천
                      </span>
                    ) : null}
                    <span className="rounded bg-zinc-100 px-1.5 py-px text-[10px] font-semibold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      T{recipe.tier} · {V2_SLOT_LABEL[recipe.slot]}
                    </span>
                    {recipe.craftOnly ? <CraftOnlyBadge /> : null}
                    {weeklyHints.slice(0, 2).map((hint) => (
                      <span
                        key={hint}
                        className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
                        {hint}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                    대장장이 Lv {recipe.requiredArtisanLevel} · 대장간 Lv{" "}
                    {recipe.requiredSmithyLevel} · 숙련도 +{recipe.artisanXp}
                  </div>
                </div>
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                      일반 제작
                    </span>
                    <button
                      type="button"
                      disabled={!recipe.canCraft || busy || craftingId != null}
                      onClick={() => void craft(recipe.id)}
                      className="inline-flex h-7 min-w-16 items-center justify-center rounded border border-emerald-700 bg-emerald-700 px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-emerald-500 dark:bg-emerald-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                    >
                      {busy ? (
                        <SpinnerGap
                          size={14}
                          className="animate-spin"
                          aria-hidden
                        />
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
                  <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                    {recipe.costText}
                  </div>
                  <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
                    ★ {recipe.qualityChancePct}% · 상한{" "}
                    {GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT}%
                  </div>
                </div>

                <div className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-[11px] dark:border-zinc-800 dark:bg-zinc-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-semibold text-zinc-800 dark:text-zinc-100">
                      명장 제작
                    </span>
                  <button
                    type="button"
                    disabled={
                      !masterwork?.canCraft || busy || craftingId != null
                    }
                    onClick={() => void craft(recipe.id, "masterwork")}
                    className="inline-flex h-7 min-w-20 items-center justify-center rounded border border-rose-700 bg-rose-700 px-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:border-rose-500 dark:bg-rose-600 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                  >
                    {busy ? (
                      <SpinnerGap size={14} className="animate-spin" aria-hidden />
                    ) : (
                      masterworkButtonText(recipe)
                    )}
                  </button>
                  </div>
                  <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                    {masterwork?.costText ?? "대장장이 Lv 8 필요"}
                  </div>
                  <div className="mt-0.5 text-zinc-500 dark:text-zinc-500">
                    {masterwork
                      ? `★ ${masterwork.qualityChancePct}% · 상한 ${GUILD_WORKSHOP_MASTERWORK_QUALITY_CAP_PCT}%`
                      : "명장 각인/상한 확장"}
                  </div>
                </div>
              </div>
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
