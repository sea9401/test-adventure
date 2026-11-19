"use client";

export async function acknowledgePeddlerArrivalNotification(): Promise<boolean> {
  try {
    const res = await fetch("/api/v2/notifications/peddler-arrival/read", {
      method: "POST",
    });
    if (!res.ok) return false;
    window.dispatchEvent(new Event("v2notif:read"));
    return true;
  } catch {
    // 확인 기록 실패는 화면 이동을 막지 않는다. 다음 폴링에서 다시 노출한다.
    return false;
  }
}
