"use client";

import {
  Backpack,
  BookOpen,
  Compass,
  Lightning,
  MapTrifold,
  SlidersHorizontal,
  Sparkle,
  Trophy,
  UserCircle,
} from "@phosphor-icons/react";
import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { EntryList, EntryRow } from "@/components/ui/EntryList";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { canChangeUnexploredNodes } from "@/adventure/data/v2/unexploredState";

// 캐릭터 탭 default — 내 정보 / 인벤토리 / 스킬 + 모험의 서. 마을과 같은 EntryCard 패턴.
// 장비 장착/해제는 인벤토리 안에서 처리. 모험의 서는 도감(우선 재료) — 맨 아래에 둔다.

export type CharacterAction =
  | { kind: "open-emblems" }
  | { kind: "open-info" }
  | { kind: "open-inventory" }
  | { kind: "open-skills" }
  | { kind: "open-presets" }
  | { kind: "open-shrine" }
  | { kind: "open-quests" }
  | { kind: "open-trophies" }
  | { kind: "open-codex" }
  | { kind: "open-unexplored" };

// 개척 노드는 100레벨부터. 레벨을 읽기 전(기본 1레벨)에는 잠금으로 보이지 않게 한다.
export function unexploredLockLabel(level: number, loaded: boolean): string | undefined {
  return loaded && !canChangeUnexploredNodes(level) ? "Lv 100에 열립니다" : undefined;
}

export function V2CharacterMenu({
  onAction,
  unexploredEnabled = V2_UNEXPLORED,
  unexploredLocked,
}: {
  onAction: (action: CharacterAction) => void;
  unexploredEnabled?: boolean;
  /** 개척 노드 해금 조건. 주면 메뉴 행에 자물쇠와 조건을 보여 준다. */
  unexploredLocked?: string;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="캐릭터" />
      <EntryList>
        <EntryRow
          icon={
            <UserCircle size={28} weight="duotone" className="text-amber-500" />
          }
          title="내 정보"
          onClick={() => onAction({ kind: "open-info" })}
        />
        <EntryRow
          icon={
            <Backpack size={28} weight="duotone" className="text-emerald-600" />
          }
          title="인벤토리"
          onClick={() => onAction({ kind: "open-inventory" })}
        />
        <EntryRow
          icon={<Sparkle size={28} weight="duotone" className="text-violet-500" />}
          title="문장"
          description="문장 장착과 합성 · 레벨업 추가 성장"
          onClick={() => onAction({ kind: "open-emblems" })}
        />
        <EntryRow
          icon={
            <Lightning size={28} weight="duotone" className="text-violet-500" />
          }
          title="스킬"
          onClick={() => onAction({ kind: "open-skills" })}
        />
        <EntryRow
          icon={
            <SlidersHorizontal
              size={28}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="전투 프리셋"
          onClick={() => onAction({ kind: "open-presets" })}
        />
        <EntryRow
          icon={
            <Compass size={28} weight="duotone" className="text-rose-400" />
          }
          title="퀘스트"
          onClick={() => onAction({ kind: "open-quests" })}
        />
        <EntryRow
          icon={
            <Sparkle size={28} weight="duotone" className="text-violet-400" />
          }
          title="성장의 신전"
          onClick={() => onAction({ kind: "open-shrine" })}
        />
        {unexploredEnabled && (
          <EntryRow
            icon={
              <MapTrifold
                size={28}
                weight="duotone"
                className="text-violet-500"
              />
            }
            title="개척 노드"
            locked={unexploredLocked}
            onClick={() => onAction({ kind: "open-unexplored" })}
          />
        )}
        <EntryRow
          icon={
            <Trophy size={28} weight="duotone" className="text-amber-600" />
          }
          title="트로피 전시대"
          onClick={() => onAction({ kind: "open-trophies" })}
        />
        <EntryRow
          icon={
            <BookOpen size={28} weight="duotone" className="text-sky-500" />
          }
          title="모험의 서"
          onClick={() => onAction({ kind: "open-codex" })}
        />
      </EntryList>
    </PageShell>
  );
}
