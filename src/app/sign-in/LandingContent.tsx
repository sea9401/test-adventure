import Link from "next/link";
import { SignInButtons } from "./SignInButtons";

// 대문(랜딩)의 순수 표현 컴포넌트 — 통계는 props 로 주입한다.
// /sign-in (실데이터: auth + DB 카운트) 과 /dev/landing (mock 카운트) 가 공유해
// 로그인·DB 없이도 비주얼 QA 가 가능하다.
// 디자인 방향: 미니멀 프리미엄 — 니어블랙 + 오프화이트 + 골드 1포인트, 여백·타이포 위주.

const FEATURES = [
  {
    no: "01",
    title: "자동 전투, 전략은 설계",
    body: "스킬을 직접 누르지 않습니다. 전투 순서와 발동 조건을 미리 짜두면 전투는 알아서 굴러갑니다.",
  },
  {
    no: "02",
    title: "깊은 빌드 — 직업·전직·환생",
    body: "다양한 직업으로 전직하고 환생하며, 스탯·스킬·속성으로 나만의 캐릭터를 빚습니다.",
  },
  {
    no: "03",
    title: "다양한 즐길거리",
    body: "낚시, 보물 발굴, 협동 보스까지. 사냥 외에도 즐길 거리가 가득합니다.",
  },
  {
    no: "04",
    title: "길드 · 거점 전쟁",
    body: "길드를 세워 지도 위 거점을 점령하고, 영토를 두고 다른 길드와 겨룹니다.",
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
    <main className="relative min-h-screen overflow-hidden bg-[#0a0a0b] text-zinc-200">
      {/* 배경: 워드마크 뒤 미세한 따뜻한 글로우 + 가장자리 비네팅. 이미지 의존 없음. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(60rem 40rem at 50% 18%, rgba(201,169,106,0.10), transparent 60%), radial-gradient(100% 100% at 50% 0%, transparent 60%, rgba(0,0,0,0.6))",
        }}
      />

      <div className="relative mx-auto flex min-h-screen max-w-2xl flex-col px-6">
        {/* ── 히어로 ───────────────────────────────────────── */}
        <section className="flex flex-1 flex-col items-center justify-center py-24 text-center">
          <p className="text-[0.7rem] font-medium uppercase tracking-[0.4em] text-amber-200/60">
            웹 어드벤처 RPG
          </p>

          <h1 className="mt-6 text-5xl font-bold tracking-tight text-zinc-50 sm:text-6xl">
            무슨무슨게임
          </h1>

          {/* 골드 헤어라인 — 유일한 장식 포인트 */}
          <span className="mt-7 block h-px w-10 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

          <p className="mt-7 max-w-md text-base leading-loose text-zinc-400 sm:text-lg">
            전투는 자동, <span className="text-zinc-200">전략은 내 마음대로</span>.
            <br />
            키우는 재미가 끝이 없는 RPG.
          </p>

          <div className="mt-10 flex w-full flex-col items-center gap-3">
            <SignInButtons />
            <p className="text-xs text-zinc-600">
              소셜 계정으로 3초 만에 시작 · 별도 설치 없음
            </p>
          </div>

          {total > 0 && (
            <p className="mt-10 inline-flex items-center gap-2 text-xs text-zinc-500">
              {online > 0 && (
                <span
                  aria-hidden
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-300/80"
                />
              )}
              함께한 모험가 {total.toLocaleString("ko-KR")}명
              {online > 0 && (
                <span className="text-zinc-600">· 지금 {online}명 접속 중</span>
              )}
            </p>
          )}
        </section>

        {/* ── 무엇을 하게 되나 ──────────────────────────────── */}
        <section className="border-t border-white/5 py-20">
          <h2 className="text-center text-xs font-medium uppercase tracking-[0.3em] text-zinc-500">
            무엇을 하게 되나요
          </h2>

          <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.no} className="flex gap-4">
                <span className="select-none pt-0.5 font-mono text-sm text-amber-300/70">
                  {f.no}
                </span>
                <div>
                  <h3 className="text-[0.95rem] font-semibold text-zinc-100">
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-zinc-500">
                    {f.body}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 푸터 ─────────────────────────────────────────── */}
        <footer className="mt-auto flex flex-col items-center gap-3 border-t border-white/5 py-8 text-xs text-zinc-600 sm:flex-row sm:justify-between">
          <span className="font-medium tracking-wide text-zinc-500">
            무슨무슨게임
          </span>
          <nav className="flex items-center gap-5">
            <Link href="/manual" className="transition-colors hover:text-zinc-300">
              게임 가이드
            </Link>
            <a
              href="mailto:sea9401@gmail.com"
              className="transition-colors hover:text-zinc-300"
            >
              문의
            </a>
            <span>© 2026</span>
          </nav>
        </footer>
      </div>
    </main>
  );
}
