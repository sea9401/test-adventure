"use client";

export async function acknowledgeFarmReadyNotification(): Promise<void> {
  try {
    const res = await fetch("/api/v2/notifications/farm-ready/read", {
      method: "POST",
    });
    if (!res.ok) return;
    window.dispatchEvent(new Event("v2notif:read"));
  } catch {
    // 확인 기록 실패는 화면 이동을 막지 않는다. 다음 폴링에서 다시 노출한다.
  }
}
