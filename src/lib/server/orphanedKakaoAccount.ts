import "server-only";

import { and, eq } from "drizzle-orm";
import { rawDb } from "@/db";
import { accounts, passwordCredentials, users } from "@/db/schema";
import type { OAuthAccountForLink } from "@/lib/server/accountLinkIntent";
import { kakaoPlaceholderEmail } from "@/lib/server/kakaoOAuthProfile";

export type OrphanedKakaoRecoveryResult =
  | "not_applicable"
  | "recovered"
  | "already_linked"
  | "conflict"
  | "failed";

/**
 * Auth.js가 users 행을 만든 뒤 accounts 행 저장에 실패한 매우 좁은 경우만 복구한다.
 *
 * 일반 이메일 일치는 계정 탈취로 이어질 수 있어 절대 자동 병합하지 않는다. 카카오가
 * 이메일을 제공하지 않았을 때 우리가 providerAccountId로 직접 만든 플레이스홀더가
 * 정확히 일치하고, 기존 사용자에게 연결된 OAuth 계정이 하나도 없을 때만 허용한다.
 */
export async function recoverOrphanedKakaoAccount(
  profileEmail: unknown,
  account: OAuthAccountForLink,
): Promise<OrphanedKakaoRecoveryResult> {
  if (
    account.provider !== "kakao" ||
    typeof profileEmail !== "string" ||
    profileEmail !== kakaoPlaceholderEmail(account.providerAccountId)
  ) {
    return "not_applicable";
  }

  const database = rawDb();
  const [candidate] = await database
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, profileEmail))
    .limit(1);
  if (!candidate) return "not_applicable";

  const [claimedAccount] = await database
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, account.provider),
        eq(accounts.providerAccountId, account.providerAccountId),
      ),
    )
    .limit(1);
  if (claimedAccount) {
    return claimedAccount.userId === candidate.id
      ? "already_linked"
      : "conflict";
  }

  // 플레이스홀더가 일치하더라도 이미 다른 OAuth 연결이 있는 사용자는 명시적인
  // 계정 연결 절차를 거쳐야 한다. 여기서는 완전히 고아가 된 사용자만 복구한다.
  const [candidateAccount] = await database
    .select({ provider: accounts.provider })
    .from(accounts)
    .where(eq(accounts.userId, candidate.id))
    .limit(1);
  if (candidateAccount) return "conflict";

  // 운영자가 발급한 비밀번호 계정도 다른 인증 수단이므로 자동 연결하지 않는다.
  const [candidateCredential] = await database
    .select({ userId: passwordCredentials.userId })
    .from(passwordCredentials)
    .where(eq(passwordCredentials.userId, candidate.id))
    .limit(1);
  if (candidateCredential) return "conflict";

  try {
    await database.insert(accounts).values({
      userId: candidate.id,
      type: account.type,
      provider: account.provider,
      providerAccountId: account.providerAccountId,
      refresh_token: account.refresh_token ?? null,
      access_token: account.access_token ?? null,
      expires_at: account.expires_at ?? null,
      token_type: account.token_type ?? null,
      scope: account.scope ?? null,
      id_token: account.id_token ?? null,
      session_state: account.session_state ?? null,
    });
    return "recovered";
  } catch {
    // 같은 사용자의 동시 콜백이 먼저 복구를 마친 경우는 성공으로 간주한다.
    const [racedAccount] = await database
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(
        and(
          eq(accounts.provider, account.provider),
          eq(accounts.providerAccountId, account.providerAccountId),
        ),
      )
      .limit(1);
    return racedAccount?.userId === candidate.id ? "already_linked" : "failed";
  }
}
