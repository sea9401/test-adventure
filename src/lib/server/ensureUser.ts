import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  DEVICE_SESSION_COOKIE,
  isValidDeviceSessionId,
} from "@/lib/deviceSessionConfig";
import { readAdminImpersonationFor } from "@/lib/server/adminImpersonation";

// API 라우트 진입 시 호출 — Auth.js 세션에서 userId 반환.
// 비인증 + stale JWT(=DB 와 어긋난 session.user.id) 둘 다 null 로 응답 → 호출 측은 401.
// OAuth 신규 사용자는 Auth.js adapter가 callback 안에서 users 행을 먼저 만든다. 여기서
// JWT의 subject만 믿고 누락 행을 다시 만들면 회원 탈퇴 직후 남은/동시 요청이 빈 계정을
// 부활시킬 수 있으므로, 게임 API는 이미 존재하는 users 행만 받아들인다.
async function ensureOriginalUserContext(): Promise<{
  id: string;
  email: string | null;
  activeSessionId: string | null;
} | null> {
  const session = await auth();
  if (!session?.user?.id) return null;

  // 제재(밴/정지) enforcement — 차단 중이면 null 반환(=호출 측 401). 모든 게임 API 가 이
  // 단일 지점을 거치므로 여기 한 곳으로 전면 차단된다. (PK 읽기라 비용 미미.)
  //   ⚠️ 현재는 401 → 클라가 "세션 만료" 화면을 띄움(전용 밴 안내 화면은 후속). 차단 자체는
  //      확실(밴 유저는 어떤 게임 행동도 불가). 관리자 페이지(requireAdmin)는 이 경로와 무관.
  const [row] = await db
    .select({
      id: users.id,
      bannedUntil: users.bannedUntil,
      activeSessionId: users.activeSessionId,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row) return null;
  if (row?.bannedUntil && row.bannedUntil.getTime() > Date.now()) {
    return null;
  }

  return {
    id: session.user.id,
    email: session.user.email ?? null,
    activeSessionId: row?.activeSessionId ?? null,
  };
}

/** 계정 삭제·OAuth·단일 세션 같은 보안 기능이 사용할 원래 로그인 유저. */
export async function ensureOriginalUser(): Promise<string | null> {
  return (await ensureOriginalUserContext())?.id ?? null;
}

export async function ensureUser(options?: {
  // checkSession 이 직접 410을 반환해야 하는 기존 라우트에서만 사용한다.
  skipDeviceCheck?: boolean;
}): Promise<string | null> {
  const original = await ensureOriginalUserContext();
  if (!original) return null;

  if (!options?.skipDeviceCheck) {
    const incoming = (await cookies()).get(DEVICE_SESSION_COOKIE)?.value;
    if (
      !isValidDeviceSessionId(incoming) ||
      original.activeSessionId === null ||
      original.activeSessionId !== incoming
    ) {
      return null;
    }
  }

  const impersonation = await readAdminImpersonationFor(
    original.id,
    original.email,
  );
  if (!impersonation) return original.id;

  // 서명 쿠키가 유효해도 대상 계정이 삭제됐으면 원래 관리자로
  // 조용히 폴백하지 않는다. 폴백하면 대상에게 쓸 요청이 관리자
  // 자신의 세이브에 적용될 수 있다.
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, impersonation.targetUserId))
    .limit(1);
  return target?.id ?? null;
}
