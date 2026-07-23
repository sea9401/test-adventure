import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq, gt, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { savesKv, presence } from "@/db/schema";
import { hasCompletedOnboarding } from "@/lib/server/profile";
import { LandingContent } from "./LandingContent";

export const metadata: Metadata = {
  title: "무슨무슨게임 — 웹 어드벤처 RPG",
  description:
    "전투 패턴을 설계하고 다양한 직업으로 성장하는 웹 RPG. 사냥·전직·생활·협동 보스·길드 영토전을 즐겨보세요.",
  alternates: { canonical: "/sign-in" },
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    siteName: "무슨무슨게임",
    title: "무슨무슨게임 — 웹 어드벤처 RPG",
    description:
      "전투 패턴을 설계하고 다양한 직업으로 성장하는 웹 RPG. 사냥·전직·생활·협동 보스·길드 영토전을 즐겨보세요.",
    url: "/sign-in",
    locale: "ko_KR",
    images: [
      {
        url: "/og-question-20260723.jpg",
        width: 1200,
        height: 630,
        alt: "무슨무슨게임",
      },
    ],
  },
};

// 대문(랜딩) 통계 — 총 모험가 수 + 최근 접속자 수.
// 비로그인 트래픽이 전부 도달하는 공개 페이지라, DB 가 느리거나 죽어도 페이지가 깨지지
// 않도록 try/catch 로 감싸 실패 시 0 을 돌려준다(0 이면 통계 줄을 숨김). 60초 캐시로
// 로그아웃 방문이 매번 DB 를 때리지 않게 한다.
const ONLINE_WINDOW_MS = 5 * 60 * 1000; // 최근 5분 = "접속 중"
const getLandingStats = unstable_cache(
  async () => {
    try {
      const since = new Date(Date.now() - ONLINE_WINDOW_MS);
      const [totalRow, onlineRow] = await Promise.all([
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(savesKv)
          .where(eq(savesKv.key, "character.v2")),
        db
          .select({ c: sql<number>`count(*)::int` })
          .from(presence)
          .where(gt(presence.lastSeenAt, since)),
      ]);
      return {
        total: totalRow[0]?.c ?? 0,
        online: onlineRow[0]?.c ?? 0,
      };
    } catch {
      return { total: 0, online: 0 };
    }
  },
  ["landing-stats"],
  { revalidate: 60 },
);

export default async function SignInPage() {
  // 대문을 모든 신규 진입의 최우선 화면으로 둔다(로그인/캐릭터 유무 무관).
  //  · 비로그인           → 로그인 버튼이 있는 대문.
  //  · 로그인 + 캐릭터 없음 → "시작하기"(→/create) CTA 가 있는 대문.
  //  · 로그인 + 캐릭터 있음 → 게임 홈(/)으로. (이미 만든 유저가 대문에 머무를 이유 없음.)
  // 캐릭터 유무 판정은 OnboardingGate(클라)의 needsOnboarding 과 같은 기준
  // (hasCompletedOnboarding)이라야 / ↔ /sign-in 무한 리다이렉트가 안 생긴다.
  const session = await auth();
  if (session?.user && (await hasCompletedOnboarding(session.user.id))) {
    redirect("/");
  }

  const { total, online } = await getLandingStats();

  return (
    <LandingContent
      total={total}
      online={online}
      authed={!!session?.user}
    />
  );
}
