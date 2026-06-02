"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SaveProvider, useSavedValue } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { useProfile } from "@/adventure/profile/useProfile";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { GameStateProvider } from "./GameStateProvider";
import { GameChrome } from "./GameChrome";

// 게임 라우트 그룹 (app/(game)) 의 클라이언트 경계.
// SaveProvider / STARTER_SAVES 등 client hook chain (useCharacterState → useRemotePatch)
// 을 여기 한 곳에서만 import 한다 — (game)/layout.tsx (server component) 가 이 모듈만
// 들여와 children 을 통과시키면, 페이지 모듈이 server build graph 로 끌려가 Turbopack
// 컴파일 에러 나는 것을 차단 (2026-05-28 staging 사고와 동일한 경계 규율).
//
// SaveProvider 는 하이드레이트가 끝날 때까지 로딩 화면을 띄우고, OnboardingGate 는
// 온보딩 미완료 유저를 /create 로 보낸다. 둘 다 통과해야 GameStateProvider+chrome 마운트.
export function GameClientBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SaveProvider starters={STARTER_SAVES}>
      <OnboardingGate>
        <GameStateProvider>
          <GameChrome>{children}</GameChrome>
        </GameStateProvider>
      </OnboardingGate>
    </SaveProvider>
  );
}

// 온보딩 미완료 유저는 캐릭터 생성 페이지로 보낸다. 완료 기준 = 프로필(이름) +
// 직업(class !== none) 둘 다. SaveProvider 가 children 마운트 전에 hydrate 를 끝내므로
// 신뢰 가능. 생성 완료 후 게임 라우트로 돌아오면 프로필+직업이 있어 게임 렌더.
// (예전엔 V2GamePageContents 안에 있었고, 라우트 그룹 전환으로 모든 (game) 경로를 게이트.)
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
