"use client";

import { useEffect } from "react";
import { installStaleBuildAutoReload } from "@/lib/staleBuild";

// root layout 마운트 시 자동 reload 핸들러 백업 설치.
// 1차 진입점인 instrumentation-client.ts 가 staging build/환경에서 누락되는 사고
// (2026-05-28 staging 사용자 "전투 입장 시 ChunkLoadError 자동 reload 안 됨") 대비.
// installStaleBuildAutoReload 는 idempotent — instrumentation-client 도 같이 호출.
export function StaleBuildAutoReload() {
  useEffect(() => {
    installStaleBuildAutoReload();
  }, []);
  return null;
}
