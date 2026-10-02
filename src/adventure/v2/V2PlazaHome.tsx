"use client";

import { Envelope, Megaphone, Note, Storefront, Trophy } from "@phosphor-icons/react";
import { EntryList, EntryRow } from "@/components/ui/EntryList";
import { PageShell } from "@/components/ui/PageShell";
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
    <PageShell spacing="tight">
      <SubViewHeader title="광장" />
      <EntryList>
        <EntryRow
          icon={<Note size={28} weight="duotone" className="text-sky-500" />}
          title="게시판"
          onClick={() => onAction({ kind: "open-bulletin" })}
        />
        <EntryRow
          icon={<Trophy size={28} weight="duotone" className="text-amber-600" />}
          title="랭킹"
          onClick={() => onAction({ kind: "open-rankings" })}
        />
        <EntryRow
          icon={
            <Megaphone size={28} weight="duotone" className="text-violet-400" />
          }
          title="전체 소식"
          onClick={() => onAction({ kind: "open-feed" })}
        />
        <EntryRow
          icon={
            <Storefront size={28} weight="duotone" className="text-rose-500" />
          }
          title="거래소"
          onClick={() => onAction({ kind: "open-market" })}
        />
        <EntryRow
          icon={
            <Envelope size={28} weight="duotone" className="text-emerald-500" />
          }
          title="우편함"
          onClick={() => onAction({ kind: "open-inbox" })}
        />
      </EntryList>
    </PageShell>
  );
}
