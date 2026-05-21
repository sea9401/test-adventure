"use client";

import { useRef } from "react";
import { Card } from "@/components/ui/Card";
import { MONSTERS } from "../data/monsters";
import { POTIONS, type PotionId } from "../data/potions";
import { MATERIALS, type MaterialId } from "../data/materials";
import { ITEMS, isLuckyFind, rarityTextClass, type ItemId } from "../data/items";
import {
  dropQualityPrefix,
  dropQualityTextClass,
  type DropQuality,
} from "../data/dropQuality";
import { getRecipeById } from "../data/recipes";
import { SKILL_BOOKS } from "../data/skillBooks";
import { type OfflineSimResult } from "./offlineSim";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";

// "73분" → "1시간 13분", "60분" → "1시간", "<60분" → "N분".
export function fmtHuntDuration(ms: number): string {
  const totalMin = Math.max(1, Math.round(ms / 60_000));
  if (totalMin < 60) return `${totalMin}분`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}시간 ${m}분` : `${h}시간`;
}

// 자동 사냥(6시간 원정) 수령 결과 — 알림(noti)은 작아서 놓치기 쉬워 모달로 가시화.
export function AutoHuntResultModal({
  result,
  onClose,
}: {
  result: OfflineSimResult;
  onClose: () => void;
}) {
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  const durationLabel = fmtHuntDuration(result.simulatedMs);

  const kills = Object.entries(result.killsByName)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);

  const materials = Object.entries(result.materialsGained).filter(
    ([, n]) => (n ?? 0) > 0,
  );

  // 같은 (아이템, 품질 등급) 끼리 묶어 ×N 표기. 키 = `${itemId}@${quality}`.
  const equipCounts = new Map<
    string,
    { itemId: ItemId; quality: DropQuality; count: number }
  >();
  for (const { itemId, quality } of result.equipsGained) {
    const key = `${itemId}@${quality}`;
    const prev = equipCounts.get(key);
    if (prev) prev.count += 1;
    else equipCounts.set(key, { itemId, quality, count: 1 });
  }

  // "유실된 명품"(unique)이 떴으면 결과 상단에 강조 배너 — 긴 획득 목록에 묻히지 않게.
  const luckyFinds = [
    ...new Set(
      Array.from(equipCounts.values())
        .filter(({ itemId }) => isLuckyFind(ITEMS[itemId]))
        .map(({ itemId }) => ITEMS[itemId].name),
    ),
  ];

  const potions = Object.entries(result.potionsConsumed).filter(
    ([, n]) => (n ?? 0) > 0,
  );

  const grantedPotions = Object.entries(result.potionsGranted ?? {}).filter(
    ([, n]) => (n ?? 0) > 0,
  );
  const revives = result.revives ?? 0;

  const hasAnyDrop =
    result.goldGained > 0 ||
    materials.length > 0 ||
    equipCounts.size > 0 ||
    result.recipesLearned.length > 0 ||
    (result.skillBooksGained?.length ?? 0) > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="auto-hunt-result-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
    >
      <div ref={contentRef} className="w-full max-w-sm">
        <Card padding="lg">
        <div className="text-center">
          <div
            id="auto-hunt-result-title"
            className="text-xl font-semibold text-emerald-600 dark:text-emerald-400"
          >
            자동 사냥 보상
          </div>
          <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            {durationLabel} 사냥
          </div>
        </div>

        <div className="mt-4 space-y-3 text-sm">
          {luckyFinds.length > 0 && (
            <div className="rounded-md border border-violet-300 bg-violet-50 p-2.5 text-center font-semibold text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              ✨ 굉장한 발견! — {luckyFinds.join(", ")}
            </div>
          )}

          {kills.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-baseline justify-between">
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  처치
                </span>
                <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                  총 {result.wins}
                </span>
              </div>
              <ul className="space-y-1.5">
                {kills.map(([name, n]) => {
                  const monster = MONSTERS[name];
                  return (
                    <li
                      key={name}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="flex min-w-0 items-center gap-2">
                        {monster?.image ? (
                          <span className="size-7 shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={monster.image}
                              alt={name}
                              className="h-full w-full object-cover"
                            />
                          </span>
                        ) : (
                          <span className="flex size-7 shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-xs text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500">
                            ?
                          </span>
                        )}
                        <span className="truncate text-zinc-700 dark:text-zinc-200">
                          {name}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                        ×{n}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(result.expGained > 0 || result.goldGained > 0) && (
            <div className="space-y-1.5 border-t border-zinc-200 pt-3 dark:border-zinc-800">
              {result.expGained > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">
                    EXP
                    {result.expBonusApplied && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">
                        (신참 ×2)
                      </span>
                    )}
                  </span>
                  <span className="font-medium tabular-nums text-emerald-600 dark:text-emerald-400">
                    +{result.expGained}
                  </span>
                </div>
              )}
              {result.goldGained > 0 && (
                <div className="flex items-center justify-between">
                  <span className="text-zinc-500 dark:text-zinc-400">골드</span>
                  <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                    +{result.goldGained}
                  </span>
                </div>
              )}
            </div>
          )}

          {hasAnyDrop &&
            (materials.length > 0 ||
              equipCounts.size > 0 ||
              result.recipesLearned.length > 0 ||
              (result.skillBooksGained?.length ?? 0) > 0) && (
              <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
                <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  획득 아이템
                </div>
                <ul className="space-y-1">
                  {materials.map(([id, n]) => {
                    const mat = MATERIALS[id as MaterialId];
                    return (
                      <li
                        key={`mat-${id}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-zinc-700 dark:text-zinc-200">
                          {mat?.name ?? id}
                        </span>
                        <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                          ×{n}
                        </span>
                      </li>
                    );
                  })}
                  {Array.from(equipCounts.entries()).map(
                    ([key, { itemId, quality, count }]) => {
                      const item = ITEMS[itemId];
                      const nameClass = rarityTextClass(
                        item,
                        "text-amber-700 dark:text-amber-300",
                      );
                      return (
                        <li
                          key={`eq-${key}`}
                          className="flex items-center justify-between gap-2"
                        >
                          <span className="truncate">
                            {quality ? (
                              <span className={dropQualityTextClass(quality)}>
                                {dropQualityPrefix(quality)}
                              </span>
                            ) : null}
                            <span className={nameClass}>{item?.name ?? itemId}</span>
                          </span>
                          <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                            ×{count}
                          </span>
                        </li>
                      );
                    },
                  )}
                  {result.recipesLearned.map((id) => {
                    const recipe = getRecipeById(id);
                    return (
                      <li
                        key={`rcp-${id}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-sky-700 dark:text-sky-300">
                          제작서 · {recipe?.name ?? id}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          학습
                        </span>
                      </li>
                    );
                  })}
                  {(result.skillBooksGained ?? []).map((id, idx) => {
                    const book = SKILL_BOOKS[id];
                    return (
                      <li
                        key={`sb-${id}-${idx}`}
                        className="flex items-center justify-between gap-2"
                      >
                        <span className="truncate text-violet-700 dark:text-violet-300">
                          ✨ {book?.name ?? id}
                        </span>
                        <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">
                          획득
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

          {potions.length > 0 && (
            <div className="border-t border-zinc-200 pt-3 dark:border-zinc-800">
              <div className="mb-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400">
                소비 포션
              </div>
              <ul className="space-y-1">
                {potions.map(([id, n]) => {
                  const potion = POTIONS[id as PotionId];
                  return (
                    <li
                      key={id}
                      className="flex items-center justify-between gap-2"
                    >
                      <span className="truncate text-zinc-700 dark:text-zinc-200">
                        {potion?.name ?? id}
                      </span>
                      <span className="shrink-0 tabular-nums text-zinc-600 dark:text-zinc-300">
                        ×{n}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {revives > 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-center text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              사냥 중 {revives}회 쓰러져 {revives * 20}분의 휴식을 보냈다.
              {grantedPotions.length > 0 && (
                <>
                  {" "}
                  보급으로{" "}
                  {grantedPotions
                    .map(([id, n]) => {
                      const potion = POTIONS[id as PotionId];
                      return `${potion?.name ?? id} ×${n}`;
                    })
                    .join(", ")}
                  을(를) 받았다.
                </>
              )}
            </div>
          )}

          {result.died && (
            <div className="rounded-md border border-rose-300 bg-rose-50 p-2.5 text-center text-sm text-rose-700 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
              사냥 중 사망 — 시작 마을로 옮겨졌다. 치유소에서 회복이 필요하다.
            </div>
          )}

          {kills.length === 0 &&
            result.expGained === 0 &&
            !hasAnyDrop &&
            !result.died &&
            revives === 0 && (
              <div className="text-center text-zinc-500 dark:text-zinc-400">
                아무 일도 일어나지 않았다.
              </div>
            )}
        </div>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-md border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
        >
          확인
        </button>
      </Card>
      </div>
    </div>
  );
}
