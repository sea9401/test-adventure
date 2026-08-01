"use client";

import { useRouter } from "next/navigation";
import { V2NotificationsView } from "@/adventure/v2/V2NotificationsView";

// /plaza/inbox — 기존 북마크/광장 진입을 유지하되 통합 알림 센터의 우편 탭으로 착지.
export default function InboxPage() {
  const router = useRouter();
  return (
    <V2NotificationsView
      initialTab="mail"
      onBack={() => router.push("/plaza")}
      onOpenOutpost={() => router.push("/guild")}
      onOpenFeedback={(feedbackId) =>
        router.push(`/feedback#feedback-${feedbackId}`)
      }
      onOpenFarm={() => router.push("/town/farm")}
    />
  );
}
