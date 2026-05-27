"use client";

import { SaveProvider } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { V2GameFlow } from "./V2GameFlow";

// client wrapper — SaveProvider 와 STARTER_SAVES 를 client 컨텍스트에서만 import.
// page.tsx (server component) 가 직접 STARTER_SAVES 를 import 하면 starterSaves 의
// dependency chain (useCharacterState.ts → useRemotePatch — client hook) 까지
// server build graph 에 끌려와 Turbopack 컴파일 에러 발생 (2026-05-28 staging 사고).
// server-only env 가드 (NODE_ENV/IS_STAGING) 는 page.tsx 에서 유지하고, 이 wrapper
// 가 client boundary 를 명시한다.
export function V2GamePageContents() {
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <V2GameFlow />
    </SaveProvider>
  );
}
