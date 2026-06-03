"use client";

import { useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Package } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  V2_MATERIALS,
  V2_MATERIAL_SELL_PRICE,
  MATERIAL_DROP_SOURCES,
  type V2MaterialId,
  type MaterialDropSource,
} from "@/adventure/data/v2/dungeonDrops";
import { MAIN_DUNGEON } from "@/adventure/data/v2/dungeon";
import type { DungeonFloorId } from "@/adventure/data/v2/types";
import {
  FISH,
  FISH_IDS,
  FISH_TIERS,
  FISH_TIER_ORDER,
  FISH_TOTAL,
  formatFishSize,
  type FishTier,
} from "@/adventure/data/v2/fish";
import {
  ANTIQUES,
  ANTIQUE_IDS,
  ANTIQUE_TIERS,
  ANTIQUE_TIER_ORDER,
  ANTIQUE_TOTAL,
  ANTIQUE_THEME_LABEL,
  formatCondition,
} from "@/adventure/data/v2/antique";

// v2 모험의 서 — 재료 도감 + 어보(어종 도감) + 유물(골동품 도감) 3 탭.
// 정적 카탈로그(전종 공개). 발견 여부만 /me/state 가 권위(코덱스 진척).

// floor id → "들판 (Lv 1~5)" 식 표시명. MAIN_DUNGEON 이 단일 출처.
const FLOOR_LABEL: Record<DungeonFloorId, string> = (() => {
  const out = {} as Record<DungeonFloorId, string>;
  for (const f of MAIN_DUNGEON.floors) {
    const req =
      f.requirement.kind === "power"
        ? ` (권장 파워 ${f.requirement.min})`
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

type CodexTab = "materials" | "fish" | "treasure";

export function V2CodexView({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<CodexTab>("materials");

  // 내 도감 진척 — /me/state 가 권위. 재료: 수집한 id 집합. 어보: 발견 id + 종별 최대어.
  // 유물: 발견 id + 종별 최고 보존상태.
  const [discovered, setDiscovered] = useState<Set<string>>(new Set());
  const [fishDiscovered, setFishDiscovered] = useState<Set<string>>(new Set());
  const [fishBest, setFishBest] = useState<Record<string, number>>({});
  const [antiqueDiscovered, setAntiqueDiscovered] = useState<Set<string>>(new Set());
  const [antiqueBest, setAntiqueBest] = useState<Record<string, number>>({});
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
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

  const subtitle =
    tab === "materials"
      ? {
          text: "재료 — 어느 구역에서 어떤 재료가 떨어지는지 한눈에.",
          count: `등재 ${materialEntries.filter((e) => discovered.has(e.id)).length}/${materialEntries.length}종`,
        }
      : tab === "fish"
        ? {
            text: "어보 — 낚시터에서 잡은 물고기와 개인 최대어 기록.",
            count: `등재 ${FISH_IDS.filter((id) => fishDiscovered.has(id)).length}/${FISH_TOTAL}종`,
          }
        : {
            text: "유물 — 발굴로 찾아낸 골동품과 개인 최고 보존상태.",
            count: `등재 ${ANTIQUE_IDS.filter((id) => antiqueDiscovered.has(id)).length}/${ANTIQUE_TOTAL}종`,
          };

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header className="space-y-2 border-b border-zinc-200 pb-3 dark:border-zinc-800">
        <BackButton onClick={onBack} />
        <div>
          <h1 className="text-lg font-bold">모험의 서</h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle.text}{" "}
            <span className="font-medium text-zinc-600 dark:text-zinc-300">
              {subtitle.count}
            </span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ["materials", "재료"],
              ["fish", "어보"],
              ["treasure", "유물"],
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
      </header>

      {tab === "materials" && (
        materialEntries.length === 0 ? (
          <EmptyState
            icon={<Package size={40} weight="duotone" />}
            title="아직 기록된 재료가 없습니다"
            message="사냥터 구역에 재료가 배치되면 여기에서 출처를 확인할 수 있습니다."
          />
        ) : (
          <Card padding="none" className="overflow-hidden">
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {materialEntries.map(({ id, material, sources, sellPrice }) => {
                const found = discovered.has(id);
                return (
                  <li
                    key={id}
                    className={`px-3 py-2.5 ${found ? "" : "opacity-50"}`}
                  >
                    <div className="flex items-baseline justify-between gap-2">
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
            return (
              <Card key={tier} padding="none" className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    1등 보상 {meta.recordCoins.rank1}코인
                  </span>
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
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                            🐟 {found ? fish.name : "???"}
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
            return (
              <Card key={tier} padding="none" className="overflow-hidden">
                <div className="flex items-baseline justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900/40">
                  <span
                    className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${TIER_BADGE[tier]}`}
                  >
                    {meta.label}
                  </span>
                  <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    분해 {meta.dismantleCoins}코인
                  </span>
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
                        <div className="flex items-baseline justify-between gap-2">
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
    </main>
  );
}
