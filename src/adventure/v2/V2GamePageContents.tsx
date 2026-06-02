"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SaveProvider, useSavedValue } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { useProfile } from "@/adventure/profile/useProfile";
import { parseV2Class } from "@/adventure/data/v2/classes";
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

// 온보딩 미완료 유저는 캐릭터 생성 페이지로 보낸다. 완료 기준 = 프로필(이름) +
// 직업(class !== none) 둘 다 (B1 수정 — 이름만 만들고 직업 미선택 상태로 게임 진입 차단).
// SaveProvider 가 children 마운트 전에 hydrate 를 끝내므로 신뢰 가능. 생성 완료 후 / 로
// 돌아오면 프로필+직업이 있어 게임 렌더.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { needsSetup } = useProfile();
  const char = useSavedValue("character.v2") as { class?: unknown } | null;
  const needsOnboarding = needsSetup || parseV2Class(char?.class) === "none";
  const router = useRouter();
  useEffect(() => {
    if (needsOnboarding) router.replace("/create");
  }, [needsOnboarding, router]);
  if (needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        캐릭터를 만드는 중…
      </div>
    );
  }
  return <>{children}</>;
}
