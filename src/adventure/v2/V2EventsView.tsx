"use client";

import { useState } from "react";
import {
  CalendarCheck,
  DiceFive,
  Gift,
  ShareNetwork,
  Ticket,
} from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { TabBar } from "@/components/ui/TabBar";
import { V2CouponView } from "./V2CouponView";
import { V2ReferralView } from "./V2ReferralView";
import { V2AttendanceView } from "./V2AttendanceView";
import { useAttendanceReminder } from "./useAttendanceReminder";
import { winterPhase } from "@/adventure/data/v2/winterBoard";
import { V2WinterBoardView } from "./V2WinterBoardView";
import { useWinterBoardReminder } from "./useWinterBoardReminder";

export type EventTab = "attendance" | "winter" | "promotion" | "coupon";

const TAB_LABELS: Record<EventTab, string> = {
  attendance: "출석 체크",
  winter: "겨울 이벤트",
  promotion: "게임 홍보",
  coupon: "쿠폰 등록",
};

const EVENT_TABS = [
  {
    key: "attendance" as const,
    label: TAB_LABELS.attendance,
    icon: <CalendarCheck size={18} weight="duotone" />,
  },
  {
    // 겨울 이벤트가 끝나면 이 탭은 목록에서 빠진다.
    key: "winter" as const,
    label: TAB_LABELS.winter,
    icon: <DiceFive size={18} weight="duotone" />,
  },
  {
    key: "promotion" as const,
    label: TAB_LABELS.promotion,
    icon: <ShareNetwork size={18} weight="duotone" />,
  },
  {
    key: "coupon" as const,
    label: TAB_LABELS.coupon,
    icon: <Ticket size={18} weight="duotone" />,
  },
];

export function V2EventsView({
  initialTab = "attendance",
}: {
  initialTab?: EventTab;
}) {
  const router = useRouter();
  // 한 번 정한 뒤 바꾸지 않는다. 화면을 보는 중에 끝나도 다음 진입 때 탭이 빠진다.
  const [winterOpen] = useState(() => winterPhase(Date.now()) !== "ended");
  const [tab, setTab] = useState<EventTab>(
    initialTab === "winter" && !winterOpen ? "attendance" : initialTab,
  );
  const attendancePending = useAttendanceReminder();
  const winterPending = useWinterBoardReminder();
  const tabs = EVENT_TABS.filter(
    (item) => item.key !== "winter" || winterOpen,
  ).map((item) =>
    item.key === "attendance" && attendancePending
      ? {
          ...item,
          badge: "!",
          badgeLabel: "오늘 출석 체크 필요",
        }
      : item.key === "winter" && winterPending > 0
        ? {
            ...item,
            badge: "!",
            badgeLabel: "굴릴 주사위나 받을 보상 있음",
          }
        : item,
  );

  const changeTab = (next: EventTab) => {
    setTab(next);
    router.replace(
      next === "attendance"
        ? "/settings/events"
        : `/settings/events?tab=${next}`,
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
          tabs={tabs}
          active={tab}
          onChange={changeTab}
          ariaLabel="이벤트 분류"
          size="md"
          variant="highlight"
          badgeVariant="alert"
          scrollable
        />
      </Card>

      <section
        role="tabpanel"
        aria-label={TAB_LABELS[tab]}
        className="space-y-4"
      >
        {tab === "attendance" ? (
          <V2AttendanceView />
        ) : tab === "winter" ? (
          <V2WinterBoardView />
        ) : tab === "promotion" ? (
          <V2ReferralView embedded />
        ) : (
          <V2CouponView embedded />
        )}
      </section>
    </PageShell>
  );
}
