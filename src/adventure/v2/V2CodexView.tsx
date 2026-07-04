"use client";

import { useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  Package,
  Sword,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { SURFACE_INSET } from "@/components/ui/surfaces";
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
  isUnique,
  type V2Equipment,
  type V2EquipmentId,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2ItemCard,
  anchorOf,
  type ItemCardAnchor,
} from "./V2ItemCard";
import { FishIcon } from "@/adventure/v2/FishIcon";
import {
  FISHING_CODEX_SP_MILESTONES,
  fishCodexSpBonusForCount,
  nextFishCodexMilestone,
} from "@/adventure/v2/fishingCodex";
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
import { JobCodexList } from "./V2JobCodexView";
import type { JobCodex } from "@/adventure/data/v2/v2JobCodex";
import type { V2LoadoutSpBreakdown } from "./V2LoadoutPanel";
import {
  SP_FRUIT,
  SP_FRUIT_TIERS,
  parseSpFruitUsed,
  type SpFruitTier,
} from "@/adventure/data/v2/spFruit";
import { COOP_BOSSES } from "@/adventure/data/v2/coopBosses";
import { CodexEquipmentPanel } from "./CodexEquipmentPanel";
import { CodexTitlePanel } from "./CodexTitlePanel";

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
const CODEX_PANEL_SURFACE = `${SURFACE_INSET} p-2.5 sm:p-3`;

type FishingCodexMeta = {
  total: number;
  spBonus: number;
  milestones: number[];
  nextMilestone: number | null;
};

const defaultFishingCodexMeta = (discoveredCount = 0): FishingCodexMeta => ({
  total: FISH_IDS.length,
  spBonus: fishCodexSpBonusForCount(discoveredCount),
  milestones: [...FISHING_CODEX_SP_MILESTONES],
  nextMilestone: nextFishCodexMilestone(discoveredCount),
});

type CodexTab =
  | "huntground"
  | "materials"
  | "equipment"
  | "spFruit"
  | "fish"
  | "treasure"
  | "title"
  | "job";

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
  const [fishingCodexMeta, setFishingCodexMeta] = useState<FishingCodexMeta>(
    () => defaultFishingCodexMeta(),
  );
  const [antiqueDiscovered, setAntiqueDiscovered] = useState<Set<string>>(new Set());
  const [antiqueBest, setAntiqueBest] = useState<Record<string, number>>({});
  // 사냥터 도감 — 최고 도달 깊이(frontierDepth)까지 닿은 테마만 공개("처리했을 때 기준").
  const [frontierDepth, setFrontierDepth] = useState(0);
  const [spFruitUsed, setSpFruitUsed] = useState<Record<SpFruitTier, number>>(
    () => parseSpFruitUsed(undefined),
  );
  const [spFruitCapBonus, setSpFruitCapBonus] = useState(0);
  const [spBreakdown, setSpBreakdown] =
    useState<V2LoadoutSpBreakdown | null>(null);
  // 칭호 — 보유 목록(획득한 것만)·현재 장착. 장착은 /api/v2/me/equip-title POST.
  const [ownedTitleIds, setOwnedTitleIds] = useState<string[]>([]);
  const [equippedTitleId, setEquippedTitleId] = useState<string | null>(null);
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
        let fishingDiscoveredCount = 0;
        if (Array.isArray(j?.fishingCodex?.discoveredIds)) {
          const ids = j.fishingCodex.discoveredIds as string[];
          fishingDiscoveredCount = ids.length;
          setFishDiscovered(new Set(ids));
        }
        const fallbackFishingMeta =
          defaultFishingCodexMeta(fishingDiscoveredCount);
        const fishingMilestones = Array.isArray(j?.fishingCodex?.milestones)
          ? j.fishingCodex.milestones.filter(
              (n: unknown): n is number => typeof n === "number",
            )
          : fallbackFishingMeta.milestones;
        setFishingCodexMeta({
          total:
            typeof j?.fishingCodex?.total === "number"
              ? j.fishingCodex.total
              : fallbackFishingMeta.total,
          spBonus:
            typeof j?.fishingCodex?.spBonus === "number"
              ? j.fishingCodex.spBonus
              : fallbackFishingMeta.spBonus,
          milestones: fishingMilestones,
          nextMilestone:
            typeof j?.fishingCodex?.nextMilestone === "number" ||
            j?.fishingCodex?.nextMilestone === null
              ? j.fishingCodex.nextMilestone
              : fallbackFishingMeta.nextMilestone,
        });
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
        if (j?.spFruit?.used && typeof j.spFruit.used === "object") {
          setSpFruitUsed(parseSpFruitUsed(j.spFruit.used));
        }
        if (typeof j?.spFruit?.capBonus === "number") {
          setSpFruitCapBonus(j.spFruit.capBonus);
        }
        if (
          j?.loadout?.spBreakdown &&
          typeof j.loadout.spBreakdown === "object"
        ) {
          setSpBreakdown(j.loadout.spBreakdown as V2LoadoutSpBreakdown);
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
  const spFruitUseCap = SP_FRUIT_TIERS.reduce(
    (sum, tier) => sum + SP_FRUIT[tier].useCap,
    0,
  );
  const spFruitUsedTotal = SP_FRUIT_TIERS.reduce(
    (sum, tier) => sum + (spFruitUsed[tier] ?? 0),
    0,
  );
  const spFishBonus =
    spBreakdown?.collectionBonus?.fishSp ?? fishingCodexMeta.spBonus;
  const spTreasureBonus = spBreakdown?.collectionBonus?.treasureSp ?? 0;
  const spEquipmentBonus = spBreakdown?.equipmentCodexBonus ?? 0;
  const spJobUnlockBonus = spBreakdown?.jobUnlockSp ?? 0;
  const spSoftCapReduction = spBreakdown?.softCapReduction ?? 0;
  const spCurrentTotal =
    spBreakdown == null
      ? spFruitCapBonus + spFishBonus
      : spBreakdown.base +
        spJobUnlockBonus -
        spSoftCapReduction +
        spBreakdown.spFruitBonus +
        spFishBonus +
        spTreasureBonus +
        spEquipmentBonus;
  const spSourceRows = [
    {
      label: "기본 SP",
      value: spBreakdown?.base ?? 0,
      detail: "캐릭터 기본 예산",
    },
    {
      label: "직업 해금",
      value: spJobUnlockBonus,
      detail: "직업 트리 해금 보너스",
      signed: true,
    },
    {
      label: "어보",
      value: spFishBonus,
      detail: "낚시 도감 보상",
      signed: true,
    },
    {
      label: "유물",
      value: spTreasureBonus,
      detail: "발굴 도감 보상",
      signed: true,
    },
    {
      label: "장비 도감",
      value: spEquipmentBonus,
      detail: "장비 등록 보상",
      signed: true,
    },
    {
      label: "SP 열매",
      value: spBreakdown?.spFruitBonus ?? spFruitCapBonus,
      detail: `사용 ${spFruitUsedTotal}/${spFruitUseCap}개`,
      signed: true,
    },
    ...(spSoftCapReduction > 0
      ? [
          {
            label: "상한 조정",
            value: -spSoftCapReduction,
            detail: "기본·직업 해금 합산 소프트캡",
          },
        ]
      : []),
  ];
  const fishDiscoveredCount = fishDiscovered.size;

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
            ["spFruit", "SP 수집"],
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


      {tab === "equipment" && <CodexEquipmentPanel onShowCard={setCard} />}

      {tab === "spFruit" && (
        <div className={`${CODEX_PANEL_SURFACE} space-y-3`}>
          <Card padding="md">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">SP 수집 현황</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {spBreakdown ? "현재 SP 최대치" : "확인된 수집 보너스"}{" "}
                  {spCurrentTotal} · SP 열매 +{spFruitCapBonus}
                </p>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                영구 SP 기록
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {spSourceRows.map((row) => (
                <div
                  key={row.label}
                  className="rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-900/70"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {row.label}
                    </span>
                    <span
                      className={`text-sm font-bold tabular-nums ${
                        row.value < 0
                          ? "text-rose-600 dark:text-rose-300"
                          : "text-zinc-900 dark:text-zinc-100"
                      }`}
                    >
                      {row.value > 0 && row.signed ? "+" : ""}
                      {row.value}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                    {row.detail}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-2 sm:grid-cols-3">
            {SP_FRUIT_TIERS.map((tier) => {
              const def = SP_FRUIT[tier];
              const used = spFruitUsed[tier] ?? 0;
              const source = COOP_BOSSES[def.bossKind]?.name ?? "협동 보스";
              const complete = used >= def.useCap;
              return (
                <Card key={tier} padding="md">
                  <div className="flex min-h-[8.75rem] flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-bold">
                          {def.name}
                        </h3>
                        <p className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                          {source} 보상
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          complete
                            ? "bg-emerald-200/70 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200"
                            : "bg-amber-200/70 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200"
                        }`}
                      >
                        {complete ? "완료" : "진행"}
                      </span>
                    </div>

                    <div className="mt-3 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-100">
                      {used}
                      <span className="text-sm font-semibold text-zinc-500 dark:text-zinc-400">
                        /{def.useCap}
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{
                          width: `${Math.min(100, (used / def.useCap) * 100)}%`,
                        }}
                      />
                    </div>
                    <div className="mt-auto pt-3 text-[11px] text-zinc-500 dark:text-zinc-400">
                      현재 SP +{used * def.spPerUse} · 1개당 SP +
                      {def.spPerUse}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
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
          <Card padding="md">
            <div className="flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">어보</h2>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  발견 {fishDiscoveredCount} / {fishingCodexMeta.total}종 · SP +
                  {fishingCodexMeta.spBonus}
                </p>
              </div>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">
                다음 보상{" "}
                {fishingCodexMeta.nextMilestone
                  ? `${fishingCodexMeta.nextMilestone}종`
                  : "신규 어종 추가 시 확장"}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-[width]"
                style={{
                  width: `${
                    fishingCodexMeta.total > 0
                      ? Math.min(
                          100,
                          (fishDiscoveredCount / fishingCodexMeta.total) * 100,
                        )
                      : 0
                  }%`,
                }}
              />
            </div>
            {fishingCodexMeta.milestones.length > 0 && (
              <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                SP 보상: {fishingCodexMeta.milestones.join(" / ")}종
              </p>
            )}
          </Card>
          {FISH_TIER_ORDER.map((tier) => {
            const meta = FISH_TIERS[tier];
            const species = FISH_IDS.filter((id) => FISH[id].tier === tier);
            const discoveredCount = species.filter((id) =>
              fishDiscovered.has(id),
            ).length;
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
      {tab === "title" && (
        <CodexTitlePanel
          ownedTitleIds={ownedTitleIds}
          equippedTitleId={equippedTitleId}
          onEquippedTitleChange={setEquippedTitleId}
        />
      )}
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
