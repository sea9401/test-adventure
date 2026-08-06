"use client";

import { useEffect, useState } from "react";

// Android TWA/PWA가 네이티브 스플래시에서 첫 웹 프레임으로 넘어갈 때 검은 빈 화면이
// 잠깐 드러나지 않도록 같은 배경·아이콘을 한 프레임 이어서 보여준 뒤 부드럽게 걷는다.
// 일반 브라우저 탭에서는 CSS display-mode 조건으로 렌더 결과를 숨긴다.
export function AppLaunchSplash() {
  const [leaving, setLeaving] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setLeaving(true));
    const timer = window.setTimeout(() => setVisible(false), 240);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  return (
    <div
      aria-hidden="true"
      className={`app-launch-splash ${leaving ? "app-launch-splash--leaving" : ""}`}
    >
      {/* 정적 파비콘을 그대로 사용해 Android 네이티브 스플래시와 모양을 맞춘다. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={112} height={112} />
    </div>
  );
}
