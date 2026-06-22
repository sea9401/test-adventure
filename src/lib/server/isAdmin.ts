import { auth } from "@/auth";

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  return new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

/** 관리자 이메일 리스트 (소문자). 랭킹 등 admin 제외 SQL 필터 합성에 사용. */
export function getAdminEmailsList(): string[] {
  return Array.from(getAdminEmails());
}

export async function isCurrentUserAdmin(): Promise<boolean> {
  const allow = getAdminEmails();
  if (allow.size === 0) return false;
  const session = await auth();
  if (!session?.user?.email) return false;
  return allow.has(session.user.email.toLowerCase());
}

export async function requireAdmin(): Promise<Response | null> {
  const session = await auth();
  if (!session?.user?.id) return new Response("unauthorized", { status: 401 });
  const ok = await isCurrentUserAdmin();
  if (!ok) return new Response("forbidden", { status: 403 });
  return null;
}

/** 현재 관리자 이메일(소문자). 감사 로그 기록용 — requireAdmin 통과 후 호출. */
export async function currentAdminEmail(): Promise<string> {
  const session = await auth();
  return session?.user?.email?.toLowerCase() ?? "unknown";
}
