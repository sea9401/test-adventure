"use client";

import { Envelope, Megaphone, Note, Storefront, Trophy } from "@phosphor-icons/react";
import { EntryCard } from "@/components/ui/EntryCard";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

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
      <SubViewHeader title="광장" />
      <div className="space-y-2">
        <EntryCard
          icon={<Note size={28} weight="duotone" className="text-sky-500" />}
          title="게시판"
          onClick={() => onAction({ kind: "open-bulletin" })}
        />
        <EntryCard
          icon={<Trophy size={28} weight="duotone" className="text-amber-600" />}
          title="랭킹"
          onClick={() => onAction({ kind: "open-rankings" })}
        />
        <EntryCard
          icon={
            <Megaphone size={28} weight="duotone" className="text-violet-400" />
          }
          title="전체 소식"
          onClick={() => onAction({ kind: "open-feed" })}
        />
        <EntryCard
          icon={
            <Storefront size={28} weight="duotone" className="text-rose-500" />
          }
          title="거래소"
          onClick={() => onAction({ kind: "open-market" })}
        />
        <EntryCard
          icon={
            <Envelope size={28} weight="duotone" className="text-emerald-500" />
          }
          title="우편함"
          onClick={() => onAction({ kind: "open-inbox" })}
        />
      </div>
    </main>
  );
}
