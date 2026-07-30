"use client";

import { useState } from "react";
import { Gift, ShareNetwork, Ticket } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { V2CouponView } from "./V2CouponView";
import { V2ReferralView } from "./V2ReferralView";

export type EventTab = "promotion" | "coupon";

const EVENT_TABS = [
  {
    key: "promotion" as const,
    label: "게임 홍보",
    icon: <ShareNetwork size={18} weight="duotone" />,
  },
  {
    key: "coupon" as const,
    label: "쿠폰 등록",
    icon: <Ticket size={18} weight="duotone" />,
  },
];

export function V2EventsView({
  initialTab = "promotion",
}: {
  initialTab?: EventTab;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<EventTab>(initialTab);

  const changeTab = (next: EventTab) => {
    setTab(next);
    router.replace(
      next === "coupon" ? "/settings/events?tab=coupon" : "/settings/events",
      { scroll: false },
    );
  };

  return (
    <PageShell>
      <SubViewHeader
        title={
          <>
            <Gift size={20} weight="duotone" />
            이벤트
          </>
        }
        onBack={() => router.push("/")}
      />

      <Card padding="none" className="overflow-hidden px-2 pt-1">
        <TabBar
          tabs={EVENT_TABS}
          active={tab}
          onChange={changeTab}
          ariaLabel="이벤트 분류"
          size="md"
          variant="highlight"
        />
      </Card>

      <section
        role="tabpanel"
        aria-label={tab === "promotion" ? "게임 홍보" : "쿠폰 등록"}
        className="space-y-4"
      >
        {tab === "promotion" ? (
          <V2ReferralView embedded />
        ) : (
          <V2CouponView embedded />
        )}
      </section>
    </PageShell>
  );
}
