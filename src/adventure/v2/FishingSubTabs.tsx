"use client";

import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";

// 낚시터 5화면 공용 서브 탭바 — 낚시 / 일일 과제 / 주간 순위 / 명예의 전당 / 상점.
// 보물 발굴(TreasureSubTabs)과 같은 패턴: 우상단 작은 버튼 메뉴를 탭바로 승격.
// 핸들러 미전달(dev 하니스 등) 시 그 탭은 숨긴다. 현재 화면 탭은 no-op.

export type FishingTabKey =
  | "fishing"
  | "challenges"
  | "leaderboard"
  | "hallOfFame"
  | "shop";

export function FishingSubTabs({
  active,
  onOpenFishing,
  onOpenChallenges,
  onOpenLeaderboard,
  onOpenHallOfFame,
  onOpenShop,
}: {
  active: FishingTabKey;
  onOpenFishing?: () => void;
  onOpenChallenges?: () => void;
  onOpenLeaderboard?: () => void;
  onOpenHallOfFame?: () => void;
  onOpenShop?: () => void;
}) {
  const tabs = [
    ...(active === "fishing" || onOpenFishing
      ? [{ key: "fishing" as const, label: "낚시" }]
      : []),
    ...(active === "challenges" || onOpenChallenges
      ? [{ key: "challenges" as const, label: "일일 과제" }]
      : []),
    ...(active === "leaderboard" || onOpenLeaderboard
      ? [{ key: "leaderboard" as const, label: "주간 순위" }]
      : []),
    ...(active === "hallOfFame" || onOpenHallOfFame
      ? [{ key: "hallOfFame" as const, label: "명예의 전당" }]
      : []),
    ...(active === "shop" || onOpenShop
      ? [{ key: "shop" as const, label: "상점" }]
      : []),
  ];
  if (tabs.length <= 1) return null;
  // 지역 배경 위라 라이트모드 가독성 위해 surface 패널로 감쌈. 탭이 5개라 가로 스크롤 허용.
  return (
    <HeaderPanel className="py-2">
      <TabBar
        tabs={tabs}
        active={active}
        onChange={(k) => {
          if (k === active) return;
          if (k === "fishing") onOpenFishing?.();
          else if (k === "challenges") onOpenChallenges?.();
          else if (k === "leaderboard") onOpenLeaderboard?.();
          else if (k === "hallOfFame") onOpenHallOfFame?.();
          else if (k === "shop") onOpenShop?.();
        }}
        ariaLabel="낚시터 메뉴"
        size="sm"
        variant="highlight"
        scrollable
      />
    </HeaderPanel>
  );
}
