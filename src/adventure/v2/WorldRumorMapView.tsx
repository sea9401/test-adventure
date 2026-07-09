"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  Compass,
  Fish,
  Hammer,
  MapPin,
  PottedPlant,
  Storefront,
  UserCircle,
  type Icon,
} from "@phosphor-icons/react";
import {
  WORLD_RUMOR_KIND_LABEL,
  WORLD_RUMOR_REGIONS,
  type WorldRumorKind,
  type WorldRumorRegion,
} from "@/adventure/data/v2/worldRumors";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

const KIND_ICON: Record<WorldRumorKind, Icon> = {
  rumor: Compass,
  resource: PottedPlant,
  npc: UserCircle,
};

const REGION_ICON: Record<WorldRumorRegion["id"], Icon> = {
  village: Storefront,
  forest: PottedPlant,
  harbor: Fish,
  quarry: Hammer,
};

const KIND_TONE: Record<WorldRumorKind, string> = {
  rumor:
    "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200",
  resource:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  npc: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200",
};

const NODE_TONE: Record<WorldRumorRegion["id"], string> = {
  village: "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200",
  forest:
    "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200",
  harbor: "border-sky-300 bg-sky-100 text-sky-800 dark:border-sky-700 dark:bg-sky-950 dark:text-sky-200",
  quarry:
    "border-zinc-300 bg-zinc-100 text-zinc-800 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200",
};

export function WorldRumorMapView({ onBack }: { onBack?: () => void }) {
  const [selectedId, setSelectedId] =
    useState<WorldRumorRegion["id"]>("harbor");
  const selected =
    WORLD_RUMOR_REGIONS.find((region) => region.id === selectedId) ??
    WORLD_RUMOR_REGIONS[0];
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
              오늘의 지역 소식
            </h2>
          </div>
        </div>

        <div className="grid gap-0 md:grid-cols-[1.15fr_0.85fr]">
          <div className="relative min-h-[20rem] overflow-hidden border-b border-zinc-200 bg-zinc-100 md:border-b-0 md:border-r dark:border-zinc-800 dark:bg-zinc-950">
            <Image
              src="/images/ui/v2-continent.webp"
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 460px"
              className="object-cover opacity-80 dark:opacity-55"
              priority={false}
            />
            <div className="absolute inset-0 bg-zinc-950/20" />

            <div className="absolute left-[30%] top-[28%] h-[44%] w-[42%] rounded-[50%] border border-dashed border-white/45" />

            {WORLD_RUMOR_REGIONS.map((region) => {
              const RegionIcon = REGION_ICON[region.id];
              const active = region.id === selected.id;
              return (
                <button
                  key={region.id}
                  type="button"
                  onClick={() => setSelectedId(region.id)}
                  className={`absolute flex min-h-11 min-w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border shadow-sm transition ${
                    NODE_TONE[region.id]
                  } ${
                    active
                      ? "scale-110 ring-2 ring-emerald-400"
                      : "hover:scale-105"
                  }`}
                  style={{
                    left: `${region.position.x}%`,
                    top: `${region.position.y}%`,
                  }}
                  aria-label={region.name}
                >
                  <RegionIcon size={22} weight="duotone" />
                  <span className="pointer-events-none absolute left-1/2 top-full mt-1 -translate-x-1/2 whitespace-nowrap rounded bg-zinc-950 px-1.5 py-0.5 text-[11px] font-medium text-white shadow">
                    {region.shortName}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 p-4">
            <div className="relative h-28 overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
              <Image
                src={selected.image}
                alt=""
                fill
                sizes="(max-width: 768px) 100vw, 280px"
                className="object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-zinc-950/65 px-3 py-2">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-white">
                  <MapPin size={15} weight="fill" />
                  {selected.name}
                </div>
              </div>
            </div>

            <div>
              <div
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${
                  KIND_TONE[selected.kind]
                }`}
              >
                <SelectedKindIcon size={14} weight="duotone" />
                {WORLD_RUMOR_KIND_LABEL[selected.kind]}
              </div>
              <h3 className="mt-2 text-lg font-bold text-zinc-900 dark:text-zinc-100">
                {selected.headline}
              </h3>
              <p className="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                {selected.summary}
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

            <Link
              href={selected.action.href}
              className="inline-flex w-full items-center justify-center rounded-md border border-emerald-600 bg-emerald-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
            >
              {selected.action.label}
            </Link>
          </div>
        </div>
      </section>
    </PageShell>
  );
}
