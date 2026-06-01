import Link from "next/link";

// dev 프리뷰 허브 — 로그인 없이 게이트-뒤 UI 를 시나리오별로 확인. production 에선 404(layout 가드).
const PREVIEWS: { href: string; title: string; desc: string }[] = [
  { href: "/dev/map-preview", title: "지도 — 권역 게이트 배너", desc: "#504 본토↔별빛 크로스맵 진입(잠금/해금/역방향). ?scenario=0~3 딥링크." },
  { href: "/dev/stance-picker", title: "전술 선택기 (StancePicker)", desc: "#497 공세/수성/처형 선택 UI." },
  { href: "/dev/battle-log", title: "전투 로그 — 전술 안내", desc: "#502 전투 시작 로그의 전술 한 줄 노출." },
  { href: "/dev/growth-shrine", title: "성장의 신전 — 리스펙 골드", desc: "#499 되돌리기 포인트 level×20 골드 비용." },
  { href: "/dev/fishing", title: "낚시터 — 반응 미니게임", desc: "낚시 PR-2 입질→챔질 반응 UI. 로컬 mock(서버 없이) 어획·어보 누적." },
  { href: "/dev/fishing-leaderboard", title: "주간 낚시 대회 — 종별 순위", desc: "낚시 PR-4 종별 top-10 + 본인 행. mock 데이터." },
  { href: "/dev/fishing-shop", title: "낚시 코인 상점 — 칭호 구매", desc: "낚시 PR-6 코인으로 칭호 구매. mock 코인/보유." },
  { href: "/dev/treasure", title: "보물 발굴 — 단서형 격자", desc: "보물 PR-3 지도 조각으로 발굴 지점 열고 뜨/차가움 단서로 매장지 추리. 로컬 mock(조각 15개)." },
];

export default function DevIndexPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
        <strong>DEV 프리뷰 허브</strong> — 로그인·DB 없이 게이트-뒤 UI 확인. 운영 빌드에선 404.
      </div>
      <ul className="space-y-2">
        {PREVIEWS.map((p) => (
          <li key={p.href}>
            <Link
              href={p.href}
              className="block rounded-lg border border-zinc-200 p-3 transition hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
            >
              <div className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">
                {p.title}
              </div>
              <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                {p.desc}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
