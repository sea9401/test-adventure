import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, lt, or } from "drizzle-orm";
import { getToken } from "next-auth/jwt";
import { headers } from "next/headers";
import { rawDb } from "@/db";
import { accountLinkIntents, accounts } from "@/db/schema";

export const ACCOUNT_LINK_INTENT_COOKIE = "account_link_intent";
export const ACCOUNT_LINK_INTENT_TTL_SECONDS = 5 * 60;

export type AccountLinkProvider = "kakao";

export function isAccountLinkProvider(
  value: unknown,
): value is AccountLinkProvider {
  return value === "kakao";
}

export function hashAccountLinkToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export async function createAccountLinkIntent(
  userId: string,
  provider: AccountLinkProvider,
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + ACCOUNT_LINK_INTENT_TTL_SECONDS * 1_000,
  );
  const database = rawDb();

  await database.transaction(async (tx) => {
    // 같은 사용자의 이전 의도와 만료 행을 함께 정리한다. 한 provider에 유효한 연결
    // 시도는 하나만 남겨 사용자가 여러 탭에서 잘못된 callback을 완료하지 않게 한다.
    await tx.delete(accountLinkIntents).where(
      or(
        lt(accountLinkIntents.expiresAt, now),
        and(
          eq(accountLinkIntents.userId, userId),
          eq(accountLinkIntents.provider, provider),
        ),
      ),
    );
    await tx.insert(accountLinkIntents).values({
      tokenHash: hashAccountLinkToken(token),
      userId,
      provider,
      expiresAt,
    });
  });

  return token;
}

export type ConsumedAccountLinkIntent = {
  userId: string;
  provider: AccountLinkProvider;
};

export async function consumeAccountLinkIntent(
  token: string,
  provider: string,
  currentUserId: string | null,
): Promise<ConsumedAccountLinkIntent | null> {
  if (!token || !isAccountLinkProvider(provider)) return null;

  // tokenHash만으로 원자적으로 삭제한다. provider/session이 틀린 요청도 의도를 소비해
  // 탈취되었거나 잘못 전달된 bearer token을 다시 시도할 수 없게 한다.
  const [intent] = await rawDb()
    .delete(accountLinkIntents)
    .where(eq(accountLinkIntents.tokenHash, hashAccountLinkToken(token)))
    .returning({
      userId: accountLinkIntents.userId,
      provider: accountLinkIntents.provider,
      expiresAt: accountLinkIntents.expiresAt,
    });

  if (
    !intent ||
    intent.expiresAt.getTime() <= Date.now() ||
    intent.provider !== provider ||
    intent.userId !== currentUserId ||
    !isAccountLinkProvider(intent.provider)
  ) {
    return null;
  }

  return { userId: intent.userId, provider: intent.provider };
}

// Auth.js signIn callback 안에서 auth()를 다시 호출하면 callback 재진입 위험이 있다.
// 대신 현재 요청의 Auth.js JWT를 같은 AUTH_SECRET으로 검증해 연결을 시작한 세션이
// OAuth callback까지 유지됐는지 확인한다.
export async function readCurrentAuthUserId(): Promise<string | null> {
  const secret = process.env.AUTH_SECRET?.trim();
  if (!secret) return null;

  const requestHeaders = await headers();
  const cookie = requestHeaders.get("cookie") ?? "";
  if (!cookie) return null;

  const secureCookie = cookie.includes("__Secure-authjs.session-token");
  const token = await getToken({
    req: { headers: new Headers({ cookie }) },
    secret,
    secureCookie,
  });

  return typeof token?.sub === "string" && token.sub.length > 0
    ? token.sub
    : null;
}

export type OAuthAccountForLink = {
  type: string;
  provider: string;
  providerAccountId: string;
  refresh_token?: string | null;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
};

export type OAuthAccountLinkResult =
  | "linked"
  | "already_owned"
  | "account_in_use"
  | "failed";

export async function linkOAuthAccountForIntent(
  intent: ConsumedAccountLinkIntent,
  account: OAuthAccountForLink,
): Promise<OAuthAccountLinkResult> {
  if (account.provider !== intent.provider) return "failed";

  const database = rawDb();
  const [existing] = await database
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(
      and(
        eq(accounts.provider, account.provider),
        eq(accounts.providerAccountId, account.providerAccountId),
      ),
    )
    .limit(1);

  if (existing?.userId === intent.userId) return "already_owned";
  // 계정 복구라는 명목으로도 다른 사용자의 provider 계정을 옮기지 않는다.
  if (existing) return "account_in_use";

  try {
    await database.insert(accounts).values({
      userId: intent.userId,
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
    return "linked";
  } catch {
    // 동일 provider 계정에 대한 경쟁 insert도 일반 로그인으로 폴백하지 않는다.
    return "failed";
  }
}
