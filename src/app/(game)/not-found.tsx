import Link from "next/link";

// 게임 라우트 그룹의 404 — 잘못된 거점 id / 던전 층 등 notFound() 호출 시.
// (game)/layout 안에서 렌더되므로 상단바·탭바 chrome 은 그대로 보인다.
export default function GameNotFound() {
  return (
    <main className="mx-auto w-full max-w-[720px] space-y-4 p-10 text-center text-zinc-900 dark:text-zinc-100">
      <h1 className="text-lg font-bold">길을 잃었습니다</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        존재하지 않는 곳입니다. 대륙 지도로 돌아가세요.
      </p>
      <Link
        href="/map"
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-700"
      >
        대륙 지도로
      </Link>
    </main>
  );
}
