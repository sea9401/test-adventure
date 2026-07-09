"use client";

import Link from "next/link";
import { useState } from "react";
import {
  Compass,
  Fish,
  House,
  MapPin,
  Waves,
  type Icon,
} from "@phosphor-icons/react";
import { FISH } from "@/adventure/data/v2/fish";
import {
  FISHING_SPOTS,
  fishNames,
  isFishingSpotId,
  tierCountsForSpot,
} from "@/adventure/data/v2/fishingSpots";
import {
  WORLD_ACTIVITY_KIND_LABEL,
  WORLD_ACTIVITY_REGIONS,
  type WorldActivityKind,
  type WorldActivityRegion,
} from "@/adventure/data/v2/worldRumors";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const KIND_ICON: Record<WorldActivityKind, Icon> = {
  settlement: House,
  fishing: Fish,
};

const KIND_TONE: Record<WorldActivityKind, string> = {
  settlement:
    "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
  fishing:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

const TIER_LABEL: Record<string, string> = {
  common: "흔함",
  uncommon: "보통",
  rare: "희귀",
  epic: "영웅",
  legendary: "전설",
};

function activityDescription(region: WorldActivityRegion): string {
  if (!isFishingSpotId(region.id)) return region.summary;
  const spot = FISHING_SPOTS[region.id];
  return `주요 어종: ${fishNames(spot.featuredFishIds).join(", ")}`;
}

function FishingSpotMeta({ id }: { id: string }) {
  if (!isFishingSpotId(id)) return null;
  const spot = FISHING_SPOTS[id];
  const counts = tierCountsForSpot(spot);
  const specialFish = spot.fishIds.filter((fishId) => FISH[fishId].condition);
  return (
    <div className={`${SURFACE_INSET} space-y-2 p-2`}>
      <div>
        <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          어종 풀
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

export function WorldRumorMapView({ onBack }: { onBack?: () => void }) {
  const [selectedId, setSelectedId] =
    useState<WorldActivityRegion["id"]>("village_pier");
  const selected =
    WORLD_ACTIVITY_REGIONS.find((region) => region.id === selectedId) ??
    WORLD_ACTIVITY_REGIONS[0];
  const SelectedKindIcon = KIND_ICON[selected.kind];

  return (
    <PageShell spacing="normal">
      <SubViewHeader title="생활 지도" onBack={onBack} />

      <section className={`${SURFACE_CARD} overflow-hidden`}>
        <div className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <Compass
              size={20}
              weight="duotone"
              className="shrink-0 text-emerald-600 dark:text-emerald-300"
            />
            <h2 className="min-w-0 text-base font-semibold text-zinc-900 dark:text-zinc-100">
              지역 현황
            </h2>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-2 border-b border-zinc-200 bg-zinc-50 p-3 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-950">
            {WORLD_ACTIVITY_REGIONS.map((region) => {
              const RegionIcon = KIND_ICON[region.kind];
              const active = region.id === selected.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedId(region.id)}
                  className={`flex w-full items-center gap-3 rounded-md border px-3 py-2 text-left transition ${
                    active
                      ? "border-emerald-500 bg-emerald-50 text-emerald-900 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-100"
                      : "border-zinc-200 bg-white text-zinc-800 hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  }`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                    <RegionIcon size={20} weight="duotone" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">
                      {region.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {WORLD_ACTIVITY_KIND_LABEL[region.kind]}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 p-4">
            <div>
              <div
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                  KIND_TONE[selected.kind]
                }`}
              >
                <SelectedKindIcon size={14} weight="duotone" />
                {WORLD_ACTIVITY_KIND_LABEL[selected.kind]}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <MapPin
                  size={18}
                  weight="fill"
                  className="shrink-0 text-zinc-500 dark:text-zinc-400"
                />
                <h3 className="min-w-0 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                  {selected.name}
                </h3>
              </div>
              <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {selected.headline}
              </p>
              <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                {activityDescription(selected)}
              </p>
            </div>

            <div className={`${SURFACE_INSET} flex flex-wrap gap-1.5 p-2`}>
              {selected.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded bg-white px-2 py-1 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
                >
                  {tag}
                </span>
              ))}
            </div>

            <FishingSpotMeta id={selected.id} />

            <Link
              href={selected.action.href}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              <Waves size={16} weight="duotone" />
              {selected.action.label}
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
