// 헬스 체크 — 외부 업타임 모니터(UptimeRobot 등)가 https://msmsge.com/api/health 를 폴링.
// 단순 "앱 떠 있음"이 아니라 DB 핑까지 확인해 "앱은 살아있지만 DB가 죽은" 상태도 잡는다
//   (과거 사고: 초기화 시 migrate 0-테이블 / RDS 단절 — 옛 헬스는 그래도 200을 줬다).
// 건강하면 200{ok:true}, DB 핑 실패/지연이면 503 → 모니터가 다운으로 보고 알림.
// 가볍게 — SELECT 1 + 3초 타임아웃. 인증 불필요(middleware PUBLIC_PATHS 등록).
import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic"; // 캐시 금지 — 매 폴링이 실제 상태를 보게.

const DB_PING_TIMEOUT_MS = 3000;

export async function GET() {
  const started = Date.now();
  try {
    await Promise.race([
      db.execute(sql`select 1`),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error(`db ping timeout >${DB_PING_TIMEOUT_MS}ms`)),
          DB_PING_TIMEOUT_MS,
        ),
      ),
    ]);
    return Response.json({
      ok: true,
      db: "ok",
      ms: Date.now() - started,
      time: Date.now(),
    });
  } catch (e) {
    return Response.json(
      {
        ok: false,
        db: "fail",
        error: e instanceof Error ? e.message : String(e),
        time: Date.now(),
      },
      { status: 503 },
    );
  }
}
