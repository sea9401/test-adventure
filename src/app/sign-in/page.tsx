import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
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

  return <LandingContent authed={!!session?.user} />;
}
