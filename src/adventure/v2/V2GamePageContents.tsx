"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SaveProvider } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { useProfile } from "@/adventure/profile/useProfile";
import { V2GameFlow } from "./V2GameFlow";

// client wrapper — SaveProvider 와 STARTER_SAVES 를 client 컨텍스트에서만 import.
// 루트 page.tsx (server component) 가 직접 STARTER_SAVES 를 import 하면 starterSaves 의
// dependency chain (useCharacterState.ts → useRemotePatch — client hook) 까지
// server build graph 에 끌려와 Turbopack 컴파일 에러 발생 (2026-05-28 staging 사고).
// 이 wrapper 가 client boundary 를 명시해 그 끌려옴을 차단한다.
export function V2GamePageContents() {
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <OnboardingGate>
        <V2GameFlow />
      </OnboardingGate>
    </SaveProvider>
  );
}

// 신규 유저(character-profile.v2 미설정 = useProfile.needsSetup)는 캐릭터 생성 페이지로
// 보낸다. SaveProvider 가 children 마운트 전에 hydrate 를 끝내므로 needsSetup 은 신뢰 가능.
// 생성 완료 후 / 로 돌아오면 프로필이 있어 needsSetup=false → 게임 렌더.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { needsSetup } = useProfile();
  const router = useRouter();
  useEffect(() => {
    if (needsSetup) router.replace("/create");
  }, [needsSetup, router]);
  if (needsSetup) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        캐릭터를 만드는 중…
      </div>
    );
  }
  return <>{children}</>;
}
