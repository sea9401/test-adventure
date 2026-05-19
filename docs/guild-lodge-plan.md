# 길드 회관 (Guild Lodge) — PR-1 계획 보고서

작성 2026-05-18 · 관련 메모리 [[project-guild-housing-plan]]

## Context

길드는 이미 `guilds` / `guildMembers` / `guildInvites` / `guildJoinRequests` / `guildQuests` + `buffs jsonb` 자산을 보유. 광장>길드 탭 (`GuildHallView.tsx`) 에 members/quests/buffs/manage 4개 패널이 들어있다. **공간·정체성·sink** 가 없을 뿐.

PR-1 은 길드 *회관* 을 "다섯 번째 탭" 으로 추가. **Power-free 원칙** 으로 무소속 유저 패널티를 만들지 않는다. 합성/강화/별빛 정련 같은 *능력 영향* 시설은 마을·5막 사냥터에 동등하게 열려 있으니 회관은 그 위에 *사회적 정체성 + sink + 진행 가시화* 만 얹는다.

## 핵심 원칙

- **Power 0** — 회관 등급/봉납이 전투력·자원율·드랍률 등 어떤 능력 수치에도 영향 X.
- **모두에게 동등한 baseline** — 별빛 조각의 다른 sink (룬 6등급, AP 스킬북) 는 무소속 유저도 동일하게 접근.
- **사회적 가시화** — 누가 얼마나 봉납했는지 멤버 카드로 보여줘서 "함께 만드는 곳" 체감.
- **길드장만 회관 등급업 트리거** — 봉납은 누구나, 등급업 결정은 마스터 (`role='master'`). 명성 시스템 (`fameAvailable`) 분기와 동일 패턴.
- **봉납 비가역** — 한 번 봉납한 별빛/골드는 회수 불가. 길드 해체 시에도 회관 등급은 tombstone 과 함께 30일 후 hard delete.

## 스코프

### 포함

1. **별빛 / 골드 봉납** — 멤버 누구나, 임의 수량.
2. **회관 등급 ★1 ~ ★5** — 봉납 누적치 임계 도달 시 마스터가 trigger 해서 승급.
3. **이번주 / 누계 기여 카드** — 멤버당 봉납 합계, 사회적 가시화.
4. **회관 등급 슬로건 1줄** — 마스터가 자유 텍스트 (80자), 회관 첫 줄에 표시.
5. **현재 길드 자금 풀** — 골드/별빛 누계 표시. *지출은 회관 등급업만* (PR-1.4 권한 시스템 도입 전엔 지출 path 단순).

### 제외 (후속 PR)

- **공동 보관함** (PR-1.2) — equipment grade variant + craftQuality + dropQuality 분기로 단독 PR 분량
- **회관 외관/색·테마 커스터마이즈** (PR-1.3) — 시각 자산 의사결정 별도
- **자금 풀 운영 권한 (마스터 외 협의)** (PR-1.4) — 길드 권한 시스템 손봐야 함
- **길드 외부 노출** (PR-1.5) — 회관 등급/슬로건 둘러보기·프로필에 표시
- **etc** — 회관 모임 채팅, 일일 봉납 캡, 봉납 보너스 칭호 등

## DB 스키마

마이그레이션 1회. 신규 테이블 2개, 기존 `guilds` 컬럼 2개 추가.

### `guilds` (alter)

```ts
// 기존 + 추가 컬럼:
lodgeRank: integer("lodge_rank").notNull().default(0),     // 0 = 미건립, 1~5 = ★ 등급
lodgeSlogan: text("lodge_slogan"),                          // 마스터 자유 텍스트 (≤80자 검증)
```

`lodgeRank=0` 가 기본값이라 기존 길드는 자동으로 *회관 미건립* 상태. 첫 봉납 발생 시 client 가 ★1 자동 trigger (마스터만, 비용 없음).

### `guildLodgeDonations` (신규)

```ts
export const guildLodgeDonations = pgTable(
  "guild_lodge_donations",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),       // 'stardust' | 'gold'
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 이번주/누계 집계 — guildId 인덱스로 GROUP BY userId 처리.
    index("guild_lodge_donations_guild_created_idx").on(t.guildId, t.createdAt),
    check("guild_lodge_donations_kind_valid", sql`${t.kind} IN ('stardust','gold')`),
    check("guild_lodge_donations_amount_positive", sql`${t.amount} > 0`),
  ],
);
```

`amount` 는 KST 자정 기준 누적 — 통화/원자재 단위 그대로. 별빛/골드 각각 row 1개. 합산은 read-time 에서.

### `guildLodgeState` (신규) — 누계 캐시

```ts
export const guildLodgeState = pgTable("guild_lodge_state", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  stardustTotal: integer("stardust_total").notNull().default(0),
  goldTotal: integer("gold_total").notNull().default(0),
  lastDonationAt: timestamp("last_donation_at"),
});
```

매번 `SUM(amount)` 돌리는 대신 봉납 트랜잭션 안에서 누계 row 도 같이 upsert. 등급 임계 비교 / 회관 메인 표시에 hot path 라 캐싱이 합리적.

봉납 row 가 source of truth, 캐시 row 는 derived. 정합성 깨질 일은 봉납 path 가 트랜잭션 안에 둘 다 잠그면 없음.

### 마이그레이션 SQL (drizzle-kit generate)

```sql
ALTER TABLE guilds
  ADD COLUMN lodge_rank integer NOT NULL DEFAULT 0,
  ADD COLUMN lodge_slogan text;

CREATE TABLE guild_lodge_donations ( ... );
CREATE INDEX guild_lodge_donations_guild_created_idx
  ON guild_lodge_donations (guild_id, created_at);
-- CHECK 제약은 위 정의대로

CREATE TABLE guild_lodge_state ( ... );
```

## 등급 임계 / 슬로건 규칙

```ts
// src/adventure/data/guildLodge.ts (신규)
export const LODGE_RANK_THRESHOLD = {
  1: { stardust: 0,    gold: 0     },   // ★1 = 첫 봉납 (사실상 자유 trigger)
  2: { stardust: 200,  gold: 5000  },
  3: { stardust: 800,  gold: 20000 },
  4: { stardust: 2400, gold: 60000 },
  5: { stardust: 6400, gold: 150000 },
} as const satisfies Record<1|2|3|4|5, { stardust: number; gold: number }>;
export const LODGE_RANK_MAX = 5;
export const LODGE_SLOGAN_MAX = 80;
```

임계는 `(stardustTotal >= req.stardust) AND (goldTotal >= req.gold)` 양쪽 만족 시 승급 가능. 별빛 단독·골드 단독 누적은 부족. 두 통화 같이 흘러가는 사회적 협업 강제.

수치 산정 근거:
- 별빛 200 = 5막 별빛 사냥터 평균 시간당 30~40 조각 가정 시 5~6시간 × 길드 활동량
- 골드 5000 = 100렙 평균 일일 골드 수입 10~20% 수준
- 임계 지수 증가율 4배 — ★5 까지 자연 시간 = 수 주~수 개월 (활동 길드 vs 한가한 길드 격차 자연 발생)

> **결정 보류**: 수치는 첫 출고 후 운영 데이터 보고 조정. 메모리 [[likes-equip-upgrade-recipes]] 처럼 *재료 소비 만족감* 결이라 좀 빡빡한 게 자연스러움.

## API 라우트

### `GET /api/guilds/[id]/lodge`

회관 탭 진입 시 호출. 1 응답에 모든 데이터.

```ts
type LodgeResponse = {
  rank: number;          // 0 = 미건립, 1~5
  slogan: string | null;
  stardustTotal: number;
  goldTotal: number;
  lastDonationAt: string | null;
  nextRank: {
    rank: number;
    stardustReq: number;
    goldReq: number;
    ready: boolean;     // 임계 모두 만족 + 현 rank < 5
  } | null;             // null = ★5 도달
  myDonations: {        // 이번주/누계 본인 분
    weekStardust: number;
    weekGold: number;
    totalStardust: number;
    totalGold: number;
  };
  contributions: {      // 전 멤버 (최대 3명)
    userId: string;
    name: string;
    weekStardust: number;
    weekGold: number;
    totalStardust: number;
    totalGold: number;
  }[];
};
```

쿼리: `guildLodgeState` 1회 + `guildLodgeDonations` GROUP BY userId 2회 (이번주 / 누계) + 멤버 이름 조회 1회. 4 query, 길드원만 권한.

### `POST /api/guilds/[id]/lodge/donate`

```ts
type DonateBody = {
  kind: "stardust" | "gold";
  amount: number;          // 양수, ≤ 본인 잔고
};
```

흐름 (단일 트랜잭션):
1. ensureUser, 길드원 검증.
2. `kind` / `amount` 검증 (양수 정수, 본인 잔고 ≥ amount).
3. **stardust**: `consumeStardust(amount)` (`src/lib/server/consumeMaterial.ts` 패턴 — 잔고 차감), **gold**: 캐릭터 골드 차감 (`character.v2.gold`).
4. `guildLodgeDonations` INSERT.
5. `guildLodgeState` UPSERT (`stardustTotal += amount` 또는 `goldTotal += amount`, `lastDonationAt = NOW`).
6. 응답: 갱신된 누계 + (있다면) `nextRank.ready=true` 토스트 hint.

실패 시 트랜잭션 롤백 → 본인 잔고 미차감.

### `POST /api/guilds/[id]/lodge/upgrade`

마스터만, `ready=true` 일 때 ★ 한 단계 승급.

```ts
type UpgradeResponse = { rank: number };
```

흐름:
1. ensureUser, 마스터 검증.
2. 현 rank < 5 검증.
3. `guildLodgeState` 잠금 → 임계 재확인 (race 가드).
4. `guilds.lodgeRank = lodgeRank + 1` UPDATE.

**비용 X** — 봉납 누계가 임계 이상이면 무료 trigger. 별빛/골드는 봉납 시점에 이미 소비됨. (상위 등급 임계가 더 누적 요구하니 자연스러운 inflate prevent.)

### `PATCH /api/guilds/[id]/lodge/slogan`

마스터만.

```ts
type SloganBody = { slogan: string };   // 길이 ≤ 80, trim 후 비면 NULL
```

`guilds.lodgeSlogan` UPDATE.

## UI 구조

### 진입점

`GuildHallView.tsx` 의 `type Tab` 에 `"lodge"` 추가, 첫 탭으로 배치 (members 위).

```ts
type Tab = "lodge" | "members" | "quests" | "buffs" | "manage";
```

### `GuildLodgePanel.tsx` (신규)

```
회관 ★★☆☆☆  (다음 등급: ★★★)
─────────────────────────
※ "달밤의 신단" ─ 별빛 한 점이 떠 있는 작은 사당.
                 — 마스터 슬로건 (편집)
─────────────────────────
다음 등급 진행도
  별빛 조각  234 / 800  ▓▓▓▓░░░░░░
  골드     12,400 / 20,000  ▓▓▓▓▓▓░░░░
  [↗ ★★★ 으로 승급]  ← 임계 만족 시만, 마스터만
─────────────────────────
봉납하기
  [별빛 조각] [수량 입력]   잔고: 12
  [골드]      [수량 입력]   잔고: 2,400
─────────────────────────
이번주 기여
 1.  마린   ⭐ 8  💰 1,200
 2.  보드   ⭐ 3  💰 800
 3.  유리   ⭐ —  💰 200

누계 기여 (회관 건립 이후)
 1.  마린   ⭐ 42  💰 6,800
 ...
```

레이아웃: 카드 위→아래 — (1) 등급+슬로건, (2) 다음 등급 진행도, (3) 봉납 폼, (4) 이번주 기여, (5) 누계 기여.

스타일: `RankingsView` 와 `MeCard` 패턴 재사용 (`Card`, `StatBar` 응용).

### 빈 회관 (rank=0) 상태

```
회관이 아직 비어 있습니다.
첫 별빛을 봉납하면 ★1 회관이 자동으로 세워집니다.

[별빛 조각 봉납]
```

마스터 첫 봉납 → 회관 자동 건립. 멤버 첫 봉납이 마스터보다 빨리 들어와도 자동 건립되도록 봉납 path 의 응답이 `rank=0→1` 전환을 다룬다.

## 흐름

```
[봉납] DonateModal → POST /donate
                     → 본인 잔고 차감 + donations INSERT + state UPSERT
                     → rank=0 이면 자동 rank=1 (특별 path)
                     → 응답 LodgeResponse 전체

[승급] 마스터가 [승급] 클릭 → POST /upgrade → rank++, 토스트
[슬로건] 마스터가 슬로건 inline 편집 → PATCH /slogan
[새로고침] 봉납/승급/슬로건 모두 응답에 최신 상태 포함 → useArena 패턴
```

## 변경 파일 (16개)

### A. 데이터 (1)

- **`src/adventure/data/guildLodge.ts`** (신규) — `LODGE_RANK_THRESHOLD`, `LODGE_RANK_MAX`, `LODGE_SLOGAN_MAX`, `rankReady(state, rank)` 헬퍼.

### B. DB (1)

- **`src/db/schema.ts`** — `guilds.lodgeRank/lodgeSlogan` 추가, `guildLodgeDonations` / `guildLodgeState` 신규.
- **`drizzle/00XX_guild_lodge.sql`** (자동 생성).

### C. 서버 라이브러리 (2)

- **`src/lib/server/guildLodge.ts`** (신규) — `donate(...)`, `upgradeRank(...)`, `setSlogan(...)`, `readLodge(...)`. 트랜잭션 + 권한 검증 한곳.
- **`src/lib/server/guildLodge.test.ts`** (신규) — donate 잔고 차감, race-safe upsert, upgrade 임계 재검증, 권한 거부 4 경로.

### D. API 라우트 (4)

- **`src/app/api/guilds/[id]/lodge/route.ts`** — GET
- **`src/app/api/guilds/[id]/lodge/donate/route.ts`** — POST
- **`src/app/api/guilds/[id]/lodge/upgrade/route.ts`** — POST
- **`src/app/api/guilds/[id]/lodge/slogan/route.ts`** — PATCH

### E. 클라이언트 (5)

- **`src/adventure/guild/api.ts`** — `fetchLodge`, `donateToLodge`, `upgradeLodge`, `setLodgeSlogan` 함수 추가.
- **`src/adventure/guild/GuildLodgePanel.tsx`** (신규) — 회관 패널 메인.
- **`src/adventure/guild/lodge/DonateForm.tsx`** (신규) — 별빛/골드 봉납 입력.
- **`src/adventure/guild/lodge/RankProgress.tsx`** (신규) — 등급 진행도 + 승급 버튼.
- **`src/adventure/guild/lodge/ContributorList.tsx`** (신규) — 이번주/누계 기여 카드.

### F. 통합 (3)

- **`src/adventure/guild/GuildHallView.tsx`** — `Tab` 에 `"lodge"` 추가, `GuildTabButton` 행에 추가, 패널 분기에 추가.
- **`src/adventure/guild/useGuildBuffsCache.ts`** — 패턴 참고만, 변경 없음. (Lodge 는 캐시 단순 — useAsyncData 한 방.)
- **`src/adventure/guild/buffSlots/BuffSlotCards.tsx`** — 영향 없음 (확인용).

## Verification

1. **타입체크**: `npm run typecheck`. 신규 타입 + 호출처.
2. **단위 테스트**: `npm test -- guildLodge.test.ts`. 4 경로 + race upsert.
3. **DB 마이그레이션**: `npm run db:generate && npm run db:migrate` (EC2). `guild_lodge_state` 가 비어있고 `guild_lodge_donations` 도 비어있는 상태에서 신규 시작. 기존 길드 `lodge_rank=0`, `lodge_slogan IS NULL` 자동 백필 확인.
4. **수동 E2E** (배포 후):
   - 마스터 캐릭터로 별빛 5 봉납 → 회관 자동 건립 (★1)
   - 비-마스터 멤버 봉납 → 누계 반영, ranking 카드 표시
   - 별빛/골드 양쪽 임계 도달 → `nextRank.ready=true` 응답, 마스터에게만 [승급] 버튼 노출
   - 마스터 승급 → ★2 표시, 다음 임계 ★3 노출
   - 슬로건 편집 → 80자 초과 거부, 빈 문자열 → NULL 저장
   - 무소속 유저 — 회관 탭 자체 안 보임 (`GuildNoGuildPanel` 그대로)
5. **회귀**: 기존 길드 4개 탭 (members/quests/buffs/manage) 동작 영향 없는지.
6. **권한 거부 경로**: 비-마스터가 /upgrade 호출 → 403. 비-멤버가 /donate 호출 → 403. /slogan 동일.

## 후속 PR 로드맵

PR-1 (이 보고서) 머지 후:
- **PR-1.2 공동 보관함** — `guild_lodge_stash` 테이블 + 거치/회수 + grade variant 분기 (마켓플레이스 grade 컬럼 패턴 재사용).
- **PR-1.3 외관/테마 커스터마이즈** — 등급별 색·테마 토글, 이미지 자산 별도 발주.
- **PR-1.4 자금 풀 권한 확장** — 마스터 외 협의·투표·부마스터 권한.
- **PR-1.5 외부 노출** — 길드 둘러보기 카드에 회관 ★, 회관 슬로건. 본인 프로필 길드 칭호.

상위 단계 [[project-guild-housing-plan]]:
- **Step A** — 5:5 비동기 길드전 (유저 50+ 도달 후).
- **Step B** — 영지/약탈 (유저 100+).
- **Step C** — 풀 CoC (유저 500+).

## 미해결 / 결정 보류

- **등급 임계 수치** — 운영 데이터 없는 초안. 첫 출고 후 1~2 주 봉납 속도 보고 조정.
- **★5 도달 후 보상** — 칭호? 시각 변화? 봉납 누계가 ★5 임계의 N배 도달 시 ★+ 표시? 보류 — 운영 데이터로 결정.
- **별빛 조각만 가능 vs 골드 단독 봉납 가능** — 현 계획은 *양쪽 동시 임계*. 한쪽만 길러도 진행되게 풀어주면 활성 낮은 길드도 천천히 성장 가능. 운영 보고 토글.
- **회관 미건립 마스터의 봉납 path** — 현 계획은 *첫 봉납 시 자동 ★1 건립*. 마스터 명시 trigger 가 더 자연스러우면 변경 (별빛 5 같은 최소 비용 + [회관 건립] 버튼).
- **봉납자 이름 표시 규칙** — 현재 계획은 `users.gameName` → `character-profile.v2.name` fallback. 무명 봉납 옵션은 추가 안 함 (사회적 가시화 원칙과 충돌).
