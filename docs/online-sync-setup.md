# 온라인 동기화 — 외부 셋업 가이드

> 상태: 📌 **셋업 가이드 — ⚠️ stale** — Clerk/Neon 기준이라 현행(next-auth/RDS)과 다름. 참고 시 주의.

> `feature/online-sync` 브랜치 작업 시 사용자가 직접 해야 하는 외부 셋업 단계.
> 자세한 설계는 `docs/online-sync-plan.md` 참조.

---

## 1. Clerk (인증) 설치

1. Vercel 대시보드 → 프로젝트(`adventure-rpg`) → **Storage / Marketplace** 탭.
2. **Clerk** 검색 → **Install**.
3. Clerk 대시보드(자동 열림)에서:
   - **User & Authentication → Email, Phone, Username** → 모든 항목 비활성 (이메일/전화/사용자명 비밀번호 로그인 끄기)
   - **User & Authentication → Social Connections** → **Google 만 활성**.
4. `Continue` → Vercel 프로젝트에 환경변수 자동 주입:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`

## 2. Neon Postgres (DB) 설치

1. Vercel 대시보드 → 같은 프로젝트 → **Storage / Marketplace**.
2. **Neon** 검색 → **Install** → 무료 플랜 선택.
3. 자동 주입 환경변수: `DATABASE_URL` (그 외 `DATABASE_URL_UNPOOLED` 등도 함께 들어옴 — 이번 코드는 `DATABASE_URL` 만 사용).

## 3. 로컬 환경변수 동기화

```bash
vercel env pull .env.development.local
```

`.env.development.local` 가 생성되면 `npm run dev` 시 자동 로드.

## 4. DB 테이블 생성 (마이그레이션)

스키마 변경을 push:

```bash
npx drizzle-kit push
```

또는 마이그레이션 파일 생성 후 적용:

```bash
npx drizzle-kit generate
npx drizzle-kit migrate
```

## 5. 동작 확인

```bash
npm run dev
```

- `http://localhost:3000` 진입 → `/sign-in` 으로 리다이렉트.
- Google 로그인 후 메인 페이지로 복귀 (이 시점엔 아직 게임 데이터가 서버로 안 가므로 기존 localStorage 그대로 사용).
- `http://localhost:3000/api/health` → `{ ok: true, time: ... }` 응답 확인.

---

## 트러블슈팅

- **`DATABASE_URL is not set` 에러**: `vercel env pull` 안 했거나 `.env.development.local` 이 다른 위치에 있음.
- **Clerk 미들웨어 무한 리다이렉트**: `middleware.ts` 의 `isPublic` 매처에 `/sign-in(.*)` 가 있는지 확인.
- **`drizzle-kit push` 권한 오류**: Neon 의 connection string 이 `?sslmode=require` 로 끝나야 함.
