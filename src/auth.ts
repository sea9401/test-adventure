import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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
import { DEVICE_SESSION_TAKEOVER_COOKIE } from "@/lib/deviceSessionConfig";
import {
  matchesReviewLoginCredentials,
  readReviewLoginConfig,
  reviewLoginThrottle,
} from "@/lib/server/reviewLogin";

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
    Credentials({
      id: "review-credentials",
      name: "아이디·비밀번호",
      credentials: {
        loginId: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials, request) {
        const config = readReviewLoginConfig();
        if (!config) return null;

        const clientKey =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",").at(-1) ??
          "unknown";
        if (!reviewLoginThrottle.canAttempt(clientKey)) return null;

        if (
          !matchesReviewLoginCredentials(
            {
              loginId: credentials.loginId,
              password: credentials.password,
            },
            config,
          )
        ) {
          reviewLoginThrottle.recordFailure(clientKey);
          return null;
        }

        // 심사용 자격 증명은 사용자를 만들지 않는다. 카카오 계정이 이미 연결된 지정 사용자만
        // 찾아 기존 JWT 세션을 발급한다.
        const [reviewUser] = await rawDb()
          .select({
            id: users.id,
            email: users.email,
            name: users.name,
            image: users.image,
          })
          .from(users)
          .innerJoin(
            accounts,
            and(
              eq(accounts.userId, users.id),
              eq(accounts.provider, "kakao"),
            ),
          )
          .where(eq(users.email, config.userEmail))
          .limit(1);

        if (!reviewUser) {
          reviewLoginThrottle.recordFailure(clientKey);
          return null;
        }

        reviewLoginThrottle.clear(clientKey);
        return reviewUser;
      },
    }),
  ],
  callbacks: {
    async signIn({ account }) {
      if (!account) return true;

      const cookieStore = await cookies();
      // OAuth 로그인을 실제로 마친 브라우저만 기존 활성 기기를 교체할 수 있다.
      // 단순 새로고침은 이 표식이 없으므로 다른 기기의 세션을 되찾아가지 못한다.
      cookieStore.set(DEVICE_SESSION_TAKEOVER_COOKIE, "1", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 5 * 60,
        priority: "high",
      });

      // Credentials provider 는 기존 카카오 사용자를 JWT 로만 인증한다. OAuth 계정 연동
      // 테이블을 건드리면 안 되므로 아래 OAuth 전용 분기에는 진입시키지 않는다.
      if (account.type === "credentials") {
        cookieStore.set("link_user_id", "", { maxAge: 0, path: "/" });
        return true;
      }

      const linkUserId = cookieStore.get("link_user_id")?.value;
      if (!linkUserId) {
        if (account.provider !== "google") return true;

        // 신규 가입은 카카오만 허용한다. 이미 연결된 Google 계정의 로그인은 계속 지원한다.
        const [existingGoogle] = await rawDb()
          .select({ userId: accounts.userId })
          .from(accounts)
          .where(
            and(
              eq(accounts.provider, "google"),
              eq(accounts.providerAccountId, account.providerAccountId),
            ),
          )
          .limit(1);
        return !!existingGoogle;
      }

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
