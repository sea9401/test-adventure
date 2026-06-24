"use client";

import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";

// 보물 발굴 화면 공용 서브 탭바 — 발굴 / 주간 순위 / 발굴 보관함 / 상점 (#726 → 3화면 통일 #727).
// 상점은 옛 우상단 배지 버튼에서 탭으로 승격. 핸들러 미전달(dev 하니스 등) 시 그 탭은 숨긴다. 현재 화면 탭은 no-op.

export type TreasureTabKey = "dig" | "leaderboard" | "collection" | "shop";

export function TreasureSubTabs({
  active,
  onOpenDig,
  onOpenLeaderboard,
  onOpenCollection,
  onOpenShop,
}: {
  active: TreasureTabKey;
  onOpenDig?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenCollection?: () => void;
  onOpenShop?: () => void;
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
    ...(active === "shop" || onOpenShop
      ? [{ key: "shop" as const, label: "상점" }]
      : []),
  ];
  if (tabs.length <= 1) return null;
  // 지역 배경 위라 라이트모드 가독성 위해 surface 패널로 감쌈. 탭이 4개라 가로 스크롤 허용.
  return (
    <HeaderPanel className="py-2">
      <TabBar
        tabs={tabs}
        active={active}
        onChange={(k) => {
          if (k === active) return;
          if (k === "dig") onOpenDig?.();
          else if (k === "leaderboard") onOpenLeaderboard?.();
          else if (k === "collection") onOpenCollection?.();
          else if (k === "shop") onOpenShop?.();
        }}
        ariaLabel="발굴 메뉴"
        size="sm"
        variant="highlight"
        scrollable
      />
    </HeaderPanel>
  );
}
