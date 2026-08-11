import { NextResponse } from "next/server";
import { db } from "@/db";
import {
  REFERRAL_COOKIE,
  REFERRAL_COOKIE_MAX_AGE,
  normalizeReferralCode,
  referralCodeIsActive,
  referralLandingUrl,
} from "@/lib/server/referrals";

// 공개 홍보 링크. 유효한 코드는 HttpOnly 쿠키에 30일 보관하고 대문으로 보낸다.
// 실제 귀속과 보상은 신규 캐릭터 생성 완료 시 profile/setup 트랜잭션에서 확정한다.
export async function GET(
  req: Request,
  ctx: { params: Promise<{ code: string }> },
) {
  const { code: rawCode } = await ctx.params;
  const code = normalizeReferralCode(rawCode);
  const valid = code ? await referralCodeIsActive(db, code) : false;
  const url = referralLandingUrl(req.url);
  const response = NextResponse.redirect(url);

  if (valid && code) {
    response.cookies.set(REFERRAL_COOKIE, code, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: REFERRAL_COOKIE_MAX_AGE,
      priority: "high",
    });
  } else {
    response.cookies.delete(REFERRAL_COOKIE);
  }
  return response;
}
