# 온라인 동기화 (Online Sync) 기획

> 상태: ✅ **구현 완료** — 온라인 동기화(원격 저장) 출고. ⚠️ 일부 기술 명칭 stale: 인증은 Clerk 아닌 next-auth, DB는 Neon 아닌 AWS RDS. 이 문서는 설계 기록.

> 캐릭터·인벤토리·진행도 같은 핵심 진행 상태를 서버 DB 로 옮기고, 사용자 계정에 묶어 어느 디바이스에서 들어와도 같은 진행을 보게 한다. 정적 자원(이미지·번들·게임 정의 데이터) 은 그대로 CDN/번들 캐시 사용.

---

## 결정 사항 (요약)

| 항목 | 결정 |
|---|---|
| 동기화 범위 | **핵심 진행도만** (보조 키는 디바이스별 로컬 유지) |
| 인증 제공자 | **Clerk** (Vercel Marketplace native) |
| 로그인 수단 | **Google OAuth 만** 활성화 |
| 오프라인 정책 | **온라인 전용** — 네트워크 끊기면 진행 차단, "재접속 필요" 화면 |
| DB | **Neon Postgres** (Vercel Marketplace) |
| ORM | **Drizzle** (가볍고 Edge 친화) |
| API 형식 | Next.js App Router **Route Handlers** (`/api/save/*`) |
| 단일 디바이스 가정 | v1 — 동시 접속 충돌은 last-write-wins |
| 마이그레이션 UX | **자동 push** — 신규 로그인 + 서버 비어 있음 + 로컬 데이터 있음일 때만. 충돌(둘 다 있음)은 v1 에서 발생 안 함(서버=빈, 로컬→서버 1회) |
| 세이브 슬롯 | **계정당 1캐릭터** — 다중 슬롯은 후속 |
| 오프라인 시뮬 | **클라이언트 유지** — `offlineSim` 그대로, 시계 조작 가능성 인지하고 진행 |
| URL 인코딩 | 키에 `.` 포함되므로 path param 대신 **`?key=character.v1`** 쿼리스트링 사용 |

---

## 목표

- 로그인한 사용자는 어느 브라우저에서 들어와도 캐릭터/인벤토리/퀘스트 진행을 동일하게 본다.
- 모든 게임 동작(전투·구매·장착·훈련·퀘스트 수령 등)은 **로컬 즉시 반영 + 디바운스 후 서버 PATCH** 로 처리해 입력 지연을 0 ms 로 유지.
- 네트워크가 끊기면 즉시 진행을 차단해 데이터 분기를 만들지 않는다.
- 정적 자원은 추가 작업 없음 — 이미지/JS/CSS 는 이미 Vercel Edge CDN 으로 캐싱됨.

## 비목표

- 다중 디바이스 동시 접속 충돌 해결 — v1 은 last-write-wins (마지막 쓰기가 이김).
- 오프라인 플레이 / 서비스 워커 / 인스톨러블 PWA — 추후 기획.
- 보조 키(`theme`, `auto-potion-rules.v1`, `battle-settings.v1`, `notifications.v1`) 동기화 — 디바이스별 설정으로 둠.
- 카카오·네이버 등 추가 로그인 — Google 만으로 시작, 사용자 요청 들어오면 Clerk 콘솔에서 추가.
- 서버 측 권위 검증(예: 골드 조작 방지) — 클라이언트 신뢰 모델 유지. 추후 안티치트 별도 기획.

---

## 아키텍처 개요

```
┌─────────────────────────────────────────────┐
│ 브라우저 (Next.js client)                   │
│  ┌────────────────┐  ┌──────────────────┐  │
│  │ 게임 hook 들   │←→│ remoteSave 어댑터 │  │
│  │ (useCharacterState, useInventory ...) │  │
│  └────────────────┘  └────────┬─────────┘  │
│                                │            │
└────────────────────────────────┼────────────┘
                                 │ fetch (디바운스 500ms)
                                 ↓
┌─────────────────────────────────────────────┐
│ Next.js Route Handlers (/api/save/*)         │
│   - Clerk auth() 로 userId 추출             │
│   - Drizzle 로 Postgres 읽기/쓰기            │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│ Neon Postgres                                │
│   - users (Clerk userId 가 PK)              │
│   - saves_kv (user_id, key, value)           │
└─────────────────────────────────────────────┘
```

**핵심 원리**: 클라이언트 hook 은 기존 그대로 유지하고, **localStorage 를 추상화한 `remoteSave` 어댑터**가 그 자리를 대체한다. 모든 게임 코드는 어댑터의 API 만 알면 되므로 hook 시그니처는 그대로 유지.

---

## 데이터 모델

### Postgres 스키마

기존 localStorage 키 구조와 1:1 대응되는 **key-value 테이블**로 시작. 마이그레이션이 단순하고 새 키 추가 시 스키마 마이그레이션이 필요 없다.

```sql
-- Clerk userId 와 게임 사용자 1:1 매핑.
CREATE TABLE users (
  id TEXT PRIMARY KEY,                  -- Clerk userId (sub)
  email TEXT,                            -- Clerk 에서 받아와 캐싱 (선택)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 진행 상태는 키별로 분리 저장. 로컬스토리지 패턴과 동일.
CREATE TABLE saves_kv (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key TEXT NOT NULL,                    -- "character.v1" 등
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, key)
);

CREATE INDEX idx_saves_kv_updated ON saves_kv(user_id, updated_at DESC);
```

### 동기화 대상 키 (서버 저장)

기존 12개 중 **핵심 8개**만 서버로:

| 키 | 내용 |
|---|---|
| `characterProfile.v1` | 이름/외형 |
| `character.v1` | HP/MP/EXP/레벨/골드/명성/장비 |
| `training.v1` | 훈련 상태 + 단련 포인트 + 분배 |
| `inventory.v1` | 가방 (장비/재료/포션) |
| `crafting.v1` | 해금된 제작서 |
| `quest-progress.v1` | 의뢰 진행 |
| `adventure-log.v1` | 도감 |
| `map.v1` | 방문/현재 위치 |

### 로컬 유지 키 (서버 안 감)

| 키 | 이유 |
|---|---|
| `battle-settings.v1` | 디바이스별 입력 모드 |
| `auto-potion-rules.v1` | 디바이스별 자동화 규칙 |
| `notifications.v1` | 알림 히스토리 — 휘발 가능 |
| `theme` | 디바이스별 시각 설정 |

### Drizzle 스키마 (TS)

`src/db/schema.ts`:

```ts
import { pgTable, text, timestamp, jsonb, primaryKey } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const savesKv = pgTable(
  "saves_kv",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.userId, t.key] }) }),
);
```

---

## 인증 (Clerk + Google)

### 마켓플레이스 설치

1. Vercel 대시보드 → Marketplace → Clerk → Install.
2. 자동 주입되는 환경변수: `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`.
3. Clerk 대시보드에서 **Google 만 활성화**, 나머지 소셜 제공자 비활성.

### Next.js 통합

`@clerk/nextjs` 추가 후:
- `src/middleware.ts` — `clerkMiddleware()` 로 모든 라우트 가드.
- `src/app/layout.tsx` — `<ClerkProvider>` 로 감쌈.
- 진입 시 미인증이면 `/sign-in` 으로 리다이렉트.

```ts
// src/middleware.ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/api/health"]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublic(req)) await auth.protect();
});
```

### `/sign-in` 페이지

`src/app/sign-in/[[...sign-in]]/page.tsx`:

```tsx
import { SignIn } from "@clerk/nextjs";
export default function Page() {
  return <SignIn appearance={{ /* 게임 톤에 맞춘 테마 */ }} />;
}
```

### 사용자 부트스트랩

처음 로그인한 사용자는 `users` 테이블에 행이 없음. **첫 진입 시** server action 으로 upsert:

```ts
// src/lib/server/ensureUser.ts
import { auth } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

export async function ensureUser() {
  const { userId, sessionClaims } = await auth();
  if (!userId) throw new Error("not signed in");
  await db.insert(users)
    .values({ id: userId, email: sessionClaims?.email as string | null })
    .onConflictDoNothing();
  return userId;
}
```

`/api/save/*` 핸들러 진입 시 호출.

---

## API

### `GET /api/save`

로그인 사용자의 모든 키-값을 한 번에 반환. 클라이언트 마운트 시 1회 호출.

```ts
// 응답
{ "character.v1": { hp: 50, ... }, "inventory.v1": { ... }, ... }
```

### `PATCH /api/save?key=...`

단일 키 업데이트. 디바운스된 클라이언트가 호출. 키에 `.` 이 포함되므로 path param 대신 query string.

```ts
// 요청
PATCH /api/save?key=character.v1
{ "value": { hp: 48, mp: 30, ... } }

// 응답
{ ok: true, updatedAt: "2026-..." }
```

서버는 키 화이트리스트(`SYNCED_KEYS`)로 검증. 알 수 없는 키는 400.

### `DELETE /api/save` (초기화)

전체 진행도 리셋 (관리자 페이지에서 사용).

### 인증 가드 패턴

모든 라우트 핸들러는:

```ts
import { auth } from "@clerk/nextjs/server";
export async function GET() {
  const { userId } = await auth();
  if (!userId) return new Response("unauthorized", { status: 401 });
  // ... DB 조회
}
```

---

## 클라이언트 어댑터

### `remoteSave` 추상

`src/lib/storage/remote.ts`:

```ts
type Key = "character.v1" | "inventory.v1" | /* ... */;

export type RemoteSave = {
  loadAll(): Promise<Partial<Record<Key, unknown>>>;
  patch<K extends Key>(key: K, value: unknown): Promise<void>;
};

export function createRemoteSave(): RemoteSave {
  // 디바운스된 단일 키 보내기
  const pending = new Map<Key, unknown>();
  let flushTimer: ReturnType<typeof setTimeout> | null = null;

  const schedule = () => {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      for (const [key, value] of pending) {
        await fetch(`/api/save/${key}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ value }),
        });
      }
      pending.clear();
    }, 500);
  };

  return {
    async loadAll() {
      const res = await fetch("/api/save");
      if (!res.ok) throw new Error("load failed");
      return res.json();
    },
    async patch(key, value) {
      pending.set(key, value);
      schedule();
    },
  };
}
```

### hook 어댑테이션 전략

각 영속 hook (`useCharacterState`, `useInventory`, `useTraining`, ...) 의 영속 effect 부분만 교체. 예: `useCharacterState`:

```ts
// 기존
useEffect(() => {
  if (!hydrated) return;
  localStorage.setItem(CHARACTER_STATE_KEY, JSON.stringify(state));
}, [hydrated, state]);

// 변경
useEffect(() => {
  if (!hydrated) return;
  remoteSave.patch("character.v1", state);  // 디바운스됨
}, [hydrated, state]);
```

초기 hydrate 는 부모(예: page.tsx 루트)에서 한 번 `loadAll()` 한 결과를 React Context 로 내려주고, 각 hook 은 거기서 자기 키만 꺼내씀. 또는 SWR/TanStack Query 의 `useQuery` 로 단순화 가능.

### Hook 시그니처 호환성

기존 hook 들은 **동기적으로 state 와 setter 를 반환**하고 내부에서 비동기 hydrate(localStorage 는 동기지만 mount 후 1 tick 늦게 set)하는 패턴. remoteSave 는 본질적으로 비동기이므로 다음 규칙으로 호환:

- **부모(page.tsx) 가 `loadAll()` 를 끝낼 때까지 게임 본문 렌더 자체를 막는다** — `<HydrationGate>` 로 감싸서 그 안에서만 hooks 가 실행되게.
- 따라서 각 hook 의 `useState(initial)` 는 Context 에서 받은 초기값으로 시작 → "hydrated" 플래그가 의미를 잃음 → 단순화 가능.
- 즉, 기존 hook 의 `[state, setState] = useState(initial)` 패턴은 그대로 유지하고, **initial 만 Context 에서 주입**하면 시그니처 변경이 거의 없다.

```tsx
// page.tsx
<SaveProvider>          {/* loadAll() 완료 전엔 children 미렌더 */}
  <Home />              {/* 기존 hook 들 그대로 */}
</SaveProvider>

// useCharacterState.ts
const initial = useSavedValue("character.v1") ?? initialCharacterState;
const [state, setState] = useState(initial);
```

### 첫 마운트 UX

```
1. /sign-in 통과 → 메인 페이지 진입
2. <SaveProvider> 마운트 → loadAll() 호출
3. 응답 도착 전: 전체 화면 spinner + "데이터 불러오는 중..."
4. 응답 도착: Context 에 데이터 주입 → children 렌더 → 게임 시작
5. 실패: "다시 시도" 버튼 + 에러 메시지
```

신규 사용자(서버 응답이 빈 객체 `{}`)는 모든 hook 이 기존 default 로 시작 → 자연스럽게 신규 캐릭터 흐름. `<NameSetupModal>` 는 `profile.needsSetup` 으로 그대로 동작.

### 어댑터 신뢰성 — 재시도 / 큐 / 실패 처리

단순 디바운스만으로는 fetch 실패 시 데이터를 잃는다. 다음 규칙으로 보강:

- **per-key latest 큐**: `pending: Map<Key, value>` 에 항상 최신값만 유지(같은 키 두 번 patch 시 덮어씀). flush 시작 직전에 `pending` 을 스냅샷해 보내고 빈 Map 으로 교체.
- **동시 보내기 가드**: `flushing` 플래그로 한 번에 한 flush 만. flush 중 새 patch 는 다음 사이클로 누적.
- **실패 시 백오프 재시도**: 실패 키를 다시 `pending` 에 되돌려 두고 1s → 3s → 10s 백오프. 4번 실패하면 사용자에게 "저장 실패 — 새로고침해 주세요" 토스트.
- **언로드 가드**: `beforeunload` 에서 `navigator.sendBeacon('/api/save?...')` 로 마지막 변경 강제 flush.
- **로컬 미러**: PATCH 가 큐에 들어가는 즉시 보조 미러로 같은 값을 localStorage 에도 쓴다(키는 그대로 사용). 새로고침 시 서버 fetch 가 끝나기 전 한 틱 동안 stale 데이터 표시 방지 + 서버 장애 시 마지막 상태 보존(읽기 전용 진단용).

### 세션 만료 처리

Clerk 세션이 만료되면 PATCH 가 401 반환:

- 401 수신 즉시 어댑터가 재시도 멈추고 전역 상태 `sessionExpired = true` 로 전환.
- 화면 전체에 modal: "로그인 세션이 만료되었습니다. 다시 로그인해 주세요." + 버튼 → `/sign-in?redirect_url=...` 으로.
- 게임 내 모든 액션 버튼은 `sessionExpired` 면 비활성.
- 다시 로그인 후 redirect 로 복귀 → `<SaveProvider>` 가 다시 `loadAll()` → 정상 흐름.

### "재접속 필요" 화면

`fetch` 가 `TypeError: Failed to fetch` 또는 5xx 면 전역 banner 노출:

```
🚫 서버 연결이 끊겼습니다.
   재시도하기
```

게임 화면은 그대로 두되 **모든 액션 버튼이 비활성** 됨. 5초 간격 자동 ping (`/api/health`) 으로 복구 감지하면 banner 숨김.

```ts
// src/components/OfflineGuard.tsx
function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const ping = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        setOnline(res.ok);
      } catch { setOnline(false); }
    };
    const id = setInterval(ping, 5000);
    window.addEventListener("online", ping);
    window.addEventListener("offline", () => setOnline(false));
    return () => { clearInterval(id); window.removeEventListener("online", ping); };
  }, []);
  return online;
}
```

---

## 마이그레이션 (기존 로컬 사용자)

기존 사용자는 localStorage 에 진행도가 쌓여 있음. **자동 마이그레이션** 으로 처리 — v1 에선 신규 계정만 가능하므로 "서버 비어있음 + 로컬 데이터 있음" 케이스만 발생, 충돌 없음.

```
1. 첫 로그인 후 loadAll() → 서버 데이터 0건
2. 8개 핵심 키를 localStorage 에서 읽음
3. 하나라도 있으면: 일괄 PATCH 로 서버에 push (사용자 모달 없이 자동)
4. 성공 시 안내 토스트: "이 브라우저의 모험을 계정에 연결했습니다."
5. 실패 시: 토스트 + 재시도 버튼. 데이터는 localStorage 에 그대로 남아 다음 진입에 다시 시도.
6. 한 번이라도 성공하면 `migrated.v1=true` 마커 → 다시는 시도 안 함.
```

이후 같은 계정으로 다른 디바이스에서 들어가면 서버에 이미 데이터가 있으므로 마이그레이션 단계를 건너뛴다. 로컬 데이터는 다음 PR(정리)에서 안전하게 제거.

---

## 오프라인 시뮬레이션 (`offlineSim`) 처리

현재는 페이지 닫고 다시 열 때 `last-active-tick.v1` 와 차이를 가지고 클라이언트에서 시뮬레이션을 돌림. 온라인 전용 정책 하에서도 다음과 같이 유지 가능:

1. 마운트 → `loadAll()` 으로 서버 상태 받음.
2. 서버 측 `lastActiveAt` (saves_kv 의 `updated_at` 중 최신값) 과 `Date.now()` 차이로 시뮬 길이 결정.
3. 클라이언트에서 `simulateOfflineBattles(...)` 돌려 결과 적용.
4. 결과를 다시 서버에 PATCH.

**중요**: 시뮬을 클라이언트에서 돌리므로 사용자가 시계를 조작하면 부정 가능 — 안티치트는 v1 비목표. 정확한 차단이 필요해지면 서버 cron 으로 옮기거나 `lastActiveAt` 을 서버 시계로 강제.

---

## 환경/패키지 변경

### 신규 의존성

```json
{
  "@clerk/nextjs": "^6",
  "drizzle-orm": "^0.36",
  "@neondatabase/serverless": "^0.10",
  "drizzle-kit": "^0.28"  // dev
}
```

### 환경 변수 (Vercel)

```
CLERK_PUBLISHABLE_KEY=...      # 자동 주입
CLERK_SECRET_KEY=...           # 자동 주입
DATABASE_URL=postgres://...    # Neon 자동 주입
```

### 디렉토리 추가

```
src/
  db/
    schema.ts        # Drizzle 스키마
    index.ts         # db 클라이언트
  app/
    api/
      save/
        route.ts          # GET, DELETE
        [key]/
          route.ts        # PATCH
      health/
        route.ts          # 200 OK
    sign-in/[[...sign-in]]/page.tsx
  lib/
    server/ensureUser.ts
    storage/remote.ts     # 클라이언트 어댑터
  middleware.ts
```

---

## 릴리스 단계 (PR 분할 제안)

1. **PR 1 — 인프라**: Clerk 설치, Neon 연결, Drizzle 스키마, `/api/health`, `/sign-in`, middleware. 게임 코드는 그대로 (localStorage 사용).
2. **PR 2 — API**: `/api/save` GET/PATCH, ensureUser, `remoteSave` 어댑터 + 디바운스 + 단위 테스트.
3. **PR 3 — hook 마이그레이션**: 8개 영속 hook 의 effect 를 `remoteSave` 로 교체. 마운트 시 `loadAll()` Context 주입.
4. **PR 4 — UX**: `OfflineGuard` banner, "재접속 필요" 처리, 마이그레이션 모달.
5. **PR 5 — 정리**: 안 쓰게 된 localStorage 코드 제거, 문서/`docs/features.md` 갱신, 통합 테스트.

각 PR 은 이전 PR 머지 후에도 게임이 동작하도록 점진적으로 — PR 1~2 머지 시점엔 인증만 들어오고 실제 데이터는 여전히 로컬에 저장됨.

---

## 테스트 시나리오

1. **신규 사용자 흐름** — 미로그인 진입 → `/sign-in` 리다이렉트 → 구글 로그인 → 새 캐릭터 생성 → DB 에 8개 키 모두 적재되는지.
2. **다른 디바이스 진입** — 같은 계정으로 다른 브라우저 로그인 → 캐릭터/인벤토리/퀘스트가 그대로 보이는지.
3. **마이그레이션** — 로컬에 데이터 있는 상태로 첫 로그인 → 모달 → "예" → DB 에 데이터 이전 + 로컬 핵심 키 삭제 확인.
4. **네트워크 끊김** — DevTools 에서 offline 토글 → banner 노출 + 액션 버튼 비활성 → online 복구 → banner 사라지고 정상 진행.
5. **last-write-wins** — 같은 계정으로 두 탭 열고 한쪽에서 골드 +10, 다른 쪽에서 -5 → 마지막에 PATCH 한 값이 남음.
6. **로그아웃** — 헤더에 추가될 logout 버튼 → 로컬 상태(보조 키 제외) 클리어 + `/sign-in` 으로 리다이렉트.
7. **계정 삭제** — Clerk 측에서 사용자 삭제 시 DB cascade → 모든 진행도 함께 제거되는지.

---

## 후속 (이번 기획 범위 밖)

- **다중 디바이스 충돌 해결** — 키별 ETag/version 컬럼 추가, 충돌 시 사용자 선택 UI. 또는 CRDT 도입.
- **카카오/네이버 로그인** — Clerk 콘솔에서 추가 또는 NextAuth 로 이주.
- **PWA / 오프라인 플레이** — 서비스 워커 + IndexedDB 캐시 + 동기 큐.
- **서버 권위 검증 (안티치트)** — 전투/구매/EXP 등 클라이언트 위조 가능 값을 서버에서 검증.
- **세이브 슬롯** — 한 계정에 여러 캐릭터.
- **백업/복원 UI** — 관리자 페이지에서 DB 데이터를 JSON 으로 export/import.
- **leaderboard / 친구** — 사용자 간 비교 기능 (이때 닉네임 글로벌 유니크 검증이 같이 필요).
- **`offlineSim` 서버 이전** — 시계 조작 부정 차단을 위해 Cron + DB tick 으로 옮김. 비용/복잡도 ↑.

---

## 비용 예측 (대략)

| 서비스 | 무료 티어 | 본격 운영 시 |
|---|---|---|
| Clerk | 10,000 MAU | $25/mo (10k 초과분) |
| Neon Postgres | 0.5 GB / 100 시간 컴퓨트 | $19/mo Launch |
| Vercel Functions | Hobby 무료 | Pro $20/mo |

소규모 운영(MAU 1,000 이하) 은 전부 무료 티어로 가능.
