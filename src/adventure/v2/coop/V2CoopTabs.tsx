"use client";

import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { TabBar } from "@/components/ui/TabBar";

export type V2CoopTabKey = "bosses" | "shop";

export function V2CoopTabs({
  active,
  onOpenBosses,
  onOpenShop,
}: {
  active: V2CoopTabKey;
  onOpenBosses?: () => void;
  onOpenShop?: () => void;
}) {
  const tabs = [
    ...(active === "bosses" || onOpenBosses
      ? [{ key: "bosses" as const, label: "토벌" }]
      : []),
    ...(active === "shop" || onOpenShop
      ? [{ key: "shop" as const, label: "교환소" }]
      : []),
  ];
  if (tabs.length <= 1) return null;
  return (
    <HeaderPanel className="py-2">
      <TabBar
        tabs={tabs}
        active={active}
        onChange={(k) => {
          if (k === active) return;
          if (k === "bosses") onOpenBosses?.();
          else if (k === "shop") onOpenShop?.();
        }}
        ariaLabel="협동 보스 메뉴"
        size="sm"
        variant="highlight"
        scrollable
      />
    </HeaderPanel>
  );
}
