"use client";

import { FiefdomLiveView } from "@/adventure/fiefdom/FiefdomLiveView";

export function FiefdomPreviewClient() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>운영자 미리보기</strong> · 길드 영지 PvP 라이브 (실 길드/DB). 일반 유저에게는 노출되지 않습니다.
      </div>
      <FiefdomLiveView onBack={() => window.history.back()} />
    </div>
  );
}
