"use client";

import { useState } from "react";
import {
  CastleTurret,
  Compass,
  Crown,
  Footprints,
  Hammer,
  Skull,
  Sword,
  User,
} from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { CharacterMini } from "@/adventure/character/CharacterMini";
import { ServerFeedView } from "@/adventure/log/ServerFeedView";
import { COOP_BOSSES } from "@/adventure/coop/data";
import { isFiefdomEnabled } from "@/adventure/fiefdom/feature-flag";
import {
  PilgrimMarkDialogue,
  pilgrimMarkStep,
} from "@/adventure/town/dialogues/PilgrimMarkDialogue";
import { useGame } from "@/adventure/GameContext";
import { TutorialOverlay } from "@/adventure/tutorial";

export function AdventureHome() {
  const {
    character,
    currentRegion,
    setSubView,
    setPendingTownNpcId,
    crafting,
    inventory,
    quests,
    storyFlags,
    completeQuest,
  } = useGame();

  // 순례자의 자취(§11.1) — 통과 지역에서 표식이 surfacing 되는지 + 다이얼로그 열림 상태.
  const [pilgrimMarkOpen, setPilgrimMarkOpen] = useState(false);
  const pilgrimMark = pilgrimMarkStep(currentRegion.id, quests, storyFlags);
  const isTower = currentRegion.tags?.includes("tower") ?? false;

  return (
    <>
      <TutorialOverlay
        stepId="tutorial.adventure.intro"
        title="모험을 시작하자"
        body={
          <>
            <p>
              <b>전투</b> 로 현재 지역의 적과 싸우고, <b>지도</b> 에서 다른
              지역으로 이동한다.
            </p>
            <p>
              지역마다 난이도가 다르다. <b>강한 적은 일단 피하고</b> 약한
              곳에서 경험과 장비를 쌓자.
            </p>
            <p>
              HP 가 위태로워지면 <b>마을</b> 로 돌아와 치료소에서 회복. 한 번에
              끝낼 필요는 없다.
            </p>
          </>
        }
      />
      <CharacterMini character={character} />
      {(() => {
        if (currentRegion.id !== "village") return null;
        if (crafting.state.boldQuestComplete) return null;
        const message = !crafting.knows("baseball_bat")
          ? "지나가던 당신을 대장장이가 부릅니다."
          : !crafting.hasCrafted("baseball_bat")
            ? "대장장이가 망치질을 멈추고 당신을 흘끗 본다."
            : "야구 방망이를 만든 당신을 대장장이가 다시 찾는다.";
        return (
          <button
            type="button"
            onClick={() => {
              setPendingTownNpcId("village_blacksmith_bold");
              setSubView("town");
            }}
            className="flex w-full items-center gap-3 rounded-lg border border-amber-300/80 bg-amber-50/70 px-4 py-3 text-left transition-colors hover:bg-amber-100/70 dark:border-amber-900/60 dark:bg-amber-950/30 dark:hover:bg-amber-950/50"
          >
            <Hammer
              size={28}
              weight="duotone"
              className="shrink-0 text-amber-600 dark:text-amber-400"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[11px] uppercase tracking-wider text-amber-700/80 dark:text-amber-400/80">
                알림판
              </div>
              <p className="mt-0.5 text-sm italic text-zinc-700 dark:text-zinc-300">
                {message}
              </p>
            </div>
          </button>
        );
      })()}
      {pilgrimMark &&
        (() => {
          const message =
            pilgrimMark.kind === "reunion"
              ? "천공 성지 한 켠에 누군가 서 있다. 북쪽에서 왔다던 그 순례자다."
              : quests.getEntry(pilgrimMark.step.id).state === "ready"
                ? "표식 옆 일이 정리됐다. 매듭이 다음 자취를 가리키고 있다."
                : quests.getEntry(pilgrimMark.step.id).state === "active"
                  ? "표식 옆 일이 아직 끝나지 않았다. 마저 정리하면 자취가 드러날 것이다."
                  : "길가에 낯선 매듭이 묶여 있다. 순례자가 남긴 표식이다.";
          return (
            <button
              type="button"
              onClick={() => setPilgrimMarkOpen(true)}
              className="flex w-full items-center gap-3 rounded-lg border border-violet-300/80 bg-violet-50/70 px-4 py-3 text-left transition-colors hover:bg-violet-100/70 dark:border-violet-900/60 dark:bg-violet-950/30 dark:hover:bg-violet-950/50"
            >
              <Footprints
                size={28}
                weight="duotone"
                className="shrink-0 text-violet-600 dark:text-violet-400"
              />
              <div className="min-w-0 flex-1">
                <div className="text-[11px] uppercase tracking-wider text-violet-700/80 dark:text-violet-400/80">
                  순례자의 자취
                </div>
                <p className="mt-0.5 text-sm italic text-zinc-700 dark:text-zinc-300">
                  {message}
                </p>
              </div>
            </button>
          );
        })()}
      <div className="space-y-2">
        {currentRegion.tags?.includes("town") &&
          currentRegion.id !== "fiefdom_hall" && (
            <EntryCard
              icon={
                <User size={28} weight="duotone" className="text-blue-500" />
              }
              title={currentRegion.name}
              description="마을을 둘러보고 사람들과 이야기합니다."
              onClick={() => setSubView("town")}
            />
          )}
        {/* 길드 영지 진입 — fiefdom_hall 노드 전용. 일반 town 카드 대신 이걸 띄운다.
            플래그 OFF 시에는 진입 불가 안내(곧 공개됩니다). */}
        {currentRegion.id === "fiefdom_hall" &&
          (isFiefdomEnabled() ? (
            <EntryCard
              icon={
                <CastleTurret
                  size={28}
                  weight="duotone"
                  className="text-indigo-500"
                />
              }
              title="영주의 회관"
              description="길드 영지를 관리합니다."
              onClick={() => setSubView("fiefdom")}
            />
          ) : (
            <div className="flex w-full items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-zinc-50/60 px-4 py-3 text-left dark:border-zinc-700 dark:bg-zinc-900/40">
              <CastleTurret
                size={28}
                weight="duotone"
                className="shrink-0 text-zinc-400 dark:text-zinc-500"
              />
              <div className="min-w-0 flex-1">
                <div className="text-base font-medium text-zinc-700 dark:text-zinc-300">
                  영주의 회관
                </div>
                <div className="truncate text-sm text-zinc-500 dark:text-zinc-500">
                  곧 공개됩니다 — 길드 영지 시스템 준비 중.
                </div>
              </div>
            </div>
          ))}
        {currentRegion.enemies.length > 0 && (
          <EntryCard
            icon={
              <Sword size={28} weight="duotone" className="text-rose-500" />
            }
            title="전투"
            description="적과 맞서 싸웁니다."
            onClick={() => setSubView("battle")}
          />
        )}
        {COOP_BOSSES[currentRegion.id] && (
          <EntryCard
            icon={
              <Skull size={28} weight="duotone" className="text-rose-500" />
            }
            title="보스"
            description="협동 보스에 도전합니다."
            onClick={() => setSubView("boss")}
          />
        )}
        {!COOP_BOSSES[currentRegion.id] && currentRegion.boss && (
          <EntryCard
            icon={
              <Skull size={28} weight="duotone" className="text-rose-500" />
            }
            title="보스"
            description="이 지역의 보스에 도전합니다."
            onClick={() => setSubView("boss")}
          />
        )}
        {isTower && (
          <EntryCard
            icon={<Crown size={28} weight="duotone" className="text-amber-500" />}
            title="고탑 도전"
            description="영원히 끝나지 않는 수직 미궁. 일일 3회 도전."
            onClick={() => setSubView("tower")}
          />
        )}
        <EntryCard
          icon={
            <Compass
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="지도"
          description="모험할 곳을 찾아봅니다."
          onClick={() => setSubView("map")}
        />
      </div>
      <ServerFeedView />
      {pilgrimMarkOpen && (
        <PilgrimMarkDialogue
          currentRegionId={currentRegion.id}
          onClose={() => setPilgrimMarkOpen(false)}
          quests={quests}
          completeQuest={completeQuest}
          inventory={inventory}
          storyFlags={storyFlags}
        />
      )}
    </>
  );
}
