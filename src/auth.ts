import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { and, eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { rawDb } from "@/db";
import {
  users,
  accounts,
  sessions,
  verificationTokens,
} from "@/db/schema";
import { authConfig } from "@/auth.config";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
    };
  }
}

// lazy 초기화: 팩토리는 요청 시점에 호출되므로 DrizzleAdapter(rawDb()) 가
// 모듈 평가(빌드 타임 page-data 수집)가 아니라 첫 요청 때 DB 에 연결한다.
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  ...authConfig,
  // DrizzleAdapter 가 기대하는 테이블 타입이 우리 스키마 테이블과 정확히 맞지 않아 캐스트가
  // 필요하다(NextAuth + Drizzle 의 알려진 타입 불일치). 런타임은 정상 — 타입만 우회.
  adapter: DrizzleAdapter(rawDb(), {
    /* eslint-disable @typescript-eslint/no-explicit-any */
    usersTable: users as any,
    accountsTable: accounts as any,
    sessionsTable: sessions as any,
    verificationTokensTable: verificationTokens as any,
    /* eslint-enable @typescript-eslint/no-explicit-any */
  }),
  session: { strategy: "jwt" as const },
  providers: [
    // allowDangerousEmailAccountLinking: 같은 이메일로 복수 공급자 연동 허용.
    Google({
      allowDangerousEmailAccountLinking: true,
    }),
    Kakao({
      allowDangerousEmailAccountLinking: true,
      // 카카오 이메일 권한이 잠겨 있을 때(사업자 미등록) ID 기반 플레이스홀더 이메일 사용.
      // kakao_<id>@kakao.oauth 형태 — 같은 카카오 계정이면 항상 동일 이메일 생성.
      profile(profile) {
        const kakaoAccount = profile.kakao_account as {
          email?: string;
          profile?: { nickname?: string; profile_image_url?: string };
        } | undefined;
        return {
          id: String(profile.id),
          name: kakaoAccount?.profile?.nickname ?? null,
          email: kakaoAccount?.email ?? `kakao_${profile.id}@kakao.oauth`,
          image: kakaoAccount?.profile?.profile_image_url ?? null,
        };
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (!account) return true;

      const cookieStore = await cookies();
      const linkUserId = cookieStore.get("link_user_id")?.value;
      if (!linkUserId) return true;

      // 연동 의도는 1회용 — 읽는 즉시 쿠키를 소비(만료)한다. 그대로 두면 maxAge(/api/auth/link
      // 에서 300s) 동안 이후의 모든 OAuth 콜백이 연동 모드로 빨려들어, 그 창에 다른 카카오 계정
      // 으로 로그인하면 엉뚱한 유저(linkUserId)에 묶이거나(심지어 타 유저 계정 강제 재연동) 한다.
      // 여기서 지우면 직후의 의도된 콜백 1회에만 적용되고, 아래 모든 분기/조기반환이 자동으로 안전.
      // (signIn 콜백은 /api/auth/[...nextauth] 라우트 핸들러 안 — .set 으로 쓰기 가능.)
      // .delete 대신 maxAge:0 set — set 한 경로(path "/")와 일치시켜 Set-Cookie 만료가 확실히 나가게.
      cookieStore.set("link_user_id", "", { maxAge: 0, path: "/" });

      // 연동 모드: 이 OAuth 계정이 이미 accounts 테이블에 있는지 확인.
      const [existing] = await rawDb()
        .select({ userId: accounts.userId })
        .from(accounts)
        .where(
          and(
            eq(accounts.provider, account.provider),
            eq(accounts.providerAccountId, account.providerAccountId),
          ),
        )
        .limit(1);

      if (existing?.userId === linkUserId) {
        // 이미 이 유저에 연동된 계정 → 일반 로그인으로 진행
        return true;
      }

      const accountValues = {
        userId: linkUserId,
        type: account.type,
        provider: account.provider,
        providerAccountId: account.providerAccountId,
        refresh_token: (account.refresh_token as string | undefined) ?? null,
        access_token: (account.access_token as string | undefined) ?? null,
        expires_at: (account.expires_at as number | undefined) ?? null,
        token_type: (account.token_type as string | undefined) ?? null,
        scope: (account.scope as string | undefined) ?? null,
        id_token: (account.id_token as string | undefined) ?? null,
        session_state: (account.session_state as string | undefined) ?? null,
      };

      try {
        if (existing) {
          // 다른 유저에 연동된 계정 → 강제 재연동 (실수로 별도 계정을 만든 경우)
          await rawDb()
            .update(accounts)
            .set({ userId: linkUserId })
            .where(
              and(
                eq(accounts.provider, account.provider),
                eq(accounts.providerAccountId, account.providerAccountId),
              ),
            );
        } else {
          // 미연동 계정 → 새로 연결
          await rawDb().insert(accounts).values(accountValues);
        }
        return "/?linked=" + account.provider;
      } catch {
        return true;
      }
    },
    jwt({ token, user }) {
      if (user?.id) token.sub = user.id;
      return token;
    },
    session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      return session;
    },
  },
}));
