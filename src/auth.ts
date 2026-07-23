import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
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
import {
  ACCOUNT_LINK_INTENT_COOKIE,
  consumeAccountLinkIntent,
  linkOAuthAccountForIntent,
  readCurrentAuthUserId,
} from "@/lib/server/accountLinkIntent";
import { mapKakaoOAuthProfile } from "@/lib/server/kakaoOAuthProfile";
import { authenticatePasswordAccount } from "@/lib/server/passwordAccount";

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
    // 공급자 이메일 일치만으로 계정을 자동 병합하지 않는다. 다른 공급자 연결은
    // /api/auth/link가 만든 일회성 의도를 OAuth callback에서 검증한 경우에만 허용한다.
    Kakao({
      // 카카오 이메일 권한이 잠겨 있을 때(사업자 미등록) ID 기반 플레이스홀더 이메일 사용.
      // kakao_<id>@kakao.oauth 형태 — 같은 카카오 계정이면 항상 동일 이메일 생성.
      profile: mapKakaoOAuthProfile,
    }),
    Credentials({
      id: "review-credentials",
      name: "아이디·비밀번호",
      credentials: {
        loginId: { label: "아이디", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials, request) {
        const clientKey =
          request.headers.get("x-real-ip") ??
          request.headers.get("x-forwarded-for")?.split(",").at(-1) ??
          "unknown";
        if (!reviewLoginThrottle.canAttempt(clientKey)) return null;

        const issuedUser = await authenticatePasswordAccount(
          credentials.loginId,
          credentials.password,
        );
        if (issuedUser) {
          reviewLoginThrottle.clear(clientKey);
          return issuedUser;
        }

        const config = readReviewLoginConfig();

        if (
          !config ||
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

        // 환경변수 기반 심사용 자격 증명은 사용자를 만들지 않는다. 카카오 계정이 이미 연결된
        // 지정 사용자만 찾아 기존 JWT 세션을 발급한다. 운영자 발급 계정은 위의 별도 테이블을 쓴다.
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
      // 과거 구현의 사용자 ID 평문 쿠키는 어떤 callback에서도 신뢰하지 않고 제거한다.
      cookieStore.set("link_user_id", "", { maxAge: 0, path: "/" });

      // Credentials provider 는 운영자 발급 계정 또는 기존 심사용 사용자를 JWT 로만
      // 인증한다. OAuth 계정 연동 테이블을 건드리면 안 되므로 아래 분기에는 진입시키지 않는다.
      if (account.type === "credentials") {
        cookieStore.set(ACCOUNT_LINK_INTENT_COOKIE, "", {
          maxAge: 0,
          path: "/api/auth",
        });
        return true;
      }

      // 정식 출시에서는 카카오 OAuth만 제공한다. provider 설정이 실수로 늘어나더라도
      // 지원하지 않는 OAuth callback은 로그인이나 계정 연결로 이어지지 않게 막는다.
      if (account.provider !== "kakao") return false;

      const intentToken = cookieStore.get(ACCOUNT_LINK_INTENT_COOKIE)?.value;
      if (!intentToken) {
        // OAuth 로그인을 실제로 마친 브라우저만 기존 활성 기기를 교체할 수 있다.
        // 계정 연결은 로그인 전환이 아니므로 이 표식을 만들지 않는다.
        cookieStore.set(DEVICE_SESSION_TAKEOVER_COOKIE, "1", {
          httpOnly: true,
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
          path: "/",
          maxAge: 5 * 60,
          priority: "high",
        });

        return true;
      }

      // 브라우저 쿠키와 DB 행을 모두 한 번만 소비한다. callback 시점에도 연결을 시작한
      // Auth.js JWT 사용자가 유지되어야 하며 provider도 처음 선택한 값과 같아야 한다.
      cookieStore.set(ACCOUNT_LINK_INTENT_COOKIE, "", {
        maxAge: 0,
        path: "/api/auth",
      });
      const currentUserId = await readCurrentAuthUserId();
      const intent = await consumeAccountLinkIntent(
        intentToken,
        account.provider,
        currentUserId,
      );
      if (!intent) return "/?linkError=invalid_or_expired";

      const result = await linkOAuthAccountForIntent(intent, account);
      if (result === "linked" || result === "already_owned") {
        return "/?linked=" + account.provider;
      }
      if (result === "account_in_use") {
        return "/?linkError=account_in_use";
      }
      // 경쟁 요청이나 DB 오류도 일반 로그인/가입으로 폴백하지 않는다.
      return "/?linkError=failed";
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
