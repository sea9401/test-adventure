"use client";

import Image from "next/image";
import { useState } from "react";
import { Clock, CookingPot, LockKey, PawPrint } from "@phosphor-icons/react";
import { FarmItemIcon } from "./FarmItemIcon";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  farmAvailableReputation,
  farmingLevelForState,
  type FarmState,
} from "./farm";
import {
  RANCH_ANIMALS,
  RANCH_PEN_DEFINITIONS,
  type RanchPenDefinition,
  type RanchPenId,
} from "./ranch";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

export function confirmRanchPenUpgrade({
  definition,
  onUpgrade,
  confirm = (message) => window.confirm(message),
}: {
  definition: RanchPenDefinition;
  onUpgrade: (penId: RanchPenId) => void;
  confirm?: (message: string) => boolean;
}): boolean {
  const animal = RANCH_ANIMALS[definition.animalId];
  const penName = definition.animalId === "chicken" ? "닭장" : "외양간";
  if (
    !confirm(
      `${animal.name} 축사 ${penName}을(를) 열까요?\n농장 증표 ${definition.costReputation.toLocaleString()}개가 사용됩니다.`,
    )
  ) {
    return false;
  }
  onUpgrade(definition.id);
  return true;
}

export function FarmRanchPanel({
  farm,
  now,
  learnedSkillIds,
  busyFeedPenId,
  busyCollect,
  busyUpgradePenId,
  onFeed,
  onCollect,
  onUpgrade,
  onOpenLifeWorkshop,
}: {
  farm: FarmState;
  now: number;
  learnedSkillIds: string[];
  busyFeedPenId: RanchPenId | null;
  busyCollect: boolean;
  busyUpgradePenId: RanchPenId | null;
  onFeed: (penId: RanchPenId, amount: number) => void;
  onCollect: () => void;
  onUpgrade: (penId: RanchPenId) => void;
  onOpenLifeWorkshop: () => void;
}) {
  const [feedAmounts, setFeedAmounts] = useState<Partial<Record<RanchPenId, number>>>({});
  const ranchUnlocked = learnedSkillIds.includes(FARM_CROP_REQUIRED_SKILL_ID);
  const totalReady = RANCH_PEN_DEFINITIONS.reduce(
    (sum, definition) => sum + farm.ranch.pens[definition.id].readyItems,
    0,
  );
  const feedOwned = farm.inventory.compound_feed ?? 0;
  const farmingLevel = farmingLevelForState(farm);
  const availableReputation = farmAvailableReputation(farm);

  return (
    <section className="space-y-4" aria-labelledby="farm-ranch-title">
      <div className={`${SURFACE_INSET} flex flex-wrap items-center gap-3 p-3`}>
        <div className="grid size-10 shrink-0 place-items-center rounded-md border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-300">
          <PawPrint size={24} weight="duotone" aria-hidden />
        </div>
        <div className="min-w-0 flex-1">
          <h2 id="farm-ranch-title" className="font-bold text-zinc-900 dark:text-zinc-100">
            목장
          </h2>
          <p className="text-sm text-zinc-600 dark:text-zinc-300">
            배합 사료를 넣어 달걀과 우유를 생산합니다. 생산 시간은 접속하지 않은 동안에도 흐릅니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FarmItemIcon itemId="compound_feed" className="size-9" />
          <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
            사료 {feedOwned.toLocaleString("ko-KR")}개
          </span>
        </div>
        <button
          type="button"
          onClick={onCollect}
          disabled={!ranchUnlocked || totalReady < 1 || busyCollect}
          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busyCollect ? "수확 중..." : "모두 수확"}
        </button>
      </div>

      {!ranchUnlocked ? (
        <div className={`${SURFACE_CARD} px-4 py-8 text-center`}>
          <LockKey size={28} weight="duotone" className="mx-auto text-zinc-500" aria-hidden />
          <p className="mt-2 font-bold text-zinc-800 dark:text-zinc-100">
            씨앗 선별을 배우면 목장이 열립니다
          </p>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
            농부 계열 생산 기술에서 씨앗 선별을 먼저 배워 주세요.
          </p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {RANCH_PEN_DEFINITIONS.map((definition, index) => {
            const pen = farm.ranch.pens[definition.id];
            const animal = RANCH_ANIMALS[definition.animalId];
            const previous = RANCH_PEN_DEFINITIONS[index - 1];
            const previousUnlocked = previous
              ? farm.ranch.pens[previous.id].unlocked
              : true;

            if (!pen.unlocked) {
              const canUpgrade =
                previousUnlocked &&
                farmingLevel >= definition.requiredLevel &&
                availableReputation >= definition.costReputation;
              return (
                <article key={definition.id} className={`${SURFACE_INSET} p-4`}>
                  <div className="flex items-center gap-3">
                    <div className="grid size-16 shrink-0 place-items-center rounded-md border border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
                      <LockKey size={26} weight="duotone" aria-hidden />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                        {animal.name} 축사 {definition.animalId === "chicken" ? "닭장" : "외양간"}
                      </h3>
                      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
                        농사 Lv.{definition.requiredLevel} · 농장 증표 {definition.costReputation}개
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      confirmRanchPenUpgrade({ definition, onUpgrade })
                    }
                    disabled={!canUpgrade || busyUpgradePenId !== null}
                    className="mt-3 w-full rounded-md border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-amber-800 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-amber-700 dark:bg-zinc-950 dark:text-amber-200 dark:hover:bg-amber-950"
                  >
                    {busyUpgradePenId === definition.id
                      ? "확장 중..."
                      : previousUnlocked
                        ? "축사 열기"
                        : "앞 축사를 먼저 열어야 합니다"}
                  </button>
                </article>
              );
            }

            const capacityRemaining = Math.max(0, definition.feedCapacity - pen.feed);
            const maximumFeed = Math.min(capacityRemaining, feedOwned);
            const selectedAmount = Math.min(
              maximumFeed,
              Math.max(1, feedAmounts[definition.id] ?? 1),
            );
            const liveProgressMs =
              pen.feed > 0
                ? Math.min(
                    definition.cycleMs,
                    pen.progressMs + Math.max(0, now - pen.lastSettledAt),
                  )
                : 0;
            const nextReadyMs = Math.max(0, definition.cycleMs - liveProgressMs);

            return (
              <article key={definition.id} className={`${SURFACE_INSET} space-y-3 p-4`}>
                <div className="flex items-start gap-3">
                  <span className="relative block size-20 shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-950">
                    <Image
                      src={animal.imageSrc}
                      alt={animal.name}
                      fill
                      sizes="80px"
                      unoptimized
                      className="object-cover"
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                      {animal.name} · {definition.animalId === "chicken" ? "닭장" : "외양간"}
                    </h3>
                    <div className="mt-2 flex items-center gap-2">
                      <FarmItemIcon itemId={definition.outputItemId} className="size-9" />
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        {animal.outputName} {pen.readyItems.toLocaleString("ko-KR")}개
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className={`${SURFACE_CARD} px-3 py-2`}>
                    <span className="block text-xs text-zinc-500 dark:text-zinc-400">사료</span>
                    <strong>사료 {pen.feed} / {definition.feedCapacity}</strong>
                  </div>
                  <div className={`${SURFACE_CARD} px-3 py-2`}>
                    <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                      <Clock size={13} aria-hidden /> 다음 생산
                    </span>
                    <strong>{pen.feed > 0 ? formatDuration(nextReadyMs) : "사료 부족"}</strong>
                  </div>
                </div>

                <div className="flex gap-2">
                  <select
                    aria-label={`${animal.name} 사료 수량`}
                    value={maximumFeed > 0 ? selectedAmount : 0}
                    disabled={maximumFeed < 1 || busyFeedPenId !== null}
                    onChange={(event) =>
                      setFeedAmounts((current) => ({
                        ...current,
                        [definition.id]: Number(event.target.value),
                      }))
                    }
                    className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    {maximumFeed < 1 ? <option value={0}>0개</option> : null}
                    {Array.from({ length: maximumFeed }, (_, amount) => amount + 1).map(
                      (amount) => (
                        <option key={amount} value={amount}>{amount}개</option>
                      ),
                    )}
                  </select>
                  <button
                    type="button"
                    disabled={maximumFeed < 1 || busyFeedPenId !== null}
                    onClick={() => onFeed(definition.id, selectedAmount)}
                    className="rounded-md bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busyFeedPenId === definition.id ? "넣는 중..." : "사료 넣기"}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {ranchUnlocked && feedOwned < 1 ? (
        <button
          type="button"
          onClick={onOpenLifeWorkshop}
          className={`${SURFACE_CARD} flex w-full items-center justify-center gap-2 px-4 py-3 text-sm font-bold text-amber-800 hover:border-amber-300 dark:text-amber-200`}
        >
          <CookingPot size={18} weight="duotone" aria-hidden />
          배합 사료가 없습니다 · 생활 제작으로 이동
        </button>
      ) : null}
    </section>
  );
}

function formatDuration(durationMs: number): string {
  const totalMinutes = Math.max(1, Math.ceil(durationMs / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 1) return `${minutes}분`;
  return minutes > 0 ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}
