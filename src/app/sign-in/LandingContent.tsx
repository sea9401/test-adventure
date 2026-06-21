import Link from "next/link";
import { SignInButtons } from "./SignInButtons";

// 대문(랜딩)의 순수 표현 컴포넌트 — 통계는 props 로 주입한다.
// /sign-in (실데이터: auth + DB 카운트) 과 /dev/landing (mock 카운트) 가 공유해
// 로그인·DB 없이도 비주얼 QA 가 가능하다.

const FEATURES = [
  {
    icon: "🕒",
    title: "오프라인 자동 전투",
    body: "접속하지 않아도 모험가는 싸우고 성장합니다. 돌아오면 그동안 쌓인 전리품과 경험치가 기다리고 있어요.",
  },
  {
    icon: "♟️",
    title: "전투 패턴 — 누르지 않고, 설계한다",
    body: "스킬을 직접 연타하지 않습니다. “이럴 땐 이걸 써라” 판단의 순서를 미리 짜두면, 전투는 알아서 굴러갑니다.",
  },
  {
    icon: "🎲",
    title: "아이템 굴림 & 재련",
    body: "같은 장비도 굴림에 따라 능력치가 달라지고, 재련으로 한 번 더 다듬습니다. 세상에 하나뿐인 내 무기를 만드세요.",
  },
  {
    icon: "⚔️",
    title: "직업 · 길드 · 거점 전쟁",
    body: "13개 직업으로 전직하고 환생하며, 길드를 세워 지도 위 거점을 점령하세요. 영토를 두고 다른 길드와 겨룹니다.",
  },
];

export function LandingContent({
  total,
  online,
}: {
  total: number;
  online: number;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-b from-zinc-950 via-zinc-950 to-zinc-900 text-zinc-100">
      {/* ── 히어로 ─────────────────────────────────────────────── */}
      <section className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
        {/* 은은한 배경 글로우 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-amber-500/10 blur-3xl"
        />
        <div className="relative flex max-w-xl flex-col items-center gap-6">
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-3 py-1 text-xs font-medium tracking-wide text-amber-300">
            방치형 웹 RPG
          </span>

          <h1 className="bg-gradient-to-b from-amber-100 to-amber-400 bg-clip-text text-5xl font-black tracking-tight text-transparent sm:text-6xl">
            무슨무슨게임
          </h1>

          <p className="text-lg leading-relaxed text-zinc-300 sm:text-xl">
            누르는 대신, <strong className="text-amber-200">판단의 순서</strong>를
            짭니다.
            <br />
            접속하지 않아도 멈추지 않는 모험.
          </p>

          {total > 0 && (
            <p className="text-sm text-zinc-400">
              지금까지{" "}
              <strong className="text-zinc-100">
                {total.toLocaleString("ko-KR")}명
              </strong>
              의 모험가가 함께했어요
              {online > 0 && (
                <>
                  {" · "}
                  <span className="inline-flex items-center gap-1.5 text-emerald-400">
                    <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                    {online}명 접속 중
                  </span>
                </>
              )}
            </p>
          )}

          <div className="mt-2 flex w-full flex-col items-center gap-3">
            <SignInButtons />
            <p className="text-xs text-zinc-500">
              소셜 계정으로 3초 만에 시작 · 별도 설치 없음
            </p>
          </div>

          <Link
            href="#features"
            className="mt-6 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
          >
            어떤 게임인지 보기 ↓
          </Link>
        </div>
      </section>

      {/* ── 시스템 소개 ───────────────────────────────────────── */}
      <section
        id="features"
        className="mx-auto max-w-4xl scroll-mt-8 px-6 py-20"
      >
        <h2 className="text-center text-2xl font-bold text-zinc-100 sm:text-3xl">
          짧게 즐기고, 깊게 파고든다
        </h2>
        <p className="mt-3 text-center text-sm text-zinc-400">
          하루 몇 분이면 충분하지만, 파고들면 끝이 없는 빌드의 깊이.
        </p>

        <div className="mt-12 grid gap-4 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-zinc-800 bg-zinc-900/60 p-6 transition-colors hover:border-amber-400/40 hover:bg-zinc-900"
            >
              <div className="text-2xl" aria-hidden>
                {f.icon}
              </div>
              <h3 className="mt-3 text-base font-semibold text-zinc-100">
                {f.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                {f.body}
              </p>
            </div>
          ))}
        </div>

        {/* 하단 CTA */}
        <div className="mt-14 flex flex-col items-center gap-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 px-6 py-10 text-center">
          <h3 className="text-xl font-bold text-zinc-100">
            지금 바로 모험을 시작하세요
          </h3>
          <p className="text-sm text-zinc-400">
            가입은 무료, 진행 상황은 계정에 자동 저장됩니다.
          </p>
          <div className="mt-2">
            <SignInButtons />
          </div>
        </div>
      </section>

      {/* ── 푸터 ─────────────────────────────────────────────── */}
      <footer className="border-t border-zinc-800/80 px-6 py-10">
        <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center text-xs text-zinc-500 sm:flex-row sm:justify-between sm:text-left">
          <p className="font-semibold text-zinc-400">무슨무슨게임</p>
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link
              href="/manual"
              className="transition-colors hover:text-zinc-300"
            >
              게임 가이드
            </Link>
            <a
              href="mailto:sea9401@gmail.com"
              className="transition-colors hover:text-zinc-300"
            >
              문의
            </a>
          </nav>
          <p>© 2026 무슨무슨게임</p>
        </div>
      </footer>
    </main>
  );
}
