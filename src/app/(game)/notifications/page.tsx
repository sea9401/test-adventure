"use client";

import { useRouter } from "next/navigation";
import { V2NotificationsView } from "@/adventure/v2/V2NotificationsView";

// /notifications — 알림 목록(Bell 착지점). 어느 탭에서든 진입하므로 뒤로 = history back.
export default function NotificationsPage() {
  const router = useRouter();
  return (
    <V2NotificationsView
      onBack={() => router.back()}
      onOpenOutpost={(id) => router.push(`/outpost/${id}`)}
    />
  );
}
