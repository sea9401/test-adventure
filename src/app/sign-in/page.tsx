import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { eq, gt, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { db } from "@/db";
import { savesKv, presence } from "@/db/schema";
import { LandingContent } from "./LandingContent";

export const metadata: Metadata = {
  title: "무슨무슨게임 — 방치형 웹 RPG",
  description:
    "누르는 대신 판단의 순서를 짜는 방치형 웹 RPG. 접속하지 않아도 모험가는 싸우고 성장합니다. 브라우저에서 3초 만에 시작하세요.",
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
  // 이미 로그인된 상태에서 뒤로가기 등으로 이 페이지에 들어오면 홈으로 보낸다.
  // (그대로 두면 다른 공급자 버튼을 눌러 의도치 않게 별도 계정으로 갈아타게 됨 —
  //  계정 추가는 설정 메뉴의 "연동하기"를 통해서만.)
  const session = await auth();
  if (session?.user) redirect("/");

  const { total, online } = await getLandingStats();

  return <LandingContent total={total} online={online} />;
}
