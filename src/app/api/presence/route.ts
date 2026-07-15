import { gt, sql } from "drizzle-orm";
import { db } from "@/db";
import { presence } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { resolveActor } from "@/lib/server/resolveActor";
import { APP_BUILD_VERSION } from "@/lib/clientVersion";
import { clientIpFromRequest } from "@/lib/server/abuseLog";
import { recordSameIpPresenceSoon } from "@/lib/server/sameIpPresence";
import { requireActiveDeviceSession } from "@/lib/server/checkSession";

const ONLINE_WINDOW_SECONDS = 60;

export async function GET() {
  const userId = await ensureUser();
  if (!userId) return new Response("unauthorized", { status: 401 });

  const since = new Date(Date.now() - ONLINE_WINDOW_SECONDS * 1000);
  const rows = await db
    .select({
      userId: presence.userId,
      name: presence.name,
      className: presence.className,
      title: presence.title,
    })
    .from(presence)
    .where(gt(presence.lastSeenAt, since))
    .orderBy(presence.lastSeenAt);

  return Response.json(
    rows.map((r) => ({
      name: r.name,
      className: r.className,
      title: r.title,
      mine: r.userId === userId,
    })),
  );
}

export async function POST(req: Request) {
  // 하트비트는 비활성 기기에 명시적인 410을 내려 클라이언트가 즉시 로그아웃하게 한다.
  const userId = await ensureUser({ skipDeviceCheck: true });
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await requireActiveDeviceSession(userId, req);
  if (sessionFail) {
    // 배포 직전부터 열려 있던 구 클라이언트는 아직 HttpOnly 기기 쿠키가 없다.
    // 200 + buildVersion 으로 한 번 새 빌드로 갈아타게 하되, 새 클라이언트는 이 표식을
    // 보고 즉시 로그아웃한다. 게임 변경 API는 ensureUser 에서 이미 차단된다.
    if (sessionFail.status === 401) {
      return Response.json({
        buildVersion: APP_BUILD_VERSION,
        sessionInvalidated: true,
      });
    }
    return sessionFail;
  }

  // identity 는 서버 권위로 해석 — 클라가 보내는 body 는 무시 (사칭 방지).
  // 본 라우트는 다른 두 라우트(chat/bulletin)와 달리 본문이 비어도 동작해야 해
  // body 파싱 자체를 생략한다.
  const { name, className, title } = await resolveActor(userId);

  await db
    .insert(presence)
    .values({ userId, name, className, title })
    .onConflictDoUpdate({
      target: presence.userId,
      set: { name, className, title, lastSeenAt: sql`now()` },
    });

  const ip = clientIpFromRequest(req);
  if (ip) {
    recordSameIpPresenceSoon({ ip, userId, name });
  }

  // build version 동봉 — 옛 클라이언트가 새 deploy 후 이 응답으로 자기 버전과
  // 비교해 강제 reload. 30초 heartbeat 주기로 모든 활성 유저가 분 단위로 갱신됨.
  return Response.json({ buildVersion: APP_BUILD_VERSION });
}
