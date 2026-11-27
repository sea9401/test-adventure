"use client";

import { Envelope, Megaphone, Note, Storefront, Trophy } from "@phosphor-icons/react";
import {
  EntryTile,
  EntryTileGrid,
  type EntryTileStatusResolver,
} from "@/components/ui/EntryList";
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
  menuStatus,
}: {
  onAction: (action: PlazaAction) => void;
  /** 타일 아래 상태 한 줄(오늘 할 일). 주지 않으면 이름만 보인다. */
  menuStatus?: EntryTileStatusResolver;
}) {
  return (
    <PageShell spacing="tight">
      <SubViewHeader title="광장" />
      <EntryTileGrid>
        <EntryTile
          icon={<Note size={24} weight="duotone" className="text-sky-500" />}
          title="게시판"
          status={menuStatus?.("/plaza/bulletin", "게시판")}
          onClick={() => onAction({ kind: "open-bulletin" })}
        />
        <EntryTile
          icon={<Trophy size={24} weight="duotone" className="text-amber-600" />}
          title="랭킹"
          status={menuStatus?.("/plaza/rankings", "랭킹")}
          onClick={() => onAction({ kind: "open-rankings" })}
        />
        <EntryTile
          icon={
            <Megaphone size={24} weight="duotone" className="text-violet-400" />
          }
          title="전체 소식"
          status={menuStatus?.("/plaza/feed", "전체 소식")}
          onClick={() => onAction({ kind: "open-feed" })}
        />
        <EntryTile
          icon={
            <Storefront size={24} weight="duotone" className="text-rose-500" />
          }
          title="거래소"
          status={menuStatus?.("/plaza/market", "거래소")}
          onClick={() => onAction({ kind: "open-market" })}
        />
        <EntryTile
          icon={
            <Envelope size={24} weight="duotone" className="text-emerald-500" />
          }
          title="우편함"
          status={menuStatus?.("/plaza/inbox", "우편함")}
          onClick={() => onAction({ kind: "open-inbox" })}
        />
      </EntryTileGrid>
    </PageShell>
  );
}
