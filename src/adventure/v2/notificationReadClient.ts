"use client";

export async function acknowledgeV2Notification(
  notificationId: number,
): Promise<boolean> {
  try {
    const res = await fetch("/api/v2/notifications/read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
      keepalive: true,
    });
    if (!res.ok) return false;
    window.dispatchEvent(new Event("v2notif:read"));
    return true;
  } catch {
    // 읽음 기록 실패는 화면 이동을 막지 않는다. 다음 폴링에서 다시 노출한다.
    return false;
  }
}
