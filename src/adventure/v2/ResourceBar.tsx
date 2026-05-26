"use client";

import type { V2Resources } from "@/adventure/data/v2/resources";

// v2 헤더 — 보유 자원 표시. 모든 v2 view 위에 sticky 로 항상 보임.
// 현재 1종(stone). 미래 food/wood/etc 확장 시 칸 추가.
// resources === null → 로딩 또는 fetch 실패. "—" 로 표시해서 0 으로 오해 안 되게.
export function ResourceBar({ resources }: { resources: V2Resources | null }) {
  const loaded = resources !== null;
  return (
    <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-zinc-200 bg-zinc-50/95 px-4 py-2 text-xs backdrop-blur dark:border-zinc-800 dark:bg-zinc-950/95">
      <span className="text-zinc-500 dark:text-zinc-400">자원</span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">광물</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {loaded ? resources.stone : "—"}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <span className="text-zinc-400">주문서</span>
        <span className="font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
          {loaded ? resources.scrolls : "—"}
        </span>
      </span>
    </div>
  );
}
