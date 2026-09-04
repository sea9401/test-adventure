import type { Metadata } from "next";
import Link from "next/link";
import { GameInfoReturnControl } from "@/components/GameInfoReturnControl";
import { GameRatingInformation } from "@/components/GameRatingInformation";
import { PageShell } from "@/components/ui/PageShell";

export const metadata: Metadata = {
  title: "게임 등급정보 — 무슨무슨게임",
  description: "무슨무슨게임의 이용등급과 내용정보를 확인합니다.",
  alternates: { canonical: "/game-info" },
};

type GameInfoPageProps = {
  searchParams: Promise<{ from?: string | string[] }>;
};

export default async function GameInfoPage({ searchParams }: GameInfoPageProps) {
  const { from } = await searchParams;
  const openedFromGame = from === "game";

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <PageShell className="max-w-3xl py-8">
        <nav aria-label="페이지 이동">
          {openedFromGame ? (
            <GameInfoReturnControl />
          ) : (
            <Link
              href="/"
              className="inline-flex min-h-11 items-center font-semibold text-amber-700 underline underline-offset-4 dark:text-amber-300"
            >
              무슨무슨게임으로 돌아가기
            </Link>
          )}
        </nav>
        <GameRatingInformation />
      </PageShell>
    </div>
  );
}
