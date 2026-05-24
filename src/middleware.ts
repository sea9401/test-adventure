import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";
import { NextResponse } from "next/server";

const { auth } = NextAuth(authConfig);

// Staging 게이트가 닫혀 있을 때도 통과시킬 경로.
// /staging-closed 자체와 health-check 만 허용 — 정적 자원은 middleware matcher 에서 이미 제외.
const STAGING_ALLOW = new Set<string>(["/staging-closed", "/api/health"]);

export default auth((req) => {
  // IS_STAGING=true 인 환경에서만 게이트 작동. STAGING_OPEN=true 면 통과(테스트 기간).
  // prod 에선 IS_STAGING 미설정이라 항상 우회.
  if (
    process.env.IS_STAGING === "true" &&
    process.env.STAGING_OPEN !== "true"
  ) {
    const { pathname } = req.nextUrl;
    if (!STAGING_ALLOW.has(pathname)) {
      // `new URL(path, req.url)` 로 같은 origin 유지. req.nextUrl.clone() 은
      // 환경에 따라 host 가 외부값(AUTH_URL 등)으로 잡혀 Next 가 외부 proxy 시도함.
      return NextResponse.rewrite(new URL("/staging-closed", req.url));
    }
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
