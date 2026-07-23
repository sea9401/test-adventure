"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Compass, MapPin, Sparkle } from "@phosphor-icons/react";
import { FISH } from "@/adventure/data/v2/fish";
import {
  FISHING_SPOTS,
  FISHING_SPOT_DIFFICULTY_LABEL,
  fishNames,
  isFishingSpotId,
  tierCountsForSpot,
} from "@/adventure/data/v2/fishingSpots";
import {
  WOODCUTTING_SPOTS,
  isWoodcuttingSpotId,
  woodcuttingTreeForSpot,
} from "@/adventure/data/v2/woodcuttingSpots";
import {
  MINING_SPOTS,
  isMiningSpotId,
  miningNodeForSpot,
} from "@/adventure/data/v2/miningSpots";
import { woodcuttingFailureRate } from "@/adventure/v2/woodcuttingProgression";
import { miningFailureRate } from "@/adventure/v2/miningProgression";
import { LifeActivityIcon } from "@/adventure/v2/LifeActivityIcons";
import {
  WORLD_ACTIVITY_KIND_LABEL,
  WORLD_ACTIVITY_REGIONS,
  type WorldActivityKind,
  type WorldActivityRegion,
} from "@/adventure/data/v2/worldRumors";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const KIND_STYLE: Record<
  WorldActivityKind,
  {
    icon: string;
    badge: string;
    activeCard: string;
    detail: string;
    cta: string;
  }
> = {
  fishing: {
    icon: "bg-sky-100 text-sky-700 dark:bg-sky-950 dark:text-sky-200",
    badge:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
    activeCard:
      "border-sky-500 bg-sky-50 text-sky-950 shadow-sm dark:border-sky-700 dark:bg-sky-950 dark:text-sky-100",
    detail: "border-l-4 border-l-sky-500 dark:border-l-sky-500",
    cta:
      "border-sky-700 bg-sky-600 hover:bg-sky-700 dark:border-sky-600 dark:bg-sky-700 dark:hover:bg-sky-600",
  },
  woodcutting: {
    icon:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
    activeCard:
      "border-emerald-500 bg-emerald-50 text-emerald-950 shadow-sm dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100",
    detail: "border-l-4 border-l-emerald-500 dark:border-l-emerald-500",
    cta:
      "border-emerald-700 bg-emerald-600 hover:bg-emerald-700 dark:border-emerald-600 dark:bg-emerald-700 dark:hover:bg-emerald-600",
  },
  mining: {
    icon:
      "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-200",
    badge:
      "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
    activeCard:
      "border-amber-500 bg-amber-50 text-amber-950 shadow-sm dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
    detail: "border-l-4 border-l-amber-500 dark:border-l-amber-500",
    cta:
      "border-amber-700 bg-amber-600 hover:bg-amber-700 dark:border-amber-600 dark:bg-amber-700 dark:hover:bg-amber-600",
  },
};

const KIND_GUIDE: Record<WorldActivityKind, string> = {
  fishing: "물때와 어종을 살피고 원하는 낚시터를 골라보세요.",
  woodcutting: "수종과 작업 시간을 비교해 벌목지를 선택하세요.",
  mining: "광맥 등급과 성공률을 확인하고 채광지로 이동하세요.",
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

const DIFFICULTY_TONE: Record<string, string> = {
  easy: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  normal:
    "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900 dark:bg-sky-950 dark:text-sky-200",
  hard: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200",
  expert:
    "border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-200",
};

type RegionFilter = WorldActivityKind;

const REGION_FILTERS: readonly { id: RegionFilter; label: string }[] = [
  { id: "fishing", label: "낚시터" },
  { id: "woodcutting", label: "벌목지" },
  { id: "mining", label: "채광지" },
];

function regionMatchesFilter(
  region: WorldActivityRegion,
  filter: RegionFilter,
): boolean {
  return region.kind === filter;
}

function activityDescription(region: WorldActivityRegion): string {
  if (isFishingSpotId(region.id)) {
    const spot = FISHING_SPOTS[region.id];
    return `주요 어종: ${fishNames(spot.featuredFishIds).join(", ")}`;
  }
  if (isWoodcuttingSpotId(region.id)) {
    const spot = WOODCUTTING_SPOTS[region.id];
    return `벌목 수종: ${woodcuttingTreeForSpot(spot).name}`;
  }
  if (isMiningSpotId(region.id)) {
    const spot = MINING_SPOTS[region.id];
    return `채광 광맥: ${miningNodeForSpot(spot).name}`;
  }
  return region.summary;
}

function regionSecondaryLabel(region: WorldActivityRegion): string {
  if (isFishingSpotId(region.id)) {
    return `낚시터 · ${
      FISHING_SPOT_DIFFICULTY_LABEL[FISHING_SPOTS[region.id].difficulty]
    }`;
  }
  if (isWoodcuttingSpotId(region.id)) {
    return `벌목지 · ${
      woodcuttingTreeForSpot(WOODCUTTING_SPOTS[region.id]).name
    }`;
  }
  if (isMiningSpotId(region.id)) {
    return `채광지 · ${miningNodeForSpot(MINING_SPOTS[region.id]).name}`;
  }
  return WORLD_ACTIVITY_KIND_LABEL[region.kind];
}

function FishingSpotMeta({ id }: { id: string }) {
  if (!isFishingSpotId(id)) return null;
  const spot = FISHING_SPOTS[id];
  const counts = tierCountsForSpot(spot);
  const specialFish = spot.fishIds.filter((fishId) => FISH[fishId].condition);
  return (
    <div className={`${SURFACE_INSET} space-y-2 p-2`}>
      <div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            어종 풀
          </div>
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold ${
              DIFFICULTY_TONE[spot.difficulty]
            }`}
          >
            난이도 {FISHING_SPOT_DIFFICULTY_LABEL[spot.difficulty]}
          </span>
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {Object.entries(counts).map(([tier, count]) => (
            <span
              key={tier}
              className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
            >
              {TIER_LABEL[tier] ?? tier} {count}
            </span>
          ))}
        </div>
      </div>
      {specialFish.length > 0 && (
        <div>
          <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            물때 손님
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {specialFish.map((fishId) => (
              <span
                key={fishId}
                className="rounded bg-sky-100 px-2 py-1 text-xs font-medium text-sky-800 dark:bg-sky-900 dark:text-sky-200"
              >
                {FISH[fishId].name}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WoodcuttingSpotMeta({ id }: { id: string }) {
  if (!isWoodcuttingSpotId(id)) return null;
  const spot = WOODCUTTING_SPOTS[id];
  const tree = woodcuttingTreeForSpot(spot);
  return (
    <div className={`${SURFACE_INSET} space-y-1.5 p-2`}>
      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
        벌목 수종
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200">
          {tree.name}
        </span>
      </div>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {tree.grade}등급 · Lv.1 성공률 {((1 - woodcuttingFailureRate(tree.baseFailureRate, 1)) * 100).toFixed(1)}%
        {" · "}기본 {(tree.durationMs / 1_000).toFixed(1)}초 · XP +{tree.xp}
      </div>
    </div>
  );
}

function MiningSpotMeta({ id }: { id: string }) {
  if (!isMiningSpotId(id)) return null;
  const spot = MINING_SPOTS[id];
  const node = miningNodeForSpot(spot);
  return (
    <div className={`${SURFACE_INSET} space-y-1.5 p-2`}>
      <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
        채광 광맥
      </div>
      <div className="flex flex-wrap gap-1">
        <span className="rounded bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
          {node.name}
        </span>
      </div>
      <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
        {node.grade}등급 · Lv.1 성공률{" "}
        {((1 - miningFailureRate(node.baseFailureRate, 1)) * 100).toFixed(1)}%
        {" · "}기본 {(node.durationMs / 1_000).toFixed(1)}초 · XP +{node.xp}
      </div>
    </div>
  );
}

export function WorldRumorMapView({ onBack }: { onBack?: () => void }) {
  const [regionFilter, setRegionFilter] = useState<RegionFilter>("fishing");
  const [selectedId, setSelectedId] =
    useState<WorldActivityRegion["id"]>("village_pier");
  const filteredRegions = WORLD_ACTIVITY_REGIONS.filter((region) =>
    regionMatchesFilter(region, regionFilter),
  );
  const selected =
    filteredRegions.find((region) => region.id === selectedId) ??
    filteredRegions[0] ??
    null;
  const selectedStyle = selected ? KIND_STYLE[selected.kind] : null;

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="생활 지도" onBack={onBack} />

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="border-b border-zinc-200 p-4 dark:border-zinc-800">
          <div className="flex items-start gap-3">
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              <Compass size={25} weight="duotone" aria-hidden />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
                  모험가 생활 안내판
                </h2>
                <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-bold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                  탐사 지역 {WORLD_ACTIVITY_REGIONS.length}곳
                </span>
              </div>
              <p className="mt-1 text-sm leading-5 text-zinc-600 dark:text-zinc-300">
                활동을 고른 뒤 지역별 자원과 난이도를 비교해 목적지를 정해보세요.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 p-3 sm:grid-cols-3">
          {REGION_FILTERS.map((filter) => {
            const active = regionFilter === filter.id;
            const style = KIND_STYLE[filter.id];
            const count = WORLD_ACTIVITY_REGIONS.filter((region) =>
              regionMatchesFilter(region, filter.id),
            ).length;
            return (
              <button
                key={filter.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setRegionFilter(filter.id);
                  const first = WORLD_ACTIVITY_REGIONS.find((region) =>
                    regionMatchesFilter(region, filter.id),
                  );
                  if (first) setSelectedId(first.id);
                }}
                className={`group min-w-0 rounded-lg border p-3 text-left transition ${
                  active
                    ? style.activeCard
                    : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                }`}
              >
                <span className="flex items-start justify-between gap-2">
                  <span
                    className={`flex size-12 shrink-0 items-center justify-center rounded-lg ${style.icon}`}
                  >
                    <LifeActivityIcon kind={filter.id} className="size-11" />
                  </span>
                  <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold tabular-nums text-zinc-500 shadow-sm dark:bg-zinc-800 dark:text-zinc-300">
                    {count}곳
                  </span>
                </span>
                <span className="mt-2 block text-sm font-bold">
                  {filter.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-zinc-500 dark:text-zinc-400">
                  {KIND_GUIDE[filter.id]}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="grid gap-0 md:grid-cols-[0.92fr_1.08fr]">
          <div className="border-b border-zinc-200 p-3 md:border-b-0 md:border-r dark:border-zinc-800">
            <div className="mb-3 flex items-end justify-between gap-3 px-1">
              <div>
                <div className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                  선택 가능한 지역
                </div>
                <div className="mt-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                  {WORLD_ACTIVITY_KIND_LABEL[regionFilter]} {filteredRegions.length}곳
                </div>
              </div>
              <div className="text-[10px] font-semibold text-zinc-400 dark:text-zinc-500">
                지역을 눌러 상세 확인
              </div>
            </div>

            <div className="space-y-2">
              {filteredRegions.length === 0 ? (
                <div
                  className={`${SURFACE_INSET} px-3 py-8 text-center text-xs font-medium text-zinc-400 dark:text-zinc-500`}
                >
                  표시할 지역 없음
                </div>
              ) : null}

              {filteredRegions.map((region, index) => {
                const style = KIND_STYLE[region.kind];
                const active = region.id === selected?.id;
                return (
                  <button
                    key={region.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelectedId(region.id)}
                    className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition ${
                      active
                        ? style.activeCard
                        : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:border-zinc-600 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <span
                      className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${style.icon}`}
                    >
                      <LifeActivityIcon kind={region.kind} className="size-10" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-sm font-bold">
                          {region.name}
                        </span>
                        <span className="shrink-0 text-[10px] font-bold tabular-nums text-zinc-400 dark:text-zinc-500">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-zinc-500 dark:text-zinc-400">
                        {regionSecondaryLabel(region)}
                      </span>
                    </span>
                    <ArrowRight
                      size={16}
                      weight="bold"
                      className="shrink-0 text-zinc-400 dark:text-zinc-500"
                      aria-hidden
                    />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-3 p-4">
            {selected && selectedStyle ? (
              <>
                <div className={`${SURFACE_INSET} ${selectedStyle.detail} p-4`}>
                  <div className="flex items-start gap-3">
                    <span
                      className={`flex size-16 shrink-0 items-center justify-center rounded-xl ${selectedStyle.icon}`}
                    >
                      <LifeActivityIcon
                        kind={selected.kind}
                        className="size-14"
                      />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-2 py-1 text-[11px] font-bold ${selectedStyle.badge}`}
                        >
                          {WORLD_ACTIVITY_KIND_LABEL[selected.kind]}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-zinc-500 dark:bg-zinc-800 dark:text-zinc-300">
                          <Sparkle size={11} weight="fill" aria-hidden />
                          생활 활동
                        </span>
                      </div>
                      <h3 className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                        {selected.name}
                      </h3>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {selected.headline}
                  </p>
                </div>

                <div className={`${SURFACE_INSET} p-3`}>
                  <div className="flex items-start gap-2">
                    <MapPin
                      size={17}
                      weight="fill"
                      className="mt-0.5 shrink-0 text-zinc-500 dark:text-zinc-400"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold text-zinc-500 dark:text-zinc-400">
                        지역 자원
                      </div>
                      <p className="mt-0.5 text-sm leading-5 text-zinc-700 dark:text-zinc-200">
                        {activityDescription(selected)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-700">
                    {selected.tags.map((tag) => (
                      <span
                        key={tag}
                        className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>

                <FishingSpotMeta id={selected.id} />
                <WoodcuttingSpotMeta id={selected.id} />
                <MiningSpotMeta id={selected.id} />

                <Link
                  href={selected.action.href}
                  className={`inline-flex w-full items-center justify-center gap-2 rounded-lg border px-3 py-2.5 text-sm font-bold text-white shadow-sm transition ${selectedStyle.cta}`}
                >
                  <LifeActivityIcon kind={selected.kind} className="size-6" />
                  {selected.action.label}
                  <ArrowRight size={16} weight="bold" aria-hidden />
                </Link>
              </>
            ) : (
              <div className={`${SURFACE_INSET} px-4 py-10 text-center`}>
                <div className="text-sm font-semibold text-zinc-600 dark:text-zinc-300">
                  표시할 지역 없음
                </div>
              </div>
            )}
          </div>
        </div>
      </section>
    </PageShell>
  );
}
