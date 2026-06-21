import Link from "next/link";

// dev 프리뷰 허브 — 로그인 없이 게이트-뒤 UI 를 시나리오별로 확인. production 에선 404(layout 가드).
const PREVIEWS: { href: string; title: string; desc: string }[] = [
  { href: "/dev/landing", title: "대문 — 로그인 전 랜딩 페이지", desc: "비로그인 방문자가 보는 /sign-in 대문(미니멀 프리미엄 · 히어로 + 기능 4 + 푸터). mock 통계(모험가 1284·접속 37)." },
  { href: "/dev/character-basics", title: "내 정보 — 기본 정보 카드", desc: "옛 직업 숙달 대체. 전투력 헤드라인 + 속성·소속 길드·전투 횟수·숙달 포인트. mock 변형." },
  { href: "/dev/job-ladder", title: "직업 사다리 — 전직 화면(flag-on)", desc: "V2JobLadder 렌더 확인. 잠긴 직업 숨김 + 직업별 해금 조건 표기. 성장중/기본해금/상위해금 3시나리오 mock." },
  { href: "/dev/job-codex", title: "직업 도감 — 수집 대시보드(A 메타 PR-1)", desc: "V2JobCodexView 렌더 확인. 4 직군 정복(cumLevel) 진행 + 직업 해금/패시브 수집 표기. mock(전사 정복·일부 수집)." },
  { href: "/dev/navbar", title: "메인 nav — 가장자리 페이드", desc: "6탭(…길드·광장)이 좁은 폭에서 넘칠 때 우측 페이드로 '더 있음' 신호. 320/360/390/720px 박스." },
  { href: "/dev/inventory", title: "인벤토리 — 보유 장비 카드 그리드", desc: "보유 장비 2열 카드(슬롯 아이콘·등급색 이름·위력/속성/티어·장착 배지). 카드 탭 → 상세·장착 팝오버. 표본 mock." },
  { href: "/dev/stance-picker", title: "전술 선택기 (StancePicker)", desc: "#497 공세/수성/처형 선택 UI." },
  { href: "/dev/battle-log", title: "전투 로그 — 전술 안내", desc: "#502 전투 시작 로그의 전술 한 줄 노출." },
  { href: "/dev/growth-shrine", title: "성장의 신전 — 리스펙 골드", desc: "#499 되돌리기 포인트 level×20 골드 비용." },
  { href: "/dev/fishing", title: "낚시터 — 반응 미니게임", desc: "낚시 PR-2 입질→챔질 반응 UI. 로컬 mock(서버 없이) 어획·어보 누적." },
  { href: "/dev/fishing-leaderboard", title: "주간 낚시 대회 — 종별 순위", desc: "낚시 PR-4 종별 top-10 + 본인 행. mock 데이터." },
  { href: "/dev/fishing-shop", title: "낚시 코인 상점 — 칭호 구매", desc: "낚시 PR-6 코인으로 칭호 구매. mock 코인/보유." },
  { href: "/dev/treasure", title: "보물 발굴 — 단서형 격자", desc: "보물 PR-3 지도 조각으로 발굴 지점 열고 뜨/차가움 단서로 매장지 추리. 로컬 mock(조각 15개)." },
  { href: "/dev/treasure-collection", title: "발굴 보관함 — 골동품 목록", desc: "보물 PR-4/6 골동품 감정가순 목록 + 분해(코인). mock 데이터." },
  { href: "/dev/treasure-shop", title: "발굴 코인 상점 — 칭호 구매", desc: "보물 PR-6 발굴 코인으로 칭호 구매. mock 코인 500." },
  { href: "/dev/treasure-leaderboard", title: "주간 발굴가치 대회 — 순위", desc: "보물 PR-7 이번 주 발굴가치 top-10 + 본인 행. mock 데이터." },
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
