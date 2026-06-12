"use client";

import { TabBar } from "@/components/ui/TabBar";

// 보물 발굴 3화면 공용 서브 탭바 — 발굴 / 주간 순위 / 발굴 보관함 (#726 → 3화면 통일 #727).
// 핸들러 미전달(dev 하니스 등) 시 그 탭은 숨긴다. 현재 화면 탭은 no-op.

export type TreasureTabKey = "dig" | "leaderboard" | "collection";

export function TreasureSubTabs({
  active,
  onOpenDig,
  onOpenLeaderboard,
  onOpenCollection,
}: {
  active: TreasureTabKey;
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenCollection?: () => void;
}) {
  const tabs = [
    ...(active === "dig" || onOpenDig
      ? [{ key: "dig" as const, label: "발굴" }]
      : []),
    ...(active === "leaderboard" || onOpenLeaderboard
      ? [{ key: "leaderboard" as const, label: "주간 순위" }]
      : []),
    ...(active === "collection" || onOpenCollection
      ? [{ key: "collection" as const, label: "발굴 보관함" }]
      : []),
  ];
  if (tabs.length <= 1) return null;
  return (
    <TabBar
      tabs={tabs}
      active={active}
      onChange={(k) => {
        if (k === active) return;
        if (k === "dig") onOpenDig?.();
        else if (k === "leaderboard") onOpenLeaderboard?.();
        else if (k === "collection") onOpenCollection?.();
      }}
      ariaLabel="발굴 메뉴"
      size="sm"
      variant="highlight"
    />
  );
}
