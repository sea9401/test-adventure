"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { SaveProvider, useSavedValue } from "@/lib/storage/SaveProvider";
import { STARTER_SAVES } from "@/adventure/starterSaves";
import { useProfile } from "@/adventure/profile/useProfile";
import { parseV2Class } from "@/adventure/data/v2/classes";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { GameStateProvider } from "./GameStateProvider";
import { GameChrome } from "./GameChrome";

// 게임 라우트 그룹 (app/(game)) 의 클라이언트 경계.
// SaveProvider / STARTER_SAVES 등 client hook chain (useCharacterState → useRemotePatch)
// 을 여기 한 곳에서만 import 한다 — (game)/layout.tsx (server component) 가 이 모듈만
// 들여와 children 을 통과시키면, 페이지 모듈이 server build graph 로 끌려가 Turbopack
// 컴파일 에러 나는 것을 차단 (2026-05-28 staging 사고와 동일한 경계 규율).
//
// SaveProvider 는 하이드레이트가 끝날 때까지 로딩 화면을 띄우고, OnboardingGate 는
// 온보딩 미완료 유저를 대문(/sign-in)으로 보낸다. 둘 다 통과해야 GameStateProvider+chrome 마운트.
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

// 온보딩 미완료 유저는 대문(/sign-in)으로 보낸다 — 대문이 로그인 여부와 무관하게 모든
// 진입의 최우선 화면이고, 거기서 "시작하기"로 캐릭터 생성(/create)에 들어간다. (신규 유저는
// 카카오 로그인 직후 callbackUrl=/create 로 바로 생성에 가고, 이 게이트는 캐릭터 없이 게임
// 라우트로 들어온 복귀 유저를 대문으로 되돌리는 역할.) 완료 기준 = 프로필(이름) + 직업
// (class !== none) 둘 다. SaveProvider 가 children 마운트 전에 hydrate 를 끝내므로 신뢰 가능.
// /sign-in·/create 서버 게이트는 같은 기준(hasCompletedOnboarding)을 써 무한 리다이렉트를 막는다.
function OnboardingGate({ children }: { children: React.ReactNode }) {
  const { needsSetup } = useProfile();
  const char = useSavedValue("character.v2") as { class?: unknown } | null;
  // 코어루프 — 모든 유저가 모험가(none)로 시작하므로 class=none 은 미완료가 아니다. 완료 기준
  //   = 프로필(이름)만(속성 선택은 /create 흐름이 처리). off — 기존(프로필 + 직업 선택).
  const needsOnboarding =
    needsSetup ||
    (!V2_CORE_LOOP_V2 && parseV2Class(char?.class) === "none");
  const router = useRouter();
  useEffect(() => {
    if (needsOnboarding) router.replace("/sign-in");
  }, [needsOnboarding, router]);
  if (needsOnboarding) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-sm text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        잠시만요…
      </div>
    );
  }
  return <>{children}</>;
}
