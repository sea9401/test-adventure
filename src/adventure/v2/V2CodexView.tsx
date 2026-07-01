"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  CheckCircle,
  Circle,
  Crown,
  Diamond,
  HandFist,
  Package,
  Shield,
  Sneaker,
  Sword,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/ui/Pagination";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { usePagination } from "@/lib/usePagination";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  MATERIAL_DROP_SOURCES,
  type V2MaterialId,
  type MaterialDropSource,
} from "@/adventure/data/v2/dungeonDrops";
import {
  MAIN_DUNGEON,
  dungeonThemeCatalog,
} from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { scaleMonsterForFloor } from "@/adventure/data/v2/monsterScale";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import { V2_SKILLS, type V2SkillId } from "@/adventure/data/v2/v2Skills";
import {
  dropPoolForDepth,
  type FloorEquipDropPool,
} from "@/adventure/data/v2/dungeonEquipDrops";
import {
  uniqueIdsForDepthRange,
  bandCommonPoolForDepth,
  bandCommonChanceForDepth,
} from "@/adventure/data/v2/dungeonUniqueDrops";
import {
  V2_EQUIPMENT,
  V2_SLOT_LABEL,
  effectiveStats,
  isUnique,
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
import { V2ItemCard, anchorOf, type ItemCardAnchor } from "./V2ItemCard";
import { FishIcon } from "@/adventure/v2/FishIcon";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  formatFishSize,
  type FishTier,
} from "@/adventure/data/v2/fish";
import {
  ANTIQUES,
  ANTIQUE_IDS,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  ANTIQUE_THEME_LABEL,
  formatCondition,
} from "@/adventure/data/v2/antique";
import {
  TITLES,
  TITLE_CATEGORY_ORDER,
  type TitleCategory,
} from "@/adventure/data/titles";
import { JobCodexList } from "./V2JobCodexView";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";

// v2 모험의 서 — 사냥터 + 재료 도감 + 어보(어종) + 유물(골동품) + 직업(거쳐온 직업/스킬 수집) 탭.
// 정적 카탈로그(전종 공개)는 /me/state 가 발견 여부 권위. 직업 도감만 별도(/api/v2/me/job-codex, lazy).

// floor id → "들판 (Lv 1~5)" 식 표시명. MAIN_DUNGEON 이 단일 출처.
const FLOOR_LABEL: Record<DungeonFloorId, string> = (() => {
  const out = {} as Record<DungeonFloorId, string>;
  for (const f of MAIN_DUNGEON.floors) {
    const req =
      f.requirement.kind === "power"
        ? ` (권장 전투력 ${f.requirement.min})`
        : "";
    out[f.id] = `${f.name}${req}`;
  }
  return out;
})();

function formatChance(chance: number): string {
  return `${(chance * 100).toFixed(chance < 0.01 ? 2 : 1)}%`;
}

function formatAmount(s: MaterialDropSource): string {
  return s.amountMin === s.amountMax
    ? `×${s.amountMin}`
    : `×${s.amountMin}~${s.amountMax}`;
}

// 도감 티어 배지 색 — 어보·유물 공용(티어 키가 동일).
const TIER_BADGE: Record<FishTier, string> = {
  common:
    "bg-zinc-200/70 text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300",
  uncommon:
    "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200",
  rare: "bg-sky-200/70 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200",
  epic: "bg-violet-200/70 text-violet-800 dark:bg-violet-900/60 dark:text-violet-200",
  legendary:
    "bg-amber-200/80 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200",
};

type CodexTab =
  | "huntground"
  | "materials"
  | "equipment"
  | "fish"
  | "treasure"
  | "title"
  | "job";

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
function equipPoolChance(pool: FloorEquipDropPool): number {
  return pool.chance;
}

// 드랍 목록의 아이템 칩 — 클릭하면 옵션 팝오버(V2ItemCard, 인벤과 동일)를 띄운다.
//   카탈로그 id 가 V2_EQUIPMENT 에 없으면(방어) 클릭 불가 라벨로만.
function DropChip({
  id,
  unique,
  onOpen,
}: {
  id: V2EquipmentId;
  unique?: boolean;
  onOpen: (item: V2Equipment, anchor: ItemCardAnchor) => void;
}) {
  const item = V2_EQUIPMENT[id];
  const tone = unique
    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300"
    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200";
  if (!item) {
    return (
      <span className={`rounded px-1.5 py-0.5 text-[11px] ${tone}`}>{id}</span>
    );
  }
  const hover = unique
    ? "hover:bg-amber-200 dark:hover:bg-amber-900/60"
    : "hover:bg-zinc-200 dark:hover:bg-zinc-700";
  return (
    <button
      type="button"
      onClick={(e) => onOpen(item, anchorOf(e.currentTarget))}
      className={`rounded px-1.5 py-0.5 text-[11px] transition-colors ${tone} ${hover}`}
    >
      {item.name}
    </button>
  );
}

// 스타터 풀(깊이 1~12)이 떨어뜨릴 수 있는 정규 그리드 장비 id — 티어 가중 후 무작위 슬롯·컨셉으로
//   뽑히므로 그 티어들의 그리드 전 종류가 후보. 유니크·제작전용·전문화스타터·밴드흔한(noDrop) 제외.
function starterGridIds(pool: FloorEquipDropPool): V2EquipmentId[] {
  const tiers = new Set(
    Object.entries(pool.tierWeights)
      .filter(([, w]) => (w ?? 0) > 0)
      .map(([t]) => Number(t)),
  );
  return (Object.keys(V2_EQUIPMENT) as V2EquipmentId[]).filter((id) => {
    const it = V2_EQUIPMENT[id];
    return (
      tiers.has(it.tier) &&
      !isUnique(it) &&
      !it.craftOnly &&
      !it.starterOnly &&
      !it.noDrop
    );
  });
}

export function V2CodexView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<CodexTab>("huntground");
  // 드랍 칩 클릭 시 뜨는 옵션 팝오버(읽기전용 카탈로그 미리보기 — 굴림 없음).
  const [card, setCard] = useState<{
    item: V2Equipment;
    anchor: ItemCardAnchor;
  } | null>(null);

  // 내 도감 진척 — /me/state 가 권위. 재료: 수집한 id 집합. 어보: 발견 id + 종별 최대어.
  // 유물: 발견 id + 종별 최고 보존상태.
  const [discovered, setDiscovered] = useState<Set<string>>(new Set());
  const [fishDiscovered, setFishDiscovered] = useState<Set<string>>(new Set());
  const [fishBest, setFishBest] = useState<Record<string, number>>({});
  const [antiqueDiscovered, setAntiqueDiscovered] = useState<Set<string>>(new Set());
  const [antiqueBest, setAntiqueBest] = useState<Record<string, number>>({});
  // 사냥터 도감 — 최고 도달 깊이(frontierDepth)까지 닿은 테마만 공개("처리했을 때 기준").
  const [frontierDepth, setFrontierDepth] = useState(0);
  // 칭호 — 보유 목록(획득한 것만)·현재 장착. 장착은 /api/v2/me/equip-title POST.
  const [ownedTitleIds, setOwnedTitleIds] = useState<string[]>([]);
  const [equippedTitleId, setEquippedTitleId] = useState<string | null>(null);
  const [titleBusy, setTitleBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive || !j) return;
        if (Array.isArray(j?.codex?.discoveredIds)) {
          setDiscovered(new Set(j.codex.discoveredIds as string[]));
        }
        // 어보 진척은 PR-2 에서 라우트가 채운다. 없으면 빈 상태(전종 미발견).
        if (Array.isArray(j?.fishingCodex?.discoveredIds)) {
          setFishDiscovered(new Set(j.fishingCodex.discoveredIds as string[]));
        }
        if (j?.fishingCodex?.best && typeof j.fishingCodex.best === "object") {
          setFishBest(j.fishingCodex.best as Record<string, number>);
        }
        // 유물 진척은 발굴 PR 에서 라우트가 채운다. 없으면 빈 상태(전종 미발견).
        if (Array.isArray(j?.treasureCodex?.discoveredIds)) {
          setAntiqueDiscovered(new Set(j.treasureCodex.discoveredIds as string[]));
        }
        if (j?.treasureCodex?.best && typeof j.treasureCodex.best === "object") {
          setAntiqueBest(j.treasureCodex.best as Record<string, number>);
        }
        if (typeof j?.frontierDepth === "number") {
          setFrontierDepth(j.frontierDepth);
        }
        if (Array.isArray(j?.titles?.ownedTitleIds)) {
          setOwnedTitleIds(j.titles.ownedTitleIds as string[]);
        }
        setEquippedTitleId(
          typeof j?.titles?.equippedTitleId === "string"
            ? j.titles.equippedTitleId
            : null,
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // 직업 도감 — 별도 엔드포인트라 "직업" 탭 최초 진입 시 1회만 lazy-load(이미 있으면 재요청 안 함).
  const [jobCodex, setJobCodex] = useState<JobCodex | null>(null);
  const [jobCodexLoading, setJobCodexLoading] = useState(false);
  useEffect(() => {
    if (tab !== "job" || jobCodex) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 직업 탭 최초 진입 시 도감 lazy fetch
    setJobCodexLoading(true);
    fetch("/api/v2/me/job-codex")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { ok?: boolean; codex?: JobCodex } | null) => {
        if (alive && j?.ok && j.codex) setJobCodex(j.codex);
      })
      .catch(() => null)
      .finally(() => {
        if (alive) setJobCodexLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, jobCodex]);

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

  useEffect(() => {
    if (tab !== "equipment") return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 장비 탭 진입 시 도감/보유 장비 lazy fetch
    setEquipmentCodexLoading(true);
    setEquipmentCodexMsg(null);
    Promise.all([
      fetch("/api/v2/me/equipment-codex").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/v2/me/equipment").then((r) => (r.ok ? r.json() : null)),
    ])
      .then(([codex, equipment]) => {
        if (!alive) return;
        applyEquipmentCodexPayload(codex as EquipmentCodexResponse | null);
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
  }, [tab]);

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
    } finally {
      setEquipmentCodexBusy(null);
    }
  }

  // 칭호 장착/해제 — 낙관적 갱신 후 서버 확정(실패 시 롤백). titleId=null 이면 해제.
  const equipTitle = async (titleId: string | null) => {
    if (titleBusy || titleId === equippedTitleId) return;
    const prev = equippedTitleId;
    setTitleBusy(true);
    setEquippedTitleId(titleId);
    try {
      const res = await fetch("/api/v2/me/equip-title", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ titleId }),
      });
      const j = (await res.json()) as { ok?: boolean; equippedTitleId?: unknown };
      if (!res.ok || !j?.ok) throw new Error();
      setEquippedTitleId(
        typeof j.equippedTitleId === "string" ? j.equippedTitleId : null,
      );
    } catch {
      setEquippedTitleId(prev);
    } finally {
      setTitleBusy(false);
    }
  };

  // 보유 칭호를 카테고리별로 묶음(존재하는 칭호만 — 옛 V1 칭호는 미보유라 자연히 빠짐).
  const ownedTitlesByCategory = (() => {
    const out: Partial<Record<TitleCategory, { id: string }[]>> = {};
    for (const id of ownedTitleIds) {
      const t = TITLES[id];
      if (!t) continue;
      (out[t.category] ??= []).push({ id });
    }
    return out;
  })();
  const ownedTitleCount = ownedTitleIds.filter((id) => TITLES[id]).length;

  // 드랍 출처가 하나라도 있는 재료만 — 출처 없는 재료(미배치)는 숨긴다.
  const materialEntries = (Object.keys(V2_MATERIALS) as V2MaterialId[])
    .map((id) => ({
      id,
      material: V2_MATERIALS[id],
      sources: MATERIAL_DROP_SOURCES[id],
      sellPrice: V2_MATERIAL_SELL_PRICE[id],
    }))
    .filter((e) => e.sources.length > 0)
    .sort((a, b) => a.material.name.localeCompare(b.material.name));
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
  const equipmentSlotEntries = equipmentEntries.filter(
    (id) => V2_EQUIPMENT[id].slot === equipmentCodexSlot,
  );
  const equipmentSlotPager = usePagination(
    equipmentSlotEntries,
    EQUIPMENT_CODEX_PAGE_SIZE,
    equipmentCodexSlot,
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
        label: "T10+ 제작",
        progress: highTierCount,
        goal: 1,
        detail: "왕도급 제작 기록",
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

  // 도달한 깊이까지의 사냥터 테마(들판/마른 협곡/…) — 테마당 1개.
  const themes = dungeonThemeCatalog(frontierDepth);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 px-4 py-5 text-zinc-900 sm:p-6 dark:text-zinc-100">
      <SubViewHeader title="모험의 서" onBack={onBack} />
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["huntground", "사냥터"],
            ["equipment", "장비"],
            ["fish", "어보"],
            ["treasure", "유물"],
            ["title", "칭호"],
            ["job", "직업"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              tab === key
                ? "bg-zinc-900 text-zinc-50 dark:bg-zinc-100 dark:text-zinc-900"
                : "bg-zinc-200/70 text-zinc-600 hover:bg-zinc-300/70 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "huntground" &&
        (themes.length === 0 ? (
          <EmptyState
            icon={<Sword size={40} weight="duotone" />}
            title="아직 도달한 사냥터가 없습니다"
            message="사냥을 떠나 새로운 구역을 개척하면 여기에 몬스터와 드랍 정보가 기록됩니다."
          />
        ) : (
          <div className="space-y-3">
            {themes.map((theme) => {
              const pool = dropPoolForDepth(theme.depthStart);
              const band = bandCommonPoolForDepth(theme.depthStart);
              const uniqueIds = uniqueIdsForDepthRange(
                theme.depthStart,
                theme.depthEnd,
              );
              // 일반 장비 드랍 목록 — 밴드 흔한 13종(13~48) 또는 스타터 그리드(1~12). + 처치당 확률 라벨.
              const regularIds: V2EquipmentId[] = band
                ? band.ids
                : pool
                  ? starterGridIds(pool)
                  : [];
              const regularChance = band
                ? (() => {
                    const lo = bandCommonChanceForDepth(theme.depthStart);
                    const hi = bandCommonChanceForDepth(theme.depthEnd);
                    return lo === hi
                      ? `처치당 ${(lo * 100).toFixed(2)}%`
                      : `처치당 ${(lo * 100).toFixed(2)}~${(hi * 100).toFixed(2)}%`;
                  })()
                : pool
                  ? `처치당 ${(equipPoolChance(pool) * 100).toFixed(0)}% · 무작위 1종`
                  : "";
              return (
                <Card key={theme.name} padding="md">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 pb-1.5 dark:border-zinc-800">
                    <h2 className="text-sm font-bold">{theme.name}</h2>
                    <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                      깊이 {theme.depthStart}~{theme.depthEnd}
                    </span>
                  </div>

                  {/* 몬스터 — 처리한(최고 도달) 깊이 기준 스탯. */}
                  <p className="mb-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                    몬스터 스탯 = 도달한 깊이 {theme.depthEnd} 기준 (속성 상성 전)
                  </p>
                  <div className="space-y-1.5">
                    {theme.enemies.map((e) => {
                      const base = V2_MONSTERS[e.key];
                      if (!base) return null;
                      const m = scaleMonsterForFloor(base, theme.depthEnd);
                      const elem = e.element ? V2_ELEMENT_LABEL[e.element] : null;
                      const status = e.statusSkill
                        ? (V2_SKILLS[e.statusSkill as V2SkillId]?.name ?? null)
                        : null;
                      // 이미지 — 사냥(hunt)과 동일 우선순위(enemy override ?? 몬스터 카탈로그).
                      const img = e.image ?? base.image;
                      return (
                        <div
                          key={e.key}
                          className="flex items-center gap-2 rounded-md bg-zinc-50 px-2 py-1.5 dark:bg-zinc-900/60"
                        >
                          {img ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={img}
                              alt=""
                              className="h-8 w-8 shrink-0 rounded object-cover"
                            />
                          ) : (
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-zinc-200 text-zinc-400 dark:bg-zinc-800">
                              <Sword size={16} weight="duotone" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="truncate text-sm font-medium">
                                {e.name}
                              </span>
                              {elem && elem !== "무" && (
                                <span className="rounded bg-zinc-200 px-1 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                                  {elem}
                                </span>
                              )}
                              {status && (
                                <span className="rounded bg-rose-100 px-1 text-[10px] text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                                  {status}
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                              HP {m.hp} · 공 {m.atk} · 방 {m.def} · EXP {m.exp}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* 드랍 — 일반 장비 목록 + 유니크 목록(아이템명 칩). */}
                  <div className="mt-2.5 space-y-2 border-t border-zinc-200 pt-2 dark:border-zinc-800">
                    <div>
                      <div className="mb-1 flex items-baseline gap-1.5">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          장비
                        </span>
                        {regularIds.length > 0 && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {regularChance}
                          </span>
                        )}
                      </div>
                      {regularIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {regularIds.map((id) => (
                            <DropChip
                              key={id}
                              id={id}
                              onOpen={(item, anchor) =>
                                setCard({ item, anchor })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          일반 장비 드랍 없음
                        </span>
                      )}
                    </div>
                    <div>
                      <div className="mb-1 flex items-baseline gap-1.5">
                        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                          유니크
                        </span>
                        {uniqueIds.length > 0 && (
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            매우 낮은 확률
                          </span>
                        )}
                      </div>
                      {uniqueIds.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {uniqueIds.map((id) => (
                            <DropChip
                              key={id}
                              id={id}
                              unique
                              onOpen={(item, anchor) =>
                                setCard({ item, anchor })
                              }
                            />
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-zinc-400 dark:text-zinc-500">
                          없음
                        </span>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        ))}

      {tab === "equipment" && (
        <div className="space-y-3">
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
                  const slotEntries = equipmentEntries.filter(
                    (id) => V2_EQUIPMENT[id].slot === slot,
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
                    : "보유 장비 일괄 등록"}
                </button>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {equipmentSlotPager.pageItems.map((id) => {
                  const item = V2_EQUIPMENT[id];
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
                        onClick={(e) => setCard({ item, anchor: anchorOf(e.currentTarget) })}
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
                        <div className="line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                          {v2ItemTypeLabel(item)} · 위력 {item.power} · 무게{" "}
                          {item.weight} · 보유 {ownedCount} · 등록 가능{" "}
                          {eligible.length}
                        </div>
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
              <Pagination
                page={equipmentSlotPager.page}
                pageCount={equipmentSlotPager.pageCount}
                setPage={equipmentSlotPager.setPage}
              />
            </div>
          )}
        </div>
      )}

      {tab === "materials" && (
        materialEntries.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="duotone" />}
            title="아직 기록된 재료가 없습니다"
            message="사냥터에서 재료를 얻으면 여기에 출처가 표시됩니다."
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {materialEntries.map(({ id, material, sources, sellPrice }) => {
                const found = discovered.has(id);
                return (
                  <li
                    key={id}
                    className={`ui-codex-card px-3 py-2.5 ${found ? "is-registered" : "opacity-50"}`}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        📦 {material.name}
                        {found ? (
                          <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                            등재
                          </span>
                        ) : (
                          <span className="rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                            미발견
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-zinc-500 dark:text-zinc-400">
                        판매 {sellPrice}골드
                      </span>
                    </div>
                    {material.description && (
                      <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                        {material.description}
                      </p>
                    )}
                    <ul className="mt-2 space-y-0.5 border-t border-dashed border-zinc-200 pt-1.5 text-[11px] dark:border-zinc-700">
                      {sources.map((s) => (
                        <li
                          key={s.floorId}
                          className="flex items-center justify-between gap-2 py-0.5"
                        >
                          <span className="flex items-center gap-1.5 text-zinc-800 dark:text-zinc-200">
                            <span className="text-zinc-400 dark:text-zinc-500">
                              ⛰️
                            </span>
                            {FLOOR_LABEL[s.floorId]}
                            <span className="text-zinc-500 dark:text-zinc-400">
                              {formatAmount(s)}
                            </span>
                          </span>
                          <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                            {formatChance(s.chance)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </Card>
        )
      )}
      {tab === "fish" && (
        <div className="space-y-3">
          {FISH_TIER_ORDER.map((tier) => {
            const meta = FISH_TIERS[tier];
            const species = FISH_IDS.filter((id) => FISH[id].tier === tier);
            const discoveredCount = species.filter((id) =>
              fishDiscovered.has(id),
            ).length;
            const complete =
              species.length > 0 && discoveredCount === species.length;
            return (
              <Card key={tier} padding="none" className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                  >
                    {meta.label}
                  </span>
                  <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      {discoveredCount}/{species.length}
                    </span>
                    <span
                      className={
                        complete
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {complete ? "SP +1 획득" : "완성 시 SP +1"}
                    </span>
                    <span>1등 보상 {meta.recordCoins.rank1}코인</span>
                  </div>
                </div>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {species.map((id) => {
                    const fish = FISH[id];
                    const found = fishDiscovered.has(id);
                    const best = fishBest[id];
                    return (
                      <li
                        key={id}
                        className={`px-3 py-2.5 ${found ? "" : "opacity-50"}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            <FishIcon
                              fishId={id}
                              name={found ? fish.name : undefined}
                              decorative={!found}
                              className={`h-6 w-6 ${found ? "" : "grayscale"}`}
                            />
                            {found ? fish.name : "???"}
                            {found ? (
                              <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                등재
                              </span>
                            ) : (
                              <span className="rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                                미발견
                              </span>
                            )}
                          </span>
                          {found && typeof best === "number" && best > 0 && (
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                              최대어 {formatFishSize(best)}
                            </span>
                          )}
                        </div>
                        {found && fish.description && (
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {fish.description}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      {tab === "treasure" && (
        <div className="space-y-3">
          {ANTIQUE_TIER_ORDER.map((tier) => {
            const meta = ANTIQUE_TIERS[tier];
            const kinds = ANTIQUE_IDS.filter((id) => ANTIQUES[id].tier === tier);
            const discoveredCount = kinds.filter((id) =>
              antiqueDiscovered.has(id),
            ).length;
            const complete =
              kinds.length > 0 && discoveredCount === kinds.length;
            return (
              <Card key={tier} padding="none" className="overflow-hidden">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                  >
                    {meta.label}
                  </span>
                  <div className="flex flex-wrap justify-end gap-x-2 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    <span>
                      {discoveredCount}/{kinds.length}
                    </span>
                    <span
                      className={
                        complete
                          ? "font-semibold text-emerald-600 dark:text-emerald-400"
                          : ""
                      }
                    >
                      {complete ? "SP +1 획득" : "완성 시 SP +1"}
                    </span>
                  </div>
                </div>
                <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
                  {kinds.map((id) => {
                    const antique = ANTIQUES[id];
                    const found = antiqueDiscovered.has(id);
                    const best = antiqueBest[id];
                    return (
                      <li
                        key={id}
                        className={`px-3 py-2.5 ${found ? "" : "opacity-50"}`}
                      >
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            🏺 {found ? antique.name : "???"}
                            {found ? (
                              <span className="rounded bg-emerald-200/70 px-1 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200">
                                등재
                              </span>
                            ) : (
                              <span className="rounded bg-zinc-200/70 px-1 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-700/60 dark:text-zinc-300">
                                미발견
                              </span>
                            )}
                          </span>
                          {found && typeof best === "number" && best > 0 && (
                            <span className="shrink-0 text-[11px] font-medium tabular-nums text-amber-600 dark:text-amber-400">
                              최고 {formatCondition(best)}
                            </span>
                          )}
                        </div>
                        {found && (
                          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                            {ANTIQUE_THEME_LABEL[antique.theme]} · 감정가 기준{" "}
                            {antique.baseValue}골드
                          </p>
                        )}
                        {found && antique.description && (
                          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                            {antique.description}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
      {tab === "title" &&
        (ownedTitleCount === 0 ? (
          <EmptyState
            icon={<Crown size={40} weight="duotone" />}
            title="아직 획득한 칭호가 없습니다"
            message="낚시·발굴·투기장 상점과 수집 보상으로 칭호를 모으면 여기서 장착할 수 있어요. 장착한 칭호는 채팅과 접속자 목록에 표시됩니다."
          />
        ) : (
          <div className="space-y-4">
            <Card padding="sm">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    현재 장착
                  </div>
                  <div className="truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                    {equippedTitleId && TITLES[equippedTitleId]
                      ? TITLES[equippedTitleId].name
                      : "미장착"}
                  </div>
                </div>
                {equippedTitleId && (
                  <button
                    type="button"
                    disabled={titleBusy}
                    onClick={() => equipTitle(null)}
                    className="shrink-0 rounded-full border border-zinc-300 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    해제
                  </button>
                )}
              </div>
            </Card>
            {TITLE_CATEGORY_ORDER.filter(
              (cat) => (ownedTitlesByCategory[cat.id]?.length ?? 0) > 0,
            ).map((cat) => (
              <div key={cat.id} className="space-y-1.5">
                <h3 className="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                  {cat.label}
                </h3>
                <div className="grid gap-2 sm:grid-cols-2">
                  {(ownedTitlesByCategory[cat.id] ?? []).map(({ id }) => {
                    const t = TITLES[id];
                    const isEquipped = equippedTitleId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        disabled={titleBusy}
                        onClick={() => equipTitle(isEquipped ? null : id)}
                        className={`rounded-lg border p-3 text-left transition disabled:opacity-60 ${
                          isEquipped
                            ? "border-amber-400 bg-amber-50 dark:border-amber-500/70 dark:bg-amber-900/20"
                            : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        }`}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                            {t.name}
                          </span>
                          {isEquipped && (
                            <span className="rounded-full bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">
                              장착됨
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-zinc-600 dark:text-zinc-300">
                          {t.description}
                        </p>
                        <p className="mt-1 text-[11px] text-zinc-400 dark:text-zinc-500">
                          {t.condition}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ))}
      {tab === "job" &&
        (jobCodex ? (
          <JobCodexList codex={jobCodex} />
        ) : (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {jobCodexLoading
                ? "직업 도감을 불러오는 중…"
                : "직업 도감을 불러오지 못했어요."}
            </p>
          </Card>
        ))}

      {/* 드랍 칩 클릭 → 아이템 옵션 팝오버. 카탈로그 미리보기(굴림·장착 액션 없음). */}
      {card && (
        <V2ItemCard
          item={card.item}
          anchor={card.anchor}
          onClose={() => setCard(null)}
        />
      )}
    </main>
  );
}
