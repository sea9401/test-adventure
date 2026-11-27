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
import {
  EntryTile,
  EntryTileGrid,
  type EntryTileStatusResolver,
} from "@/components/ui/EntryList";
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
  menuStatus,
}: {
  onAction: (action: CharacterAction) => void;
  unexploredEnabled?: boolean;
  /** 개척 노드 해금 조건. 주면 메뉴 행에 자물쇠와 조건을 보여 준다. */
  unexploredLocked?: string;
  /** 타일 아래 상태 한 줄(오늘 할 일). 주지 않으면 이름만 보인다. */
  menuStatus?: EntryTileStatusResolver;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="캐릭터" />
      <EntryTileGrid>
        <EntryTile
          icon={
            <UserCircle size={24} weight="duotone" className="text-amber-500" />
          }
          title="내 정보"
          status={menuStatus?.("/character/info", "내 정보")}
          onClick={() => onAction({ kind: "open-info" })}
        />
        <EntryTile
          icon={
            <Backpack size={24} weight="duotone" className="text-emerald-600" />
          }
          title="인벤토리"
          status={menuStatus?.("/character/inventory", "인벤토리")}
          onClick={() => onAction({ kind: "open-inventory" })}
        />
        <EntryTile
          icon={<Sparkle size={24} weight="duotone" className="text-violet-500" />}
          title="문장"
          description="문장 장착과 합성 · 레벨업 추가 성장"
          status={menuStatus?.("/character/emblems", "문장")}
          onClick={() => onAction({ kind: "open-emblems" })}
        />
        <EntryTile
          icon={
            <Lightning size={24} weight="duotone" className="text-violet-500" />
          }
          title="스킬"
          status={menuStatus?.("/character/skills", "스킬")}
          onClick={() => onAction({ kind: "open-skills" })}
        />
        <EntryTile
          icon={
            <SlidersHorizontal
              size={24}
              weight="duotone"
              className="text-emerald-500"
            />
          }
          title="전투 프리셋"
          status={menuStatus?.("/character/presets", "전투 프리셋")}
          onClick={() => onAction({ kind: "open-presets" })}
        />
        <EntryTile
          icon={
            <Compass size={24} weight="duotone" className="text-rose-400" />
          }
          title="퀘스트"
          status={menuStatus?.("/quests", "퀘스트")}
          onClick={() => onAction({ kind: "open-quests" })}
        />
        <EntryTile
          icon={
            <Sparkle size={24} weight="duotone" className="text-violet-400" />
          }
          title="성장의 신전"
          status={menuStatus?.("/character/shrine", "성장의 신전")}
          onClick={() => onAction({ kind: "open-shrine" })}
        />
        {unexploredEnabled && (
          <EntryTile
            icon={
              <MapTrifold
                size={24}
                weight="duotone"
                className="text-violet-500"
              />
            }
            title="개척 노드"
            locked={unexploredLocked}
            status={menuStatus?.("/character/unexplored", "개척 노드")}
            onClick={() => onAction({ kind: "open-unexplored" })}
          />
        )}
        <EntryTile
          icon={
            <Trophy size={24} weight="duotone" className="text-amber-600" />
          }
          title="트로피 전시대"
          status={menuStatus?.("/character/trophies", "트로피 전시대")}
          onClick={() => onAction({ kind: "open-trophies" })}
        />
        <EntryTile
          icon={
            <BookOpen size={24} weight="duotone" className="text-sky-500" />
          }
          title="모험의 서"
          status={menuStatus?.("/character/codex", "모험의 서")}
          onClick={() => onAction({ kind: "open-codex" })}
        />
      </EntryTileGrid>
    </PageShell>
  );
}
