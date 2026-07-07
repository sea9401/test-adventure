"use client";

import { useEffect, useState } from "react";
import {
  CheckCircle,
  Circle,
  Diamond,
  HandFist,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import { useRewardToast } from "@/adventure/v2/RewardToastProvider";
import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  effectiveStats,
  v2ItemTypeLabel,
  type V2EquipInstance,
  type V2EquipSlot,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import { CRAFT_ONLY_CODEX_REWARDS } from "@/adventure/data/v2/equipmentCodex";
import { GUILD_WORKSHOP_MATERIALS } from "@/adventure/data/v2/guildWorkshopMaterials";
import { enhancedPower } from "@/adventure/data/v2/v2Enhance";
import { rollQualityPct } from "@/adventure/data/v2/v2EquipVariance";
import {
  EquipmentTierBadge,
  anchorOf,
  type ItemCardAnchor,
} from "./V2ItemCard";
import {
  TITLES,
} from "@/adventure/data/titles";
import {
  V2_BUILD_TAG_LABEL,
  V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS,
  buildTagsForEquipment,
  equipmentHasBuildTag,
  type V2BuildTagId,
} from "@/adventure/data/v2/buildTags";
import {
  MAX_ACTIVE_BUILD_GOALS,
  V2_BUILD_PRESETS,
  type V2BuildPresetId,
} from "@/adventure/data/v2/buildPresets";
import { V2_SKILLS } from "@/adventure/data/v2/v2Skills";

// 모험의 서 — 장비 도감 탭(V2CodexView 에서 분리, 2026-07). 탭 진입 시 lazy fetch(도감+보유)
// + 개별/일괄 등록 mutation 까지 자립. 부모 의존은 아이템 상세 카드 팝오버(onShowCard)뿐.
const CODEX_PANEL_SURFACE = `${SURFACE_INSET} p-2.5 sm:p-3`;

type EquipmentCodexMeta = {
  registeredCount: number;
  total: number;
  spBonus: number;
  milestones: number[];
  nextMilestone: number | null;
};

type EquipmentCodexResponse = Partial<EquipmentCodexMeta> & {
  ok?: boolean;
  registeredIds?: unknown;
  owned?: unknown;
  equipped?: unknown;
  craftRecords?: unknown;
  codexRewards?: unknown;
  artisanXpReward?: unknown;
};

type BuildGoalsResponse = {
  ok?: boolean;
  activePresetIds?: unknown;
};

type EquipmentCraftRecordView = {
  recipeId?: string;
  crafts: number;
  bestQualityLevel: number;
  masterworkCrafts: number;
  lastCraftedAt?: string;
};

const EQUIPMENT_IDS = Object.keys(V2_EQUIPMENT) as V2EquipmentId[];
const EQUIPMENT_SLOT_ORDER: V2EquipSlot[] = [
  "weapon",
  "armor",
  "gloves",
  "boots",
  "ring",
  "necklace",
];
const EQUIPMENT_CODEX_PAGE_SIZE = 20;
const EQUIPMENT_SLOT_ICON: Record<V2EquipSlot, { Icon: Icon; color: string }> = {
  weapon: { Icon: Sword, color: "text-rose-500" },
  armor: { Icon: Shield, color: "text-sky-500" },
  gloves: { Icon: HandFist, color: "text-amber-500" },
  boots: { Icon: Sneaker, color: "text-emerald-500" },
  ring: { Icon: Circle, color: "text-violet-500" },
  necklace: { Icon: Diamond, color: "text-pink-500" },
};
const DEFAULT_EQUIPMENT_CODEX_META: EquipmentCodexMeta = {
  registeredCount: 0,
  total: EQUIPMENT_IDS.length,
  spBonus: 0,
  milestones: [],
  nextMilestone: null,
};
const EQUIPMENT_CODEX_ENTRIES = [...EQUIPMENT_IDS].sort((a, b) => {
  const ia = V2_EQUIPMENT[a];
  const ib = V2_EQUIPMENT[b];
  return (
    EQUIPMENT_SLOT_ORDER.indexOf(ia.slot) -
      EQUIPMENT_SLOT_ORDER.indexOf(ib.slot) ||
    ia.tier - ib.tier ||
    ia.name.localeCompare(ib.name, "ko")
  );
});
type EquipmentBuildFilter = "all" | V2BuildTagId;
const EQUIPMENT_BUILD_FILTERS: readonly {
  key: EquipmentBuildFilter;
  label: string;
}[] = [
  { key: "all", label: "전체" },
  ...V2_EQUIPMENT_CODEX_BUILD_TAG_FILTERS.map((tag) => ({
    key: tag,
    label: V2_BUILD_TAG_LABEL[tag],
  })),
];

function compareEquipmentCodexCandidate(
  a: V2EquipInstance,
  b: V2EquipInstance,
): number {
  const ia = V2_EQUIPMENT[a.id];
  const ib = V2_EQUIPMENT[b.id];
  const enhanceA = a.enhance?.level ?? 0;
  const enhanceB = b.enhance?.level ?? 0;
  if (enhanceA !== enhanceB) return enhanceA - enhanceB;
  const qualityA = ia ? (rollQualityPct(ia, a.roll) ?? 50) : 50;
  const qualityB = ib ? (rollQualityPct(ib, b.roll) ?? 50) : 50;
  if (qualityA !== qualityB) return qualityA - qualityB;
  const powerA = ia
    ? enhancedPower(effectiveStats(ia, a.roll).power, a.enhance)
    : 0;
  const powerB = ib
    ? enhancedPower(effectiveStats(ib, b.roll).power, b.enhance)
    : 0;
  if (powerA !== powerB) return powerA - powerB;
  return a.iid.localeCompare(b.iid);
}

function equipmentMatchesBuildFilter(
  item: V2Equipment,
  filter: EquipmentBuildFilter,
): boolean {
  if (filter === "all") return true;
  return equipmentHasBuildTag(item, filter);
}

function parseEquipmentCraftRecord(raw: unknown): EquipmentCraftRecordView | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const crafts = Math.max(0, Math.floor(Number(obj.crafts) || 0));
  const bestQualityLevel = Math.max(
    0,
    Math.min(2, Math.floor(Number(obj.bestQualityLevel) || 0)),
  );
  const masterworkCrafts = Math.max(
    0,
    Math.floor(Number(obj.masterworkCrafts) || 0),
  );
  if (crafts <= 0 && bestQualityLevel <= 0 && masterworkCrafts <= 0) {
    return null;
  }
  return {
    recipeId: typeof obj.recipeId === "string" ? obj.recipeId : undefined,
    crafts,
    bestQualityLevel,
    masterworkCrafts,
    lastCraftedAt:
      typeof obj.lastCraftedAt === "string" ? obj.lastCraftedAt : undefined,
  };
}

function parseEquipmentCraftRecords(
  raw: unknown,
): Partial<Record<V2EquipmentId, EquipmentCraftRecordView>> {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Partial<Record<V2EquipmentId, EquipmentCraftRecordView>> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!V2_EQUIPMENT[id as V2EquipmentId]) continue;
    const record = parseEquipmentCraftRecord(value);
    if (record) out[id as V2EquipmentId] = record;
  }
  return out;
}

function craftRecordQualityText(levelRaw: number): string {
  const level = Math.max(0, Math.floor(Number(levelRaw) || 0));
  if (level >= 2) return "★★";
  if (level >= 1) return "★";
  return "기본";
}

function equipmentCodexRewardText(j: EquipmentCodexResponse | null): string {
  const rewards = Array.isArray(j?.codexRewards) ? j.codexRewards : [];
  if (rewards.length === 0) return "";
  const materialTotals = new Map<string, number>();
  let artisanXp = Math.max(0, Math.floor(Number(j?.artisanXpReward) || 0));
  for (const raw of rewards) {
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) continue;
    const obj = raw as { artisanXp?: unknown; materials?: unknown };
    if (artisanXp <= 0) {
      artisanXp += Math.max(0, Math.floor(Number(obj.artisanXp) || 0));
    }
    if (
      obj.materials != null &&
      typeof obj.materials === "object" &&
      !Array.isArray(obj.materials)
    ) {
      for (const [id, amountRaw] of Object.entries(
        obj.materials as Record<string, unknown>,
      )) {
        const amount = Math.max(0, Math.floor(Number(amountRaw) || 0));
        if (amount > 0) materialTotals.set(id, (materialTotals.get(id) ?? 0) + amount);
      }
    }
  }
  const materialText = [...materialTotals.entries()]
    .map(([id, amount]) => {
      const mat = GUILD_WORKSHOP_MATERIALS[
        id as keyof typeof GUILD_WORKSHOP_MATERIALS
      ];
      return `${mat?.name ?? id} ${amount.toLocaleString()}`;
    })
    .join(" · ");
  return [
    artisanXp > 0 ? `대장장이 숙련도 +${artisanXp.toLocaleString()}` : "",
    materialText,
  ]
    .filter(Boolean)
    .join(" · ");
}

// 장비 드랍 풀 → 처치당 총 확률(pool.chance). 스타터 풀 라벨용.

export function CodexEquipmentPanel({
  onShowCard,
}: {
  /** 드랍 칩과 동일한 읽기전용 카탈로그 카드 팝오버 — 부모(도감 뷰)가 모달 소유. */
  onShowCard: (card: { item: V2Equipment; anchor: ItemCardAnchor }) => void;
}) {
  const { notifyReward } = useRewardToast();
  const [equipmentRegisteredIds, setEquipmentRegisteredIds] = useState<
    Set<string>
  >(new Set());
  const [equipmentCodexMeta, setEquipmentCodexMeta] =
    useState<EquipmentCodexMeta>(DEFAULT_EQUIPMENT_CODEX_META);
  const [ownedEquipment, setOwnedEquipment] = useState<V2EquipInstance[]>([]);
  const [equipmentCraftRecords, setEquipmentCraftRecords] = useState<
    Partial<Record<V2EquipmentId, EquipmentCraftRecordView>>
  >({});
  const [equippedEquipment, setEquippedEquipment] = useState<
    Partial<Record<V2EquipSlot, string>>
  >({});
  const [equipmentCodexLoading, setEquipmentCodexLoading] = useState(false);
  const [equipmentCodexBusy, setEquipmentCodexBusy] = useState<string | null>(
    null,
  );
  const [equipmentCodexMsg, setEquipmentCodexMsg] = useState<string | null>(null);
  const [equipmentCodexSlot, setEquipmentCodexSlot] =
    useState<V2EquipSlot>("weapon");
  const [equipmentBuildFilter, setEquipmentBuildFilter] =
    useState<EquipmentBuildFilter>("all");
  const [activeBuildGoalIds, setActiveBuildGoalIds] = useState<
    Set<V2BuildPresetId>
  >(new Set());
  const [buildGoalBusy, setBuildGoalBusy] = useState<V2BuildPresetId | null>(
    null,
  );
  const [buildGoalMsg, setBuildGoalMsg] = useState<string | null>(null);

  function applyEquipmentCodexPayload(j: EquipmentCodexResponse | null) {
    if (!j) return;
    const ids = Array.isArray(j.registeredIds)
      ? j.registeredIds.filter((id): id is string => typeof id === "string")
      : [];
    setEquipmentRegisteredIds(new Set(ids));
    setEquipmentCodexMeta({
      registeredCount:
        typeof j.registeredCount === "number" ? j.registeredCount : ids.length,
      total: typeof j.total === "number" ? j.total : EQUIPMENT_IDS.length,
      spBonus: typeof j.spBonus === "number" ? j.spBonus : 0,
      milestones: Array.isArray(j.milestones)
        ? j.milestones.filter((n): n is number => typeof n === "number")
        : [],
      nextMilestone:
        typeof j.nextMilestone === "number" ? j.nextMilestone : null,
    });
    setEquipmentCraftRecords(parseEquipmentCraftRecords(j.craftRecords));
  }

  function applyBuildGoalsPayload(j: BuildGoalsResponse | null) {
    if (!j || !Array.isArray(j.activePresetIds)) return;
    const ids = j.activePresetIds.filter((id): id is V2BuildPresetId =>
      V2_BUILD_PRESETS.some((preset) => preset.id === id),
    );
    setActiveBuildGoalIds(new Set(ids));
  }

  useEffect(() => {
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 장비 탭 진입 시 도감/보유 장비 lazy fetch
    setEquipmentCodexLoading(true);
    setEquipmentCodexMsg(null);
    Promise.all([
      fetch("/api/v2/me/equipment-codex").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v2/me/equipment").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v2/me/build-goals").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([codex, equipment, buildGoals]) => {
        if (!alive) return;
        applyEquipmentCodexPayload(codex as EquipmentCodexResponse | null);
        applyBuildGoalsPayload(buildGoals as BuildGoalsResponse | null);
        if (equipment && Array.isArray(equipment.owned)) {
          setOwnedEquipment(equipment.owned as V2EquipInstance[]);
        }
        if (equipment?.equipped && typeof equipment.equipped === "object") {
          setEquippedEquipment(
            equipment.equipped as Partial<Record<V2EquipSlot, string>>,
          );
        }
      })
      .catch(() => {
        if (alive) setEquipmentCodexMsg("장비 도감을 불러오지 못했어요");
      })
      .finally(() => {
        if (alive) setEquipmentCodexLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggleBuildGoal(presetId: V2BuildPresetId) {
    if (buildGoalBusy) return;
    const preset = V2_BUILD_PRESETS.find((entry) => entry.id === presetId);
    const active = !activeBuildGoalIds.has(presetId);
    const before = new Set(activeBuildGoalIds);
    setBuildGoalBusy(presetId);
    setBuildGoalMsg(null);
    setActiveBuildGoalIds((prev) => {
      const next = new Set(prev);
      if (active) {
        next.delete(presetId);
        return new Set([presetId, ...next].slice(0, MAX_ACTIVE_BUILD_GOALS));
      }
      next.delete(presetId);
      return next;
    });
    try {
      const res = await fetch("/api/v2/me/build-goals", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ presetId, active }),
      });
      const j = (await res.json().catch(() => null)) as BuildGoalsResponse | null;
      if (!res.ok || !j?.ok) throw new Error("failed");
      applyBuildGoalsPayload(j);
      setBuildGoalMsg(
        active
          ? `${preset?.name ?? "빌드"} 목표로 지정했어요`
          : `${preset?.name ?? "빌드"} 목표를 해제했어요`,
      );
    } catch {
      setActiveBuildGoalIds(before);
      setBuildGoalMsg("빌드 목표를 저장하지 못했어요");
    } finally {
      setBuildGoalBusy(null);
    }
  }

  async function submitEquipmentCodexRegistration(inst: V2EquipInstance) {
    const res = await fetch("/api/v2/me/equipment-codex", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ iid: inst.iid }),
    });
    const j = (await res.json().catch(() => null)) as
      | (EquipmentCodexResponse & {
          ok?: boolean;
          error?: string;
          owned?: V2EquipInstance[];
          equipped?: Partial<Record<V2EquipSlot, string>>;
        })
      | null;
    if (!res.ok || !j?.ok) {
      const reason =
        j?.error === "locked"
          ? "잠긴 장비는 등록할 수 없어요"
          : j?.error === "equipped"
            ? "장착 중인 장비는 등록할 수 없어요"
            : j?.error === "already_registered"
              ? "이미 등록된 장비예요"
              : "장비를 등록할 수 없어요";
      throw new Error(reason);
    }
    applyEquipmentCodexPayload(j);
    if (Array.isArray(j.owned)) setOwnedEquipment(j.owned);
    if (j.equipped && typeof j.equipped === "object") {
      setEquippedEquipment(j.equipped);
    }
    return j;
  }

  async function registerEquipment(inst: V2EquipInstance) {
    const item = V2_EQUIPMENT[inst.id];
    if (!item || equipmentCodexBusy) return;
    if (!window.confirm(`${item.name} 1개를 장비 도감에 등록할까요?`)) return;
    setEquipmentCodexBusy(inst.iid);
    setEquipmentCodexMsg(null);
    try {
      const result = await submitEquipmentCodexRegistration(inst);
      const rewardText = equipmentCodexRewardText(result);
      setEquipmentCodexMsg(
        rewardText ? `${item.name} 등록 완료 · ${rewardText}` : `${item.name} 등록 완료`,
      );
      if (rewardText) notifyReward("장비 도감 보상", `${item.name} · ${rewardText}`);
    } catch (err) {
      setEquipmentCodexMsg(
        err instanceof Error ? err.message : "오류가 발생했어요",
      );
    } finally {
      setEquipmentCodexBusy(null);
    }
  }

  async function registerEquipmentBulk(slot: V2EquipSlot) {
    if (equipmentCodexBusy) return;
    const candidates = equipmentEntries
      .filter((id) => V2_EQUIPMENT[id].slot === slot)
      .filter((id) =>
        equipmentMatchesBuildFilter(V2_EQUIPMENT[id], equipmentBuildFilter),
      )
      .filter((id) => !equipmentRegisteredIds.has(id))
      .map((id) => equipmentCounts.eligible.get(id)?.[0] ?? null)
      .filter((inst): inst is V2EquipInstance => Boolean(inst));
    if (candidates.length === 0) {
      setEquipmentCodexMsg("이 부위에 등록 가능한 장비가 없어요");
      return;
    }
    if (
      !window.confirm(
        `${V2_SLOT_LABEL[slot]} ${candidates.length}종을 장비 도감에 일괄 등록할까요? 등록한 장비는 소모됩니다.`,
      )
    ) {
      return;
    }
    setEquipmentCodexBusy(`bulk:${slot}`);
    setEquipmentCodexMsg(null);
    let registered = 0;
    let failed = 0;
    const rewardLines: string[] = [];
    try {
      for (const inst of candidates) {
        try {
          const result = await submitEquipmentCodexRegistration(inst);
          const rewardText = equipmentCodexRewardText(result);
          if (rewardText) rewardLines.push(rewardText);
          registered += 1;
        } catch {
          failed += 1;
        }
      }
      const rewardText =
        rewardLines.length > 0 ? ` · 보상 ${rewardLines.join(" / ")}` : "";
      setEquipmentCodexMsg(
        failed > 0
          ? `${registered}종 등록 완료 · ${failed}종 실패${rewardText}`
          : `${registered}종 등록 완료${rewardText}`,
      );
      if (rewardLines.length > 0) {
        notifyReward("장비 도감 보상", `${registered}종 등록 · ${rewardLines.join(" / ")}`);
      }
    } finally {
      setEquipmentCodexBusy(null);
    }
  }

  const equipmentEntries = EQUIPMENT_CODEX_ENTRIES;
  const equippedIids = new Set(Object.values(equippedEquipment).filter(Boolean));
  const equipmentCounts = (() => {
    const owned = new Map<string, number>();
    const eligible = new Map<string, V2EquipInstance[]>();
    for (const inst of ownedEquipment) {
      owned.set(inst.id, (owned.get(inst.id) ?? 0) + 1);
      if (!inst.locked && !equippedIids.has(inst.iid)) {
        const arr = eligible.get(inst.id) ?? [];
        arr.push(inst);
        eligible.set(inst.id, arr);
      }
    }
    for (const arr of eligible.values()) {
      arr.sort(compareEquipmentCodexCandidate);
    }
    return { owned, eligible };
  })();
  const equipmentSlotEntries = equipmentEntries
    .filter((id) => V2_EQUIPMENT[id].slot === equipmentCodexSlot)
    .filter((id) =>
      equipmentMatchesBuildFilter(V2_EQUIPMENT[id], equipmentBuildFilter),
    );
  const equipmentSlotPager = usePagination(
    equipmentSlotEntries,
    EQUIPMENT_CODEX_PAGE_SIZE,
    `${equipmentCodexSlot}:${equipmentBuildFilter}`,
  );
  const equipmentSlotRegisteredCount = equipmentSlotEntries.filter((id) =>
    equipmentRegisteredIds.has(id),
  ).length;
  const equipmentSlotRegisterableCount = equipmentSlotEntries.filter(
    (id) =>
      !equipmentRegisteredIds.has(id) &&
      (equipmentCounts.eligible.get(id)?.length ?? 0) > 0,
  ).length;
  const craftOnlyRegisteredCount = [...equipmentRegisteredIds].filter(
    (id) => V2_EQUIPMENT[id as V2EquipmentId]?.craftOnly,
  ).length;
  const equipmentCraftGoals = (() => {
    const recordEntries = Object.entries(equipmentCraftRecords)
      .map(([id, record]) => ({
        id: id as V2EquipmentId,
        item: V2_EQUIPMENT[id as V2EquipmentId],
        record,
      }))
      .filter((entry) => entry.item && entry.record);
    const craftOnlySlots = new Set(
      recordEntries
        .filter((entry) => entry.item.craftOnly && (entry.record?.crafts ?? 0) > 0)
        .map((entry) => entry.item.slot),
    );
    const qualityItemCount = recordEntries.filter(
      (entry) => (entry.record?.bestQualityLevel ?? 0) >= 1,
    ).length;
    const doubleStarCount = recordEntries.filter(
      (entry) => (entry.record?.bestQualityLevel ?? 0) >= 2,
    ).length;
    const highTierCount = recordEntries.filter(
      (entry) => entry.item.tier >= 10 && (entry.record?.crafts ?? 0) > 0,
    ).length;
    const masterworkCrafts = recordEntries.reduce(
      (sum, entry) => sum + (entry.record?.masterworkCrafts ?? 0),
      0,
    );
    return [
      {
        label: "제작 전용 등록",
        progress: craftOnlyRegisteredCount,
        goal: CRAFT_ONLY_CODEX_REWARDS[0]?.count ?? 4,
        detail: "장인표 도감 보상 시작",
        titleId: CRAFT_ONLY_CODEX_REWARDS[0]?.titleId,
      },
      {
        label: "제작 전용 6부위",
        progress: craftOnlySlots.size,
        goal: 6,
        detail: "부위별 제작 전용 장비 기록",
        titleId: "artisan_full_kit_smith",
      },
      {
        label: "4T 제작",
        progress: highTierCount,
        goal: 1,
        detail: "4T 제작 기록",
        titleId: "artisan_high_tier_smith",
      },
      {
        label: "★ 제작품 종류",
        progress: qualityItemCount,
        goal: 6,
        detail: "품질 제작품 폭 확장",
        titleId: "artisan_masterwork",
      },
      {
        label: "★★ 제작품",
        progress: doubleStarCount,
        goal: 1,
        detail: "최상급 품질 제작 기록",
        titleId: "artisan_double_star_smith",
      },
      {
        label: "명장 제작 반복",
        progress: masterworkCrafts,
        goal: 10,
        detail: "명장 제작품 누적",
        titleId: "artisan_masterwork_smith",
      },
    ];
  })();

  return (
        <div className={`${CODEX_PANEL_SURFACE} space-y-3`}>
          <Card padding="md">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">장비 도감</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  등록 {equipmentCodexMeta.registeredCount} /{" "}
                  {equipmentCodexMeta.total}종 · SP +{equipmentCodexMeta.spBonus}
                </p>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                다음 보상{" "}
                {equipmentCodexMeta.nextMilestone
                  ? `${equipmentCodexMeta.nextMilestone}종`
                  : "신규 장비 추가 시 확장"}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width]"
                style={{
                  width: `${
                    equipmentCodexMeta.total > 0
                      ? Math.min(
                          100,
                          (equipmentCodexMeta.registeredCount /
                            equipmentCodexMeta.total) *
                            100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            {equipmentCodexMeta.milestones.length > 0 && (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                SP 보상: {equipmentCodexMeta.milestones.join(" / ")}종
              </p>
            )}
            {equipmentCodexMsg && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                {equipmentCodexMsg}
              </p>
            )}
          </Card>

          <Card padding="md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">빌드 프리셋 아이디어</h2>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                목표 {activeBuildGoalIds.size}/{MAX_ACTIVE_BUILD_GOALS}
              </span>
            </div>
            {buildGoalMsg && (
              <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                {buildGoalMsg}
              </p>
            )}
            <div className="mt-3 grid gap-2 lg:grid-cols-2">
              {V2_BUILD_PRESETS.map((preset) => {
                const goalActive = activeBuildGoalIds.has(preset.id);
                const busy = buildGoalBusy === preset.id;
                return (
                  <div
                    key={preset.id}
                    className={`rounded-lg border p-3 ${
                      goalActive
                        ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/25"
                        : "border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                          {preset.name}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                          {preset.summary}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(buildGoalBusy)}
                        onClick={() => void toggleBuildGoal(preset.id)}
                        className={`rounded border px-2 py-1 text-[11px] font-semibold transition disabled:cursor-wait disabled:opacity-60 ${
                          goalActive
                            ? "border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200 dark:hover:bg-emerald-900"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                        }`}
                      >
                        {busy ? "저장 중" : goalActive ? "목표 해제" : "목표 지정"}
                      </button>
                    </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {preset.tags.slice(0, 6).map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-emerald-100 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      >
                        {V2_BUILD_TAG_LABEL[tag]}
                      </span>
                    ))}
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        핵심 장비
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {preset.equipmentIds.map((id) => {
                          const item = V2_EQUIPMENT[id];
                          if (!item) return null;
                          return (
                            <button
                              key={id}
                              type="button"
                              onClick={(e) =>
                                onShowCard({
                                  item,
                                  anchor: anchorOf(e.currentTarget),
                                })
                              }
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 transition hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-700"
                            >
                              {item.name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
                        권장 스킬
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {preset.skillIds.map((id) => {
                          const skill = V2_SKILLS[id];
                          if (!skill) return null;
                          return (
                            <span
                              key={id}
                              className="rounded bg-zinc-100 px-1.5 py-0.5 text-[11px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200"
                            >
                              {skill.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-2">
                    <div className="rounded bg-emerald-50 px-2 py-1.5 text-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-200">
                      {preset.strengths.join(" · ")}
                    </div>
                    <div className="rounded bg-zinc-100 px-2 py-1.5 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {preset.weaknesses.join(" · ")}
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </Card>

          <Card padding="md">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-bold">제작 장비 목표</h2>
              <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                대장간 제작 기록 + 장비 도감 등록 기준
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {equipmentCraftGoals.map((goal) => {
                const pct = Math.min(
                  100,
                  Math.round((goal.progress / Math.max(1, goal.goal)) * 100),
                );
                const complete = goal.progress >= goal.goal;
                const title = goal.titleId ? TITLES[goal.titleId] : null;
                return (
                  <div
                    key={goal.label}
                    className={`rounded border px-2.5 py-2 ${
                      complete
                        ? "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30"
                        : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold">{goal.label}</span>
                      <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                        {Math.min(goal.progress, goal.goal).toLocaleString()}/
                        {goal.goal.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className={`h-full rounded-full ${
                          complete ? "bg-emerald-500" : "bg-amber-500"
                        }`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                      <span>{goal.detail}</span>
                      {title ? (
                        <>
                          <span>·</span>
                          <span>{title.name}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>

          {equipmentCodexLoading ? (
            <Card padding="md">
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                장비 도감을 불러오는 중입니다.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_SLOT_ORDER.map((slot) => {
                  const slotEntries = equipmentEntries
                    .filter((id) => V2_EQUIPMENT[id].slot === slot)
                    .filter((id) =>
                      equipmentMatchesBuildFilter(
                        V2_EQUIPMENT[id],
                        equipmentBuildFilter,
                      ),
                    );
                  const registeredCount = slotEntries.filter((id) =>
                    equipmentRegisteredIds.has(id),
                  ).length;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setEquipmentCodexSlot(slot)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        equipmentCodexSlot === slot
                          ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                          : "bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {V2_SLOT_LABEL[slot]} {registeredCount}/{slotEntries.length}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap gap-1.5">
                {EQUIPMENT_BUILD_FILTERS.map((filter) => {
                  const count =
                    filter.key === "all"
                      ? equipmentEntries.length
                      : equipmentEntries.filter((id) =>
                          equipmentMatchesBuildFilter(
                            V2_EQUIPMENT[id],
                            filter.key,
                          ),
                        ).length;
                  return (
                    <button
                      key={filter.key}
                      type="button"
                      onClick={() => setEquipmentBuildFilter(filter.key)}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                        equipmentBuildFilter === filter.key
                          ? "bg-emerald-700 text-white dark:bg-emerald-400 dark:text-emerald-950"
                          : "bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      }`}
                    >
                      {filter.label} {count}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-zinc-500 dark:text-zinc-400">
                  {V2_SLOT_LABEL[equipmentCodexSlot]}{" "}
                  {equipmentSlotRegisteredCount}/{equipmentSlotEntries.length}종
                </div>
                <button
                  type="button"
                  disabled={
                    equipmentCodexBusy !== null ||
                    equipmentSlotRegisterableCount === 0
                  }
                  onClick={() => void registerEquipmentBulk(equipmentCodexSlot)}
                  className="rounded bg-emerald-600 px-2.5 py-1 text-[11px] font-medium text-white transition hover:bg-emerald-700 disabled:bg-zinc-200 disabled:text-zinc-400 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
                >
                  {equipmentCodexBusy === `bulk:${equipmentCodexSlot}`
                    ? "일괄 등록 중"
                    : equipmentBuildFilter === "all"
                      ? "보유 장비 일괄 등록"
                      : "필터 장비 일괄 등록"}
                </button>
              </div>

              {equipmentSlotEntries.length === 0 ? (
                <Card padding="md">
                  <p className="text-sm text-zinc-500 dark:text-zinc-400">
                    이 부위에는 선택한 빌드 축의 장비가 없습니다.
                  </p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {equipmentSlotPager.pageItems.map((id) => {
                    const item = V2_EQUIPMENT[id];
                    const buildTags = buildTagsForEquipment(item).slice(0, 4);
                    const registered = equipmentRegisteredIds.has(id);
                    const ownedCount = equipmentCounts.owned.get(id) ?? 0;
                    const eligible = equipmentCounts.eligible.get(id) ?? [];
                    const inst = eligible[0] ?? null;
                    const craftRecord = equipmentCraftRecords[id];
                    const disabled =
                      registered || !inst || equipmentCodexBusy !== null;
                    const buttonLabel = registered
                      ? "등록됨"
                      : inst
                        ? "등록"
                        : ownedCount > 0
                          ? "장착·잠금"
                          : "보유 없음";
                    const { Icon, color } = EQUIPMENT_SLOT_ICON[item.slot];
                    return (
                    <div
                      key={id}
                      className={`ui-codex-card ui-lift-card relative flex min-h-[7.25rem] flex-col gap-1 p-3 text-left transition ${
                        registered
                          ? "is-registered rounded-lg border border-emerald-400 bg-emerald-50 shadow-sm ring-1 ring-emerald-200 dark:border-emerald-600/80 dark:bg-emerald-950 dark:ring-emerald-900"
                          : `${SURFACE_CARD} hover:bg-zinc-50 dark:hover:bg-zinc-800`
                      } ${!registered && inst ? "is-ready" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={(e) => onShowCard({ item, anchor: anchorOf(e.currentTarget) })}
                        className="flex flex-1 flex-col gap-1 text-left"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <Icon size={20} weight="duotone" className={color} />
                          {registered ? (
                            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-px text-[10px] font-semibold text-white dark:bg-emerald-500 dark:text-emerald-950">
                              <CheckCircle size={12} weight="fill" />
                              등록
                            </span>
                          ) : inst ? (
                            <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-medium text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                              등록 가능
                            </span>
                          ) : (
                            <span className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                              미등록
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 truncate text-sm font-semibold leading-tight text-zinc-900 dark:text-zinc-100">
                          {item.name}
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <EquipmentTierBadge tier={item.tier} compact />
                        </div>
                        <div className="line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {v2ItemTypeLabel(item)} · 위력 {item.power} · 보유{" "}
                          {ownedCount} · 등록 가능 {eligible.length}
                        </div>
                        {buildTags.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {buildTags.map((tag) => (
                              <span
                                key={tag}
                                className="rounded bg-zinc-200 px-1.5 py-px text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                              >
                                {V2_BUILD_TAG_LABEL[tag]}
                              </span>
                            ))}
                          </div>
                        )}
                        {craftRecord ? (
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                            <span className="rounded bg-amber-100 px-1.5 py-px font-medium text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">
                              제작 {craftRecord.crafts.toLocaleString()}회
                            </span>
                            <span className="rounded bg-zinc-200 px-1.5 py-px font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                              최고{" "}
                              {craftRecordQualityText(
                                craftRecord.bestQualityLevel,
                              )}
                            </span>
                            {craftRecord.masterworkCrafts > 0 ? (
                              <span className="rounded bg-rose-100 px-1.5 py-px font-medium text-rose-700 dark:bg-rose-950/60 dark:text-rose-300">
                                명장{" "}
                                {craftRecord.masterworkCrafts.toLocaleString()}
                                회
                              </span>
                            ) : null}
                          </div>
                        ) : null}
                      </button>
                      {!registered && (
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => inst && void registerEquipment(inst)}
                          className={`mt-auto inline-flex h-6 items-center justify-center rounded px-2 text-[11px] font-medium transition ${
                            disabled
                              ? "bg-zinc-200 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                              : "border border-emerald-500 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-600 dark:text-emerald-300 dark:hover:bg-emerald-950"
                          }`}
                        >
                          {equipmentCodexBusy === inst?.iid
                            ? "등록 중"
                            : buttonLabel}
                        </button>
                      )}
                    </div>
                  );
                })}
                </div>
              )}
              <Pagination
                page={equipmentSlotPager.page}
                pageCount={equipmentSlotPager.pageCount}
                setPage={equipmentSlotPager.setPage}
              />
            </div>
          )}
        </div>
  );
}
