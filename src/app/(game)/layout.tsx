import type { Metadata } from "next";
import { GameClientBoundary } from "@/adventure/v2/GameClientBoundary";
import { redirect } from "next/navigation";
import { hasValidAgeEligibilityCookie } from "@/lib/server/ageEligibility";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// 게임 라우트 그룹 공유 레이아웃 (server component).
// 클라이언트 경계는 GameClientBoundary 가 명시 — 여기서 SaveProvider/STARTER_SAVES 등을
// 직접 import 하지 않는다 (client hook chain 의 server graph 끌려옴 차단).
// 이 레이아웃은 그룹 내 네비게이션에서 remount 되지 않으므로, 그 안의 GameStateProvider
// 상태(HP·스태미나·거점 등)와 단발 fetch 가 페이지 전환에도 유지된다.
export default async function GameLayout({
  children,
  battleLog,
}: {
  children: React.ReactNode;
  battleLog?: React.ReactNode;
}) {
  if (!(await hasValidAgeEligibilityCookie())) {
    redirect("/sign-in?age=required");
  }

  return (
    <GameClientBoundary>
      {children}
      {battleLog}
    </GameClientBoundary>
  );
}
