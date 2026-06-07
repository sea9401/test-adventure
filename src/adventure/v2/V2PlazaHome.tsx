"use client";

import { Envelope, Megaphone, Note, Storefront, Trophy } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";

// 광장 탭 default — 커뮤니티(게시판/랭킹/전체 소식/우편함/거래소). 마을(시설)에서 분리.
export type PlazaAction =
  | { kind: "open-bulletin" }
  | { kind: "open-rankings" }
  | { kind: "open-feed" }
  | { kind: "open-inbox" }
  | { kind: "open-market" };

export function V2PlazaHome({
  onAction,
}: {
  onAction: (action: PlazaAction) => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">광장</h1>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          다른 모험가들과 소식을 나누는 곳.
        </p>
      </header>
      <div className="space-y-2">
        <EntryCard
          icon={<Note size={28} weight="duotone" className="text-sky-500" />}
          title="게시판"
          description="모험가들이 글을 남기는 마을 게시판."
          onClick={() => onAction({ kind: "open-bulletin" })}
        />
        <EntryCard
          icon={<Trophy size={28} weight="duotone" className="text-amber-600" />}
          title="랭킹"
          description="모험가 명부 — 레벨·명성·전투 횟수 순위."
          onClick={() => onAction({ kind: "open-rankings" })}
        />
        <EntryCard
          icon={
            <Megaphone size={28} weight="duotone" className="text-violet-400" />
          }
          title="전체 소식"
          description="유니크 획득·걸작 제작 등 온 대륙에 퍼지는 소식."
          onClick={() => onAction({ kind: "open-feed" })}
        />
        <EntryCard
          icon={
            <Storefront size={28} weight="duotone" className="text-rose-500" />
          }
          title="거래소"
          description="다른 모험가와 장비·재료를 사고파는 곳."
          onClick={() => onAction({ kind: "open-market" })}
        />
        <EntryCard
          icon={
            <Envelope size={28} weight="duotone" className="text-emerald-500" />
          }
          title="우편함"
          description="받은 쪽지와 마켓 정산·보상을 확인·수령."
          onClick={() => onAction({ kind: "open-inbox" })}
        />
      </div>
    </main>
  );
}
