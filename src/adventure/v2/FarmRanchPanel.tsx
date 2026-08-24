"use client";

import { Clock, CookingPot, LockKey, PawPrint } from "@phosphor-icons/react";
import Image from "next/image";
import { useState } from "react";
import { confirmGameAction, type ConfirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";
import { FarmItemIcon } from "./FarmItemIcon";
import {
  FARM_CROP_REQUIRED_SKILL_ID,
  farmAvailableReputation,
  farmingLevelForState,
  type FarmState,
} from "./farm";
import {
  RANCH_ANIMAL_DEFINITIONS,
  RANCH_REBUILD_COSTS,
  RANCH_SLOT_DEFINITIONS,
  type RanchAnimalId,
  type RanchSlotId,
} from "./ranch";

const RANCH_ANIMAL_IDS = ["chicken", "cow", "pig"] as const;

function slotNumber(slotId: RanchSlotId): number {
  return Number(slotId.slice("slot-".length));
}

function rebuildTargetText(animalId: RanchAnimalId): string {
  const buildingName = RANCH_ANIMAL_DEFINITIONS[animalId].buildingName;
  return `${buildingName}${animalId === "pig" ? "로" : "으로"}`;
}

export async function confirmRanchSlotConstruction({
  slotId,
  animalId,
  costReputation,
  onUpgrade,
  confirm = confirmGameAction,
}: {
  slotId: RanchSlotId;
  animalId: RanchAnimalId;
  costReputation: number;
  onUpgrade: (slotId: RanchSlotId, animalId: RanchAnimalId) => void;
  confirm?: ConfirmGameAction;
}): Promise<boolean> {
  const animal = RANCH_ANIMAL_DEFINITIONS[animalId];
  if (
    !(await confirm(
      `부지 ${slotNumber(slotId)}에 ${animal.buildingName}을(를) 건설할까요?\n농장 증표 ${costReputation.toLocaleString("ko-KR")}개가 사용됩니다.`,
    ))
  ) {
    return false;
  }
  onUpgrade(slotId, animalId);
  return true;
}

export async function confirmRanchRebuild({
  slotId,
  animalId,
  onRebuild,
  confirm = confirmGameAction,
}: {
  slotId: RanchSlotId;
  animalId: RanchAnimalId;
  onRebuild: (slotId: RanchSlotId, animalId: RanchAnimalId) => void;
  confirm?: ConfirmGameAction;
}): Promise<boolean> {
  const cost = RANCH_REBUILD_COSTS[animalId];
  if (
    !(await confirm(
      `부지 ${slotNumber(slotId)}을(를) ${rebuildTargetText(animalId)} 재건축할까요?\n농장 증표 ${cost.toLocaleString("ko-KR")}개가 사용됩니다.`,
    ))
  ) {
    return false;
  }
  onRebuild(slotId, animalId);
  return true;
}

export function FarmRanchPanel({
  farm,
  now,
  learnedSkillIds,
  busyFeedSlotId,
  busyCollect,
  busyUpgradeSlotId,
  busyRebuildSlotId,
  onFeed,
  onCollect,
  onUpgrade,
  onRebuild,
  onOpenLifeWorkshop,
}: {
  farm: FarmState;
  now: number;
  learnedSkillIds: string[];
  busyFeedSlotId: RanchSlotId | null;
  busyCollect: boolean;
  busyUpgradeSlotId: RanchSlotId | null;
  busyRebuildSlotId: RanchSlotId | null;
  onFeed: (slotId: RanchSlotId, amount: number) => void;
  onCollect: () => void;
  onUpgrade: (slotId: RanchSlotId, animalId: RanchAnimalId) => void;
  onRebuild: (slotId: RanchSlotId, animalId: RanchAnimalId) => void;
  onOpenLifeWorkshop: () => void;
}) {
  const [feedAmounts, setFeedAmounts] = useState<
    Partial<Record<RanchSlotId, number>>
  >({});
  const ranchUnlocked = learnedSkillIds.includes(FARM_CROP_REQUIRED_SKILL_ID);
  const totalReady = RANCH_SLOT_DEFINITIONS.reduce(
    (sum, definition) => sum + farm.ranch.slots[definition.id].readyItems,
    0,
  );
  const unlockedCount = RANCH_SLOT_DEFINITIONS.filter(
    (definition) => farm.ranch.slots[definition.id].unlocked,
  ).length;
  const nextSlot = RANCH_SLOT_DEFINITIONS.find(
    (definition) => !farm.ranch.slots[definition.id].unlocked,
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
            보유 부지 {unlockedCount} / {RANCH_SLOT_DEFINITIONS.length}
            {nextSlot
              ? ` · 다음 부지 · 농사 Lv.${nextSlot.requiredLevel} · 농장 증표 ${nextSlot.costReputation.toLocaleString("ko-KR")}개`
              : " · 모든 부지를 열었습니다"}
          </p>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
            돼지우리를 건설하면 첫 돼지가 포함됩니다. 비어 있는 축사는 다른 종류로 재건축할 수 있습니다.
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center justify-between gap-2 sm:w-auto sm:flex-nowrap sm:justify-start">
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
            {busyCollect ? "수확·출하 중..." : "모두 수확·출하"}
          </button>
        </div>
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
          {RANCH_SLOT_DEFINITIONS.map((slotDefinition, index) => {
            const slot = farm.ranch.slots[slotDefinition.id];
            const previous = RANCH_SLOT_DEFINITIONS[index - 1];
            const previousUnlocked = previous
              ? farm.ranch.slots[previous.id].unlocked
              : true;

            if (!slot.unlocked || !slot.animalId) {
              return (
                <article key={slotDefinition.id} className={`${SURFACE_INSET} p-4`}>
                  <div className="flex items-center gap-3">
                    <div className="grid size-14 shrink-0 place-items-center rounded-md border border-zinc-300 bg-white text-zinc-500 dark:border-zinc-700 dark:bg-zinc-950">
                      <LockKey size={25} weight="duotone" aria-hidden />
                    </div>
                    <div>
                      <h3 className="font-bold text-zinc-900 dark:text-zinc-100">
                        부지 {index + 1}
                      </h3>
                      <p className="text-sm text-zinc-600 dark:text-zinc-300">
                        농사 Lv.{slotDefinition.requiredLevel} · 농장 증표 {slotDefinition.costReputation.toLocaleString("ko-KR")}개
                      </p>
                    </div>
                  </div>

                  {previousUnlocked ? (
                    <div className="mt-3 grid gap-2">
                      {RANCH_ANIMAL_IDS.map((animalId) => {
                        const animal = RANCH_ANIMAL_DEFINITIONS[animalId];
                        const slotLevelMet = farmingLevel >= slotDefinition.requiredLevel;
                        const animalLevelMet = farmingLevel >= animal.requiredLevel;
                        const canAfford = availableReputation >= slotDefinition.costReputation;
                        const disabled =
                          !slotLevelMet ||
                          !animalLevelMet ||
                          !canAfford ||
                          busyUpgradeSlotId !== null;
                        const levelReasons = [
                          ...(!slotLevelMet
                            ? [`부지 농사 Lv.${slotDefinition.requiredLevel} 필요`]
                            : []),
                          ...(!animalLevelMet && animal.requiredLevel > slotDefinition.requiredLevel
                            ? [`${animal.buildingName} 농사 Lv.${animal.requiredLevel} 필요`]
                            : []),
                        ];
                        const reason =
                          levelReasons.length > 0
                            ? levelReasons.join(" · ")
                            : !canAfford
                              ? "농장 증표 부족"
                              : `${animal.outputName} ${animal.outputAmount}개 / ${formatDuration(animal.cycleMs)}`;
                        return (
                          <button
                            key={animalId}
                            type="button"
                            disabled={disabled}
                            onClick={() =>
                              void confirmRanchSlotConstruction({
                                slotId: slotDefinition.id,
                                animalId,
                                costReputation: slotDefinition.costReputation,
                                onUpgrade,
                              })
                            }
                            className={`${SURFACE_CARD} flex items-center justify-between gap-3 px-3 py-2 text-left text-sm disabled:cursor-not-allowed disabled:opacity-50`}
                          >
                            <span className="font-bold text-zinc-900 dark:text-zinc-100">
                              {animal.buildingName} 건설
                            </span>
                            <span className="text-xs text-zinc-600 dark:text-zinc-300">
                              {busyUpgradeSlotId === slotDefinition.id ? "건설 중..." : reason}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className={`${SURFACE_CARD} mt-3 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300`}>
                      앞 부지를 먼저 열어야 합니다
                    </p>
                  )}
                </article>
              );
            }

            const animal = RANCH_ANIMAL_DEFINITIONS[slot.animalId];
            const capacityRemaining = Math.max(0, animal.feedCapacity - slot.feed);
            const maximumFeed = Math.min(capacityRemaining, feedOwned);
            const selectedAmount = Math.min(
              maximumFeed,
              Math.max(1, feedAmounts[slotDefinition.id] ?? 1),
            );
            const liveProgressMs =
              slot.feed > 0
                ? Math.min(
                    animal.cycleMs,
                    slot.progressMs + Math.max(0, now - slot.lastSettledAt),
                  )
                : 0;
            const nextReadyMs = Math.max(0, animal.cycleMs - liveProgressMs);
            const shipmentReady = animal.mode === "shipment" && slot.readyItems > 0;
            const shipmentInProgress = animal.mode === "shipment" && slot.feed > 0;
            const canRebuild =
              slot.feed === 0 &&
              slot.progressMs === 0 &&
              slot.readyItems === 0 &&
              slot.readyCycles === 0;

            return (
              <article key={slotDefinition.id} className={`${SURFACE_INSET} space-y-3 p-4`}>
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
                      부지 {index + 1}
                    </h3>
                    <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
                      부지 {index + 1} · {animal.buildingName}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      {animal.outputName} {animal.outputAmount}개 / {formatDuration(animal.cycleMs)}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <FarmItemIcon itemId={animal.outputItemId} className="size-9" />
                      <span className="text-sm font-bold text-zinc-800 dark:text-zinc-100">
                        {animal.outputName} {slot.readyItems.toLocaleString("ko-KR")}개
                      </span>
                    </div>
                  </div>
                </div>

                {animal.mode === "shipment" ? (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={`${SURFACE_CARD} px-3 py-2`}>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">우리 상태</span>
                        <strong>{shipmentReady ? "출하 대기" : shipmentInProgress ? "비육 중" : "비어 있음"}</strong>
                      </div>
                      <div className={`${SURFACE_CARD} px-3 py-2`}>
                        <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <Clock size={13} aria-hidden /> 출하까지
                        </span>
                        <strong>{shipmentReady ? "출하 대기" : shipmentInProgress ? formatDuration(nextReadyMs) : `새 돼지 · 사료 ${animal.feedPerCycle}개`}</strong>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={shipmentReady || shipmentInProgress || feedOwned < animal.feedPerCycle || busyFeedSlotId !== null}
                      onClick={() => onFeed(slotDefinition.id, animal.feedPerCycle)}
                      className="w-full rounded-md bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busyFeedSlotId === slotDefinition.id ? "새 돼지 데려오는 중..." : shipmentReady ? "먼저 출하해 주세요" : shipmentInProgress ? "비육 중" : `사료 ${animal.feedPerCycle}개로 새 돼지 데려오기`}
                    </button>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className={`${SURFACE_CARD} px-3 py-2`}>
                        <span className="block text-xs text-zinc-500 dark:text-zinc-400">사료</span>
                        <strong>사료 {slot.feed} / {animal.feedCapacity}</strong>
                      </div>
                      <div className={`${SURFACE_CARD} px-3 py-2`}>
                        <span className="flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                          <Clock size={13} aria-hidden /> 다음 생산
                        </span>
                        <strong>{slot.feed > 0 ? formatDuration(nextReadyMs) : "사료 부족"}</strong>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <select
                        aria-label={`부지 ${index + 1} ${animal.name} 사료 수량`}
                        value={maximumFeed > 0 ? selectedAmount : 0}
                        disabled={maximumFeed < 1 || busyFeedSlotId !== null}
                        onChange={(event) =>
                          setFeedAmounts((current) => ({
                            ...current,
                            [slotDefinition.id]: Number(event.target.value),
                          }))
                        }
                        className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                      >
                        {maximumFeed < 1 ? <option value={0}>0개</option> : null}
                        {Array.from({ length: maximumFeed }, (_, amount) => amount + 1).map((amount) => (
                          <option key={amount} value={amount}>{amount}개</option>
                        ))}
                      </select>
                      <button
                        type="button"
                        disabled={maximumFeed < 1 || busyFeedSlotId !== null}
                        onClick={() => onFeed(slotDefinition.id, selectedAmount)}
                        className="rounded-md bg-amber-600 px-3 py-2 text-sm font-bold text-white hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {busyFeedSlotId === slotDefinition.id ? "넣는 중..." : "사료 넣기"}
                      </button>
                    </div>
                  </>
                )}

                {canRebuild ? (
                  <div className={`${SURFACE_CARD} space-y-2 p-3`} aria-label={`부지 ${index + 1} 재건축`}>
                    <p className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                      비어 있는 축사 재건축
                    </p>
                    <div className="grid gap-2">
                      {RANCH_ANIMAL_IDS.filter((animalId) => animalId !== slot.animalId).map((animalId) => {
                        const target = RANCH_ANIMAL_DEFINITIONS[animalId];
                        const cost = RANCH_REBUILD_COSTS[animalId];
                        const levelMet = farmingLevel >= target.requiredLevel;
                        const canAfford = availableReputation >= cost;
                        return (
                          <button
                            key={animalId}
                            type="button"
                            disabled={!levelMet || !canAfford || busyRebuildSlotId !== null}
                            onClick={() => void confirmRanchRebuild({ slotId: slotDefinition.id, animalId, onRebuild })}
                            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-left text-xs font-bold text-zinc-800 hover:border-amber-400 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
                          >
                            {rebuildTargetText(animalId)} 재건축 · {cost.toLocaleString("ko-KR")}개
                            {!levelMet ? ` · 농사 Lv.${target.requiredLevel} 필요` : !canAfford ? " · 농장 증표 부족" : ""}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
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
