import Link from "next/link";
import { SignInButtons } from "./SignInButtons";

// 대문(랜딩)의 순수 표현 컴포넌트.
// /sign-in 과 /dev/landing 이 공유해 로그인·DB 없이도 비주얼 QA 가 가능하다.
// 디자인 방향: 미니멀 프리미엄 — 니어블랙 + 오프화이트 + 골드 1포인트, 여백·타이포 위주.

const FEATURES = [
  {
    no: "01",
    title: "자동 전투, 패턴은 직접",
    body: "HP·MP·턴·상태에 맞춰 스킬 우선순위를 짜두면, 캐릭터가 설계한 패턴대로 싸웁니다.",
  },
  {
    no: "02",
    title: "모험가에서 시작하는 직업 성장",
    body: "사냥으로 스탯과 숙련도를 쌓아 직업을 열고, 전직과 환생을 거듭하며 배운 스킬과 성장을 이어갑니다.",
  },
  {
    no: "03",
    title: "사냥 밖에서도 이어지는 성장",
    body: "낚시·벌목·채광·농장부터 숙련의 탑과 협동 보스까지, 저마다의 보상과 성장 목표가 있습니다.",
  },
  {
    no: "04",
    title: "함께 키우는 길드와 제작",
    body: "길드원과 시설을 키우고, 장비 제작과 공동 임무를 함께하며 길드만의 성장을 쌓아 갑니다.",
  },
];

export function LandingContent({
  authed = false,
  referralStatus = null,
  authError = null,
}: {
  // 로그인은 됐지만 아직 캐릭터가 없는 유저 — 로그인 버튼 대신 "시작하기"(→/create) 노출.
  authed?: boolean;
  referralStatus?: "accepted" | "invalid" | null;
  authError?: "account-not-linked" | "login-failed" | null;
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

          <h1 className="mt-6 text-4xl font-bold tracking-tight text-zinc-50 sm:text-7xl">
            무슨무슨게임
          </h1>

          {/* 골드 헤어라인 — 유일한 장식 포인트 */}
          <span className="mt-7 block h-px w-10 bg-gradient-to-r from-transparent via-amber-300/70 to-transparent" />

          <p className="mt-7 max-w-md text-base leading-loose text-zinc-400 sm:text-lg">
            전투는 자동, <span className="text-zinc-200">전략은 내 마음대로</span>.
            <br />
            모험가에서 시작해 수많은 직업을 열어 가는 RPG.
          </p>

          <div className="mt-10 flex w-full flex-col items-center gap-3">
            {authError && (
              <p
                role="alert"
                className="w-full max-w-xs rounded-lg border border-rose-300/30 bg-zinc-950 px-4 py-3 text-sm leading-relaxed text-rose-200"
              >
                {authError === "account-not-linked"
                  ? "기존 계정과 카카오 로그인을 연결하지 못했습니다. 같은 화면이 반복되면 인게임 닉네임과 함께 운영자에게 문의해 주세요."
                  : "로그인을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요."}
              </p>
            )}
            {referralStatus && (
              <p
                role="status"
                className={`w-full max-w-xs rounded-lg border px-4 py-3 text-sm leading-relaxed ${
                  referralStatus === "accepted"
                    ? "border-amber-300/40 bg-amber-300/10 text-amber-100"
                    : "border-rose-300/30 bg-rose-300/10 text-rose-200"
                }`}
              >
                {referralStatus === "accepted"
                  ? "홍보 링크가 적용되었습니다. 새 캐릭터를 만들면 홍보자에게 보상이 지급됩니다."
                  : "유효하지 않거나 종료된 홍보 링크입니다."}
              </p>
            )}
            {authed ? (
              <>
                <Link
                  href="/create"
                  className="flex w-full max-w-xs items-center justify-center rounded-lg bg-amber-300 px-4 py-3 text-sm font-semibold text-zinc-900 shadow-sm transition-colors hover:bg-amber-200"
                >
                  캐릭터 만들고 시작하기
                </Link>
                <div className="flex w-full max-w-xs items-center gap-3 py-1 text-[11px] text-zinc-600">
                  <span className="h-px flex-1 bg-white/10" />
                  기존 계정으로 로그인
                  <span className="h-px flex-1 bg-white/10" />
                </div>
                <SignInButtons />
              </>
            ) : (
              <SignInButtons />
            )}
            <p className="text-xs text-zinc-600">
              {authed
                ? "새 캐릭터를 만들거나 기존 계정으로 로그인할 수 있습니다"
                : "소셜 계정으로 간편하게 시작 · 별도 설치 없음"}
            </p>
            <p className="max-w-sm text-[11px] leading-5 text-zinc-600">
              로그인하면 <Link href="/terms" className="underline underline-offset-2 hover:text-zinc-400">이용약관</Link>과{" "}
              <Link href="/privacy" className="underline underline-offset-2 hover:text-zinc-400">개인정보처리방침</Link>에 동의한 것으로 봅니다.
            </p>
          </div>

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
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
            <Link href="/manual" className="transition-colors hover:text-zinc-300">
              게임 가이드
            </Link>
            <Link href="/terms" className="transition-colors hover:text-zinc-300">
              이용약관
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-zinc-300">
              개인정보처리방침
            </Link>
            <Link href="/operations" className="transition-colors hover:text-zinc-300">
              운영정책
            </Link>
            <Link href="/licenses" className="transition-colors hover:text-zinc-300">
              오픈소스 고지
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
