"use client";

import { useEffect, useState, type ReactNode } from "react";
import { UserCircle } from "@phosphor-icons/react";
import type { Region, RegionId } from "./data/world";
import { getNpcsByRegion, type Npc, type NpcId, type NpcRole } from "./data/npcs";
import { NpcDialogue } from "./NpcDialogue";
import { NpcAvatar } from "./NpcAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { Card } from "@/components/ui/Card";
import type { NpcQuestBadge } from "./quests/npcAvailability";

const ROLE_LABEL: Record<NpcRole, string> = {
  elder: "촌장",
  vendor: "상인",
  innkeeper: "여관 주인",
  quest: "의뢰인",
  lore: "마을 사람",
  stranger: "방문자",
  trainer: "교관",
};

export function TownView({
  region,
  onTalkClose,
  renderNpcDialogue,
  initialNpcId,
  onInitialNpcConsumed,
  hasAvailableQuest,
}: {
  region: Region;
  onTalkClose?: (npcId: NpcId, regionId: RegionId) => void;
  /**
   * 특정 NPC에 대해 기본 NpcDialogue 대신 커스텀 다이얼로그를 렌더할 때 사용.
   * null/undefined를 반환하면 기본 NpcDialogue 렌더.
   */
  renderNpcDialogue?: (npc: Npc, onClose: () => void) => ReactNode;
  /** 마운트 시 자동으로 열어 둘 NPC 대화 — 알림판 등 외부 진입 경로용. */
  initialNpcId?: string;
  /** initialNpcId 를 한 번 소비했음을 부모에 알림 (state 정리용). */
  onInitialNpcConsumed?: () => void;
  /**
   * NPC 아바타 우상단 뱃지 결정자:
   *   "ready"     → "?" (보상 받을 의뢰 있음)
   *   "available" → "!" (수락 가능한 새 의뢰 있음, 진행 중 없음)
   *   null        → 표시 없음
   */
  hasAvailableQuest?: (npcId: NpcId) => NpcQuestBadge;
}) {
  const npcs = getNpcsByRegion(region.id);
  const [openNpc, setOpenNpc] = useState<Npc | null>(null);

  // 외부에서 특정 NPC 자동 오픈 요청. 마운트 시 한 번만 처리하고 부모에 소비 알림.
  // NPC 가 이 region 에 없으면 consume 하지 않음 — 부모 state 유지해 올바른 town 진입
  // 시 재시도. (예전: 잘못된 town 에 잠깐 떨어져도 무조건 consume → intent 영구 손실.)
  useEffect(() => {
    if (!initialNpcId) return;
    const npc = npcs.find((n) => n.id === initialNpcId);
    if (!npc) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOpenNpc(npc);
    onInitialNpcConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const closeNpc = () => {
    if (openNpc) onTalkClose?.(openNpc.id, region.id);
    setOpenNpc(null);
  };

  return (
    <div className="space-y-3">
      <Card as="section" padding="md">
        <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
          {region.name}
        </div>
        <p className="mt-1 text-sm text-zinc-700 dark:text-zinc-300">
          {region.description}
        </p>
      </Card>

      {npcs.length === 0 ? (
        <EmptyState
          icon={<UserCircle size={40} weight="duotone" />}
          title="마을 사람이 보이지 않습니다"
          message="어디로 갔는지 안개만 자욱하다."
        />
      ) : (
        <div className="space-y-2">
          <div className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            만날 수 있는 사람
          </div>
          {npcs.map((npc) => {
            const badge = hasAvailableQuest?.(npc.id) ?? null;
            return (
              <button
                key={npc.id}
                type="button"
                onClick={() => setOpenNpc(npc)}
                className="flex w-full items-center gap-3 rounded-lg border border-zinc-200 bg-white/90 px-4 py-3 text-left transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-950/90 dark:hover:bg-zinc-900/80"
              >
                <span className="relative shrink-0">
                  <NpcAvatar npc={npc} size={28} />
                  {badge === "available" && (
                    <span
                      aria-label="받을 수 있는 의뢰 있음"
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-amber-400 text-[10px] font-bold leading-none text-zinc-900 ring-2 ring-white dark:ring-zinc-950"
                    >
                      !
                    </span>
                  )}
                  {badge === "ready" && (
                    <span
                      aria-label="완료한 의뢰 보고 가능"
                      className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-400 text-[10px] font-bold leading-none text-zinc-900 ring-2 ring-white dark:ring-zinc-950"
                    >
                      ?
                    </span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-zinc-900 dark:text-zinc-100">
                    {npc.name}
                    <span className="ml-2 text-xs font-normal text-zinc-500 dark:text-zinc-400">
                      {ROLE_LABEL[npc.role]}
                    </span>
                  </span>
                  <span className="block truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {npc.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}

      {openNpc &&
        (renderNpcDialogue?.(openNpc, closeNpc) ?? (
          <NpcDialogue npc={openNpc} onClose={closeNpc} />
        ))}
    </div>
  );
}
