import { GameClientBoundary } from "@/adventure/v2/GameClientBoundary";

// 게임 라우트 그룹 공유 레이아웃 (server component).
// 클라이언트 경계는 GameClientBoundary 가 명시 — 여기서 SaveProvider/STARTER_SAVES 등을
// 직접 import 하지 않는다 (client hook chain 의 server graph 끌려옴 차단).
// 이 레이아웃은 그룹 내 네비게이션에서 remount 되지 않으므로, 그 안의 GameStateProvider
// 상태(HP·스태미나·거점 등)와 단발 fetch 가 페이지 전환에도 유지된다.
export default function GameLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <GameClientBoundary>{children}</GameClientBoundary>;
}
