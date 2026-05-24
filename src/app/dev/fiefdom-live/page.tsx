"use client";

import { FiefdomLiveView } from "@/adventure/fiefdom/FiefdomLiveView";

// 라이브 모드 미리보기 — 서버 sync + 길드 단위 PvP.
// /dev 라우트 가드: production 빌드에선 dev/layout 이 통째로 404, auth.config 의 /dev public
// 예외와 함께 운영 격리. 본토 게임 라우팅에는 등장하지 않음.
//
// 동작에는 로그인 + 길드 가입 + DB 접근 가능한 env 필요.
// (DATABASE_URL, AUTH_SECRET, OAuth provider keys 등 — .env.development.local 셋업)
export default function FiefdomLivePreviewPage() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV · LIVE</strong> · 길드 영지 PvP (서버 sync).{" "}
        <code className="font-mono">/dev/fiefdom</code> 은 오프라인 demo, 여기는 실 길드/DB.
      </div>
      <FiefdomLiveView onBack={() => window.history.back()} />
    </div>
  );
}
