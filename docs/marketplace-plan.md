# 거래소 (Marketplace) 기획

> 상태: ✅ **구현 완료** — 거래소 출고(인스턴스 거래 #493~#495 포함). 이 문서는 설계 기록.

> 플레이어 간 장비·재료 거래. 고정가 등록 + 즉시 구매. 등록 시 아이템을 서버에 에스크로(escrow) 보관, 거래 결과는 **우편함**으로 전달해 클라이언트 인벤토리 동기화와 충돌하지 않게 한다.

---

## 결정 사항 (요약)

| 항목 | 결정 |
|---|---|
| 거래 방식 | **고정가 등록 + 즉시 구매** (경매 없음) |
| 거래 가능 아이템 | **장비 + 재료** (포션 제외 — 회전 너무 빠름) |
| 수수료 정책 | **성사 수수료 5%** (구매가의 5% 차감 → 판매자 95% 수령). 등록 수수료 없음 |
| 등록 슬롯 | **유저당 10개** 동시 등록 제한 |
| 등록 만료 | **만료 없음** v1 — 슬롯 제한으로 스팸 방지. 사용자가 직접 취소 |
| 가격 범위 | 1 ~ 999,999,999 G (정수) |
| 재료 거래 단위 | **풀스택 1건** — 5개를 500G 에 등록하면 buyer 는 5개 통째로 구매. 분할 불가 |
| 결과 전달 | **우편함(inbox)** — 즉시 인벤토리 반영 안 함, 사용자가 "수령" 클릭해서 받음 |
| 거래소 메인 UI 위치 | **상위 탭 `거래소`** — 어디서든 listing 조회/구매 가능 |
| 우편함 위치 | **마을 탭 sub-view `우편함`** — 상점/치유소와 같은 EntryCard 패턴. 마을에 있어야 수령 가능 |
| 동일 아이템 중복 등록 | 허용 — 가격 다른 같은 아이템을 여러 슬롯에 따로 등록 가능 |
| 자기 거래 | **자기 listing 구매 불가** — 서버에서 차단 |

---

## 목표

- 플레이어가 안 쓰는 장비/재료를 다른 플레이어에게 팔 수 있다.
- 거래는 **즉시 성사** — 입찰 대기 / 만료 처리 없음.
- 서버측 원자성 보장 — 같은 listing 을 두 명이 동시에 사도 한 명만 성공 (DB 트랜잭션).
- 거래 결과는 **claim 기반** — 클라이언트의 saves_kv 동기화 흐름과 충돌하지 않게 우편함 경유.
- 등록 가능 아이템은 인벤토리 모델(`inventory.v2`)의 `equipment` / `materials` 카테고리만.

## 비목표

- 경매 / 입찰 — 추후.
- 가격 분할 구매 (재료 5개 중 2개만) — 추후.
- 거래 히스토리 그래프 / 시세표 — 추후.
- NPC 자동 마켓 메이커 — 추후.
- 우편함 만료 / 자동 회수 — v1 은 영구 보관 (DB 비대해지면 추후 cron).
- 검색 인덱스 (Postgres FTS, trigram) — v1 은 단순 ILIKE 부분일치.
- 상장 차트 / 가격 추천 — 추후.

---

## 아키텍처 개요

```
┌──────────────────────────────────────────────────────┐
│ 브라우저 (게임 클라이언트)                            │
│  ┌────────────────────────┐  ┌────────────────────┐  │
│  │ MarketplaceTab (메인UI) │  │ InboxIndicator     │  │
│  │  - 검색/필터/정렬       │  │  (헤더에 N 표시)    │  │
│  │  - 등록 모달            │  └────────────────────┘  │
│  │  - 내 listing / 우편함  │                          │
│  └─────────────┬──────────┘                          │
└────────────────┼─────────────────────────────────────┘
                 │ fetch
                 ↓
┌──────────────────────────────────────────────────────┐
│ /api/marketplace/*                                   │
│   - listings  GET (검색)                             │
│   - listings  POST (등록 → 인벤 차감 + escrow)       │
│   - listings  DELETE (취소 → 우편함으로 환불)        │
│   - listings/buy POST (구매 → 트랜잭션 처리)         │
│   - inbox  GET (수령 대기 목록)                      │
│   - inbox/claim POST (수령 → 인벤/골드 반영)         │
└─────────────────┬────────────────────────────────────┘
                  │
                  ↓
┌──────────────────────────────────────────────────────┐
│ Postgres (Neon)                                      │
│   - marketplace_listings  (status, item, price, ...) │
│   - marketplace_inbox     (kind, payload, claimed)   │
│   - saves_kv              (기존 — 일부 트랜잭션 갱신) │
└──────────────────────────────────────────────────────┘
```

**핵심 설계 — 우편함 패턴**: 거래 결과(판매대금/구매아이템/취소환불)를 곧장 `saves_kv` 의 `character.v2` / `inventory.v2` 에 쓰지 않는다. 클라이언트는 디바운스된 PATCH 로 인벤·캐릭터 상태를 자기가 덮어쓰는데, 서버측 직접 갱신은 그 PATCH 와 race 가 발생한다. 대신 결과를 `marketplace_inbox` 에 쌓고, 사용자가 "수령" 버튼 누를 때 클라이언트가 자기 상태에 머지하고 평소대로 PATCH 한다.

---

## 데이터 모델

### Postgres 스키마

```sql
-- 활성/판매됨/취소됨 listing 모두 저장. 판매됨/취소됨 행은 분석용 보관 (또는 추후 cron 정리).
CREATE TABLE marketplace_listings (
  id           BIGSERIAL PRIMARY KEY,
  seller_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  seller_name  TEXT NOT NULL,         -- 등록 시점 닉네임 스냅샷
  item_kind    TEXT NOT NULL,         -- 'equip' | 'material'
  item_id      TEXT NOT NULL,         -- ITEMS / MATERIALS 키
  item_name    TEXT NOT NULL,         -- 표시·검색용 스냅샷 (한글 이름)
  quantity     INT  NOT NULL CHECK (quantity > 0),
  price        BIGINT NOT NULL CHECK (price > 0 AND price <= 999999999),
  status       TEXT NOT NULL DEFAULT 'active'
                 CHECK (status IN ('active','sold','cancelled')),
  created_at   TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  closed_at    TIMESTAMPTZ,           -- sold/cancelled 시점
  buyer_id     TEXT REFERENCES users(id) ON DELETE SET NULL  -- sold 일 때만
);

-- 활성 listing 검색 — 가장 빈번한 쿼리.
CREATE INDEX idx_listings_active ON marketplace_listings(item_kind, item_id, price)
  WHERE status = 'active';

-- 내가 등록한 listing 보기.
CREATE INDEX idx_listings_by_seller ON marketplace_listings(seller_id, status, created_at DESC);

-- 슬롯 카운트 — UNIQUE 가 아니라 그냥 빠른 카운팅용.
-- (status='active' 만 세는 partial index 로도 충분)


-- 거래 결과 우편함. 사용자가 수령(claim) 할 때까지 대기.
CREATE TABLE marketplace_inbox (
  id          BIGSERIAL PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL
                CHECK (kind IN ('sale_proceeds','purchase_item','cancel_return')),
  payload     JSONB NOT NULL,         -- {gold:N} 또는 {item_kind, item_id, quantity}
  message     TEXT,                   -- "OO 님에게 X 판매 — 950G 수령"
  listing_id  BIGINT REFERENCES marketplace_listings(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  claimed_at  TIMESTAMPTZ
);

CREATE INDEX idx_inbox_unclaimed ON marketplace_inbox(user_id, created_at)
  WHERE claimed_at IS NULL;
```

### Drizzle 스키마 추가 (`src/db/schema.ts`)

```ts
export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    sellerId: text("seller_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    sellerName: text("seller_name").notNull(),
    itemKind: text("item_kind").notNull(), // 'equip' | 'material'
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    quantity: integer("quantity").notNull(),
    price: bigint("price", { mode: "number" }).notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    buyerId: text("buyer_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    index("idx_listings_active").on(t.itemKind, t.itemId, t.price)
      .where(sql`${t.status} = 'active'`),
    index("idx_listings_by_seller").on(t.sellerId, t.status, t.createdAt),
  ],
);

export const marketplaceInbox = pgTable(
  "marketplace_inbox",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    message: text("message"),
    listingId: bigint("listing_id", { mode: "number" })
      .references(() => marketplaceListings.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => [
    index("idx_inbox_unclaimed").on(t.userId, t.createdAt)
      .where(sql`${t.claimedAt} IS NULL`),
  ],
);
```

### Inbox payload 형식

```ts
// kind = 'sale_proceeds' — 판매 성사 → 수수료 차감된 골드
{ gold: 950 }

// kind = 'purchase_item' — 구매 성사 → 받을 아이템
{ item_kind: 'equip', item_id: 'iron_sword', quantity: 1 }
{ item_kind: 'material', item_id: 'herb', quantity: 5 }

// kind = 'cancel_return' — 취소 환불 → 등록한 아이템 그대로
{ item_kind: 'equip', item_id: 'iron_sword', quantity: 1 }
```

---

## 핵심 흐름

### 1) 등록 (`POST /api/marketplace/listings`)

```
요청: { item_kind, item_id, quantity, price }

서버:
  TX BEGIN
  1. requireUser() → sellerId
  2. 활성 listing 슬롯 카운트 < 10 인지 확인
  3. saves_kv 에서 inventory.v2 SELECT FOR UPDATE
  4. 해당 아이템 quantity 가 인벤토리에 있는지 확인 → 차감 후 inventory.v2 UPDATE
     - equipment: 1개 단위. quantity > 보유면 400.
     - material: 보유 ≥ quantity 인지.
     - 단, 인벤토리에 자기가 "장착 중인 장비" 는 거래 불가 (캐릭터 character.v2.equipped 검사).
  5. profile 에서 닉네임 조회 → sellerName 스냅샷
  6. INSERT INTO marketplace_listings (status='active', ...)
  TX COMMIT

응답: { listing_id, ... }
```

**중요**: 등록과 동시에 인벤토리에서 즉시 차감(에스크로). 서버가 들고 있다가 판매되면 buyer 우편함, 취소되면 seller 우편함으로 돌려준다.

**인벤토리 직접 갱신 vs 우편함**: 등록 시는 직접 갱신해야 한다 (사용자가 등록 직후 같은 아이템을 또 쓰지 못해야 함). 클라이언트는 응답 받으면 자기 inventory 상태에서 차감해 PATCH 하면 race 가 안 생긴다 — 대신 **클라가 등록 요청을 보낼 때 이미 자기 상태를 차감해 두고 보냄**. 서버는 받은 차감 상태를 그대로 SET 하지 않고, 검증 후 자기 트랜잭션으로 차감해 신뢰 모델 유지.

→ 실제 구현: 클라이언트가 등록 모달에서 "등록하기" 누르면, 응답 200 받은 뒤 클라이언트의 `inventory.v2` 에서도 같은 차감을 적용 → 평소 디바운스 PATCH 로 sync. 서버측 inventory.v2 UPDATE 는 listing 트랜잭션 안에서 같이 처리해 race window 를 닫는다.

### 2) 검색 / 목록 (`GET /api/marketplace/listings`)

```
쿼리:
  q          (선택) item_name ILIKE %q%
  kind       (선택) 'equip' | 'material'
  sort       'price_asc' | 'price_desc' | 'recent' (기본)
  cursor     pagination — 마지막 본 (created_at, id)
  limit      기본 30, 최대 50

응답: { items: Listing[], next_cursor?: string }
```

자기 listing 도 포함해 표시(회색 처리, "구매" 대신 "취소" 버튼). 클라이언트에서 선별 표시도 가능.

### 3) 구매 (`POST /api/marketplace/listings/buy`)

```
요청: { listing_id }

서버:
  TX BEGIN
  1. requireUser() → buyerId
  2. SELECT ... FROM marketplace_listings WHERE id = $1 FOR UPDATE
     - status != 'active' → 409 "이미 판매됨/취소됨"
     - seller_id == buyerId → 400 "자기 거래 불가"
  3. saves_kv['character.v2'] FOR UPDATE → buyer.gold ≥ price 인지
     gold < price → 400 "골드 부족"
  4. character.v2.gold -= price 로 UPDATE
  5. UPDATE marketplace_listings
       SET status='sold', closed_at=NOW(), buyer_id=$buyerId
       WHERE id=$1 AND status='active'   -- double-check
     영향 행 0 → ROLLBACK ("이미 판매됨")
  6. 수수료 계산: fee = floor(price * 0.05), seller_gets = price - fee
  7. INSERT INTO marketplace_inbox (seller, 'sale_proceeds', {gold: seller_gets}, ...)
  8. INSERT INTO marketplace_inbox (buyer, 'purchase_item', {item_kind, item_id, quantity}, ...)
  TX COMMIT

응답: { ok: true, inbox_id_self: N }   -- 즉시 받은 쪽 우편함 ID 반환해 UI 가 곧장 수령 모달 띄우게
```

**구매자의 골드는 직접 character.v2 차감**: 우편함 우회 안 하는 이유 — 구매 직후 buyer 가 다시 다른 아이템을 사려 할 때 골드가 충분한지 서버가 검증하려면 server-canonical 한 골드 위치가 필요. character.v2 에서 직접 차감 + buyer 의 다음 PATCH 가 들어와도 server 측 트랜잭션이 일찍 commit 됐으면 그 PATCH 의 값으로 덮어써짐 → race window 존재.

→ **클라이언트 동시성 처리**: buyer 의 클라이언트가 "구매" 버튼 누르면 (a) 응답 받을 때까지 모든 PATCH 일시 중단, (b) 응답 받으면 응답에 들어 있는 새 gold 값으로 자기 상태 갱신, (c) PATCH 재개. 응답 형식에 `{ new_gold: N }` 포함해 클라가 동기화에 사용.

### 4) 취소 (`DELETE /api/marketplace/listings?id=N`)

```
서버:
  TX BEGIN
  1. requireUser() → userId
  2. SELECT ... WHERE id=$1 FOR UPDATE
     status != 'active' → 409
     seller_id != userId → 403
  3. UPDATE listings SET status='cancelled', closed_at=NOW()
  4. INSERT INTO marketplace_inbox (seller, 'cancel_return', {item_kind, item_id, quantity}, ...)
  TX COMMIT
```

판매자가 취소하면 아이템은 우편함으로 — 인벤토리 직접 복귀가 아니라 일관된 흐름 유지.

### 5) 우편함 조회 (`GET /api/marketplace/inbox`)

```
응답: { items: InboxItem[] }
  - claimed_at IS NULL 인 row 만, 시간 순 (최신 위)
  - 각 row: { id, kind, payload, message, listing_id, created_at }
```

### 6) 수령 (`POST /api/marketplace/inbox/claim`)

```
요청: { ids: number[] }   -- 한 번에 여러 개 수령 가능

서버:
  TX BEGIN
  1. requireUser() → userId
  2. SELECT ... WHERE id IN (...) AND user_id=$user AND claimed_at IS NULL FOR UPDATE
  3. payload 합산:
       gold_total: sum of {gold} payloads
       items_to_add: list of {item_kind, item_id, quantity}
  4. saves_kv['character.v2'] / saves_kv['inventory.v2'] FOR UPDATE
  5. character.v2.gold += gold_total
  6. inventory.v2 의 equipment[item_id] / materials[item_id] += quantity (kind 별)
  7. UPDATE marketplace_inbox SET claimed_at=NOW() WHERE id IN (...)
  TX COMMIT

응답: { gold_added: N, items_added: [...], new_gold: N, new_inventory_snapshot: {...} }
```

수령은 **여러 개를 한 번에** 처리해 race window 를 줄임. 응답에 새 gold/inventory 스냅샷 반환 → 클라이언트가 자기 상태에 반영 후 즉시 PATCH.

---

## 동시성 / 일관성 고려

### Race window 의 핵심 — saves_kv

`saves_kv['character.v2']` / `saves_kv['inventory.v2']` 는 클라이언트가 디바운스로 통째로 PATCH 한다. 서버가 트랜잭션으로 직접 갱신해도, 클라이언트의 다음 PATCH 가 stale 데이터로 덮어쓸 수 있다.

**완화책**:

1. **수령(claim) 시 응답 스냅샷 사용** — 서버가 응답에 새 character/inventory 스냅샷을 포함, 클라이언트가 이를 자기 상태에 반영하고 즉시 PATCH. PATCH 가 도착할 때 서버측 값과 클라측 값이 일치 → race 영향 없음.

2. **구매 시 PATCH 일시 중단** — 클라가 구매 요청 보낼 때 saves_kv PATCH 를 잠시 멈추고, 응답 받으면 새 골드로 자기 상태 갱신 후 재개. 동시에 누른 다른 액션(예: 장비 장착) 의 PATCH 도 같이 멈춤.

3. **etag/version 도입은 v2** — 본격 충돌 해결은 saves_kv 행에 version 컬럼 + If-Match 헤더 도입이 정석이지만 v1 비목표.

### "동시 두 명이 같은 listing 구매" 시나리오

DB FOR UPDATE 락 + status 조건부 UPDATE 로 보장:
```sql
UPDATE marketplace_listings
   SET status='sold', ...
 WHERE id=$1 AND status='active';
```
영향 행 0 면 이미 다른 사람이 샀음 → 트랜잭션 롤백 → 클라에 409.

### 골드/아이템 손실 / 복제 시나리오

| 시나리오 | 해결 |
|---|---|
| 등록 직후 서버 다운 | 트랜잭션 단위라 listing 생성 + inventory 차감 동시 commit. 둘 다 됐거나 둘 다 안 됐거나. |
| 구매 후 우편함 적재 실패 | 같은 트랜잭션 안 → 모두 atomic. |
| 수령 직후 서버 다운 | 트랜잭션이 commit 됐으면 claimed_at 셋팅됨, saves_kv 도 갱신됨 → 클라가 다음 GET 에서 우편함 빈 상태 받음. commit 전 다운이면 둘 다 안 됨 → 다시 수령 가능. |
| 수령 직후 클라이언트 새로고침 | 응답 못 받음 → 서버는 이미 saves_kv 갱신 완료. 클라가 새로 GET inventory 하면 반영된 값. 단, **claim 응답을 못 받은 채 PATCH 가 stale 값으로 가는** 윈도우는 위 (1) 의 응답 스냅샷 적용으로 줄임. |

---

## 클라이언트 UI

### 진입점

- **거래소 메인** — 새 상위 탭 `거래소`. 어디서든 listing 조회·구매·등록 가능. 자기 등록 목록도 여기서 확인.
- **우편함** — `마을` 탭 안의 sub-view (`상점` / `치유소` 와 같은 EntryCard 패턴). 마을 안에 있을 때만 접근/수령 가능 — 우편을 마을에서 받는다는 자연스러운 게임 내 설정.

### 메인 거래소 탭 — 구조

```
┌───────────────────────────────────────────┐
│ [장비] [재료]    검색: [_______]  [정렬▾] │
├───────────────────────────────────────────┤
│  🗡️ 강철검  ×1  | 1500G | 모험가A | 구매 │
│  🌿 약초    ×5  |  500G | 모험가B | 구매 │
│  ...                                      │
├───────────────────────────────────────────┤
│ [내 등록 목록]                             │
└───────────────────────────────────────────┘
```

- 상단: 카테고리 탭(장비/재료) + 검색 + 정렬(가격↑↓ / 최신).
- 본문: 무한 스크롤 또는 페이징. 자기 listing 은 "취소" 버튼.
- 하단 sub-view 진입: "내 등록 목록".
- 헤더에 우편함 인디케이터(N) 보이지만, 클릭하면 **마을 탭의 우편함 sub-view 로 이동** (마을이 아니면 "마을에 들러 우편을 받으세요" 토스트).

### 등록 모달

- 인벤토리에서 거래 가능한 카테고리(장비/재료)만 표시 → 선택.
- 수량(재료만) + 가격 입력.
- 미리보기: "수수료 5% 차감 후 ___ G 수령 예정"
- "등록" 클릭 → POST → 성공 시 모달 닫고 listing 목록 갱신.

### 우편함 표시 (마을 탭)

- **위치**: `마을` 탭의 EntryCard 목록에 `우편함` 추가. 안 읽은 N 개 있으면 카드에 빨간 점 또는 `(N)` 배지.
- **접근 조건**: 현재 region 이 town(`tags.includes("town")`) 일 때만 카드 표시. 마을 밖에서 접근 불가.
- **폴링**: 30초 간격 `GET /api/marketplace/inbox`. 또는 마을 탭 진입 시·거래소 탭 진입 시 1회.
- **Sub-view**: 항목 목록 + 각 항목에 "수령" 버튼 + "전체 수령" 버튼.
- **수령 후 토스트**: "🪙 +950 G 받음", "🌿 약초 5개 받음" 등.

```
마을 탭 진입 시 EntryCard 들:
  🏥 치유소
  🛒 상점
  🏋️ 훈련장
  🔨 제작
  🛡️ 길드
  📬 우편함  (3)         ← 신규
```

### 거래 가능 아이템 필터링

- 인벤토리에서 등록 가능 = `quantity > 0` 인 equipment / material.
- **제외 조건**:
  - 현재 장착 중 장비 (character.v2.equipped 와 매칭되는 ItemId): UI 에서 회색 + 툴팁 "장착 해제 후 등록 가능".
  - 시작 장비/퀘스트 보상 등 거래 금지 마킹된 아이템 (data 정의에 `tradable: false` 플래그 추가).

---

## API 정리

| Method | Path | 설명 |
|---|---|---|
| GET    | `/api/marketplace/listings` | 검색·필터링 |
| POST   | `/api/marketplace/listings` | 등록 |
| DELETE | `/api/marketplace/listings?id=N` | 취소 |
| POST   | `/api/marketplace/listings/buy` | 구매 |
| GET    | `/api/marketplace/inbox` | 수령 대기 목록 |
| POST   | `/api/marketplace/inbox/claim` | 수령 |

모든 라우트는 기존 패턴대로 `ensureUser()` 로 인증.

---

## 데이터 정의 추가

### `Item` / `Material` 에 거래 가능 플래그

`src/adventure/data/items.ts`, `materials.ts` 의 각 정의에:

```ts
{
  id: "mom_amulet",
  name: "엄마의 부적",
  // ...
  tradable: false,    // 거래 금지 (서사 아이템, 시작 장비 등)
}
```

기본값은 `true`. 서버측 등록 검증 시 `tradable === false` 면 400.

---

## 환경/패키지 변경

### 신규 의존성

없음 (기존 drizzle/postgres 재사용).

### 마이그레이션

```bash
# drizzle-kit 으로 스키마 push
npx drizzle-kit push
```

### 디렉토리 추가

```
src/
  app/api/marketplace/
    listings/route.ts       # GET / POST / DELETE
    listings/buy/route.ts   # POST
    inbox/route.ts          # GET
    inbox/claim/route.ts    # POST
  adventure/marketplace/
    MarketplaceTab.tsx      # 메인 UI
    ListingsView.tsx        # 검색·목록
    MyListingsView.tsx      # 내 등록 목록
    InboxView.tsx           # 우편함
    ListingCreateModal.tsx  # 등록 모달
    api.ts                  # fetch 헬퍼
    types.ts                # Listing/InboxItem 타입
  db/schema.ts              # marketplaceListings, marketplaceInbox 추가
```

---

## 릴리스 단계 (PR 분할 제안)

1. **PR 1 — 스키마 + 데이터 플래그**: `marketplace_listings` / `marketplace_inbox` 테이블 추가, items/materials 에 `tradable` 플래그 추가, 마이그레이션. 기능 노출 없음.

2. **PR 2 — 등록 / 검색 API + UI**: `POST /listings`, `GET /listings`, `DELETE /listings`. 거래소 탭 + 검색 + 등록 모달 + 내 등록 목록. 구매는 아직 X.

3. **PR 3 — 구매 + 우편함**: `/listings/buy`, `/inbox`, `/inbox/claim`. 우편함 UI + 수령 흐름 + 헤더 인디케이터. 거래 1회 종단 흐름 동작.

4. **PR 4 — UX 다듬기**: 폴링/실시간 갱신, 토스트, 에러 모달(이미 판매됨/골드부족), 자기 listing 회색 처리, 거래 금지 아이템 표시.

5. **PR 5 — Admin 도구**: `/admin` 에 "거래소" 탭 — listing 강제 취소, 우편함 강제 수령, 수상한 가격 모니터링.

각 PR 머지 시 게임은 정상 동작. PR 1~2 머지 시점엔 등록은 되지만 아무도 살 수 없음(베타 전 dogfooding 단계로 활용 가능).

---

## 테스트 시나리오

1. **등록 → 구매 종단** — A 가 강철검 1500G 등록 → B 가 구매 → A 우편함에 1425G(95%), B 우편함에 강철검. 양쪽 수령 → 인벤/골드 반영.
2. **자기 listing 구매 차단** — A 가 등록한 걸 A 가 구매 시도 → 400.
3. **동시 구매 race** — 같은 listing 을 B/C 가 거의 동시 구매 → 한 명만 200, 다른 한 명 409.
4. **골드 부족** — gold=100 인 buyer 가 1500G listing 구매 → 400.
5. **장착 중 장비 등록 차단** — 장착한 강철검 등록 시도 → 400.
6. **거래 금지 아이템** — 엄마의 부적(tradable=false) 등록 → 400.
7. **취소 후 환불** — 등록 취소 → 우편함에 cancel_return → 수령 → 인벤 복귀.
8. **슬롯 한도** — 10개 등록 후 11번째 → 400.
9. **인벤 부족** — 약초 3개 보유 상태에서 5개 등록 시도 → 400.
10. **재료 풀스택** — 5개 등록 후 buyer 가 사면 5개 통째로 전달.
11. **새로고침 / 세션 끊김 직후 재진입** — 진행 중이던 거래의 우편함이 보이는지.
12. **수령 race** — 같은 inbox row 를 두 탭에서 동시 수령 → 한쪽만 처리, 다른 쪽 빈 결과.
13. **수령 후 PATCH 충돌 없음** — 수령 → 응답 스냅샷 적용 → 다음 PATCH 가 같은 값을 보내 → 정합성.
14. **등록 직후 같은 아이템 사용 시도** — 인벤 차감이 즉시 반영돼서 사용 불가.

---

## 후속 (이번 기획 범위 밖)

- **경매** — 입찰 + 종료 시간. cron 으로 만료 처리, 1위 입찰자에 자동 낙찰.
- **분할 구매** — 재료 5개 listing 에서 2개만 구매. price 를 단가로 저장하고 구매 시 quantity 입력.
- **거래 히스토리** — 같은 아이템의 최근 N건 평균/최저/최고가 표시, 차트.
- **listing 만료** — 7일 후 자동 취소 → 우편함 환불. cron job.
- **검색 인덱스** — pg_trgm 또는 FTS 도입해 부분일치 성능 개선 (현재 ILIKE 는 N=10k 부터 느려질 수 있음).
- **거래 가능한 새 카테고리** — 포션, 제작서, 장식 아이템 등.
- **NPC 자동 마켓 메이커** — 시세 안정용 NPC 가 정해진 가격에 매수/매도.
- **신고 / 가격 어뷰징 모니터링** — 비정상 가격(예: 1G에 끝판왕 장비) 자동 감지 + admin 알림.
- **친구한테 직접 거래** — 1:1 trade window. (전혀 다른 흐름 — 별도 기획)
- **거래소 수수료를 게임 내 골드 싱크로 활용한 경제 통계** — 수수료 누적 표시, 인플레이션 모니터링.

---

## 비용 영향

| 자원 | 영향 |
|---|---|
| Postgres 행 수 | listing 활성 N + sold/cancelled 누적. 누적 정리 cron 도입 시점에 의해 결정. |
| Postgres I/O | 검색 쿼리당 인덱스 lookup + 페이지당 30 row. 무료 티어 한도 내 충분. |
| Vercel Functions | 거래소 진입 시 listings GET, 구매/등록 시 1 호출. Hobby 무료 한도 내. |
| 폴링 비용 | inbox 30초 폴링 — 전체 활성 사용자 × 2 req/min. SSE / Server-Sent Events 로 옮길 시점은 MAU 1k+. |

---

## 미해결 / 고민 거리

- **inbox 만료** — 영구 보관이면 DB 가 계속 쌓임. 수령된 row 는 90일 후 cron 으로 archive 또는 delete.
- **listing sold/cancelled 행 정리** — 분석용으로 둘지, 30일 후 archive 할지.
- **수수료를 정수 floor 로 처리하면 1G listing 의 수수료가 0G** — 최소 수수료 1G 또는 가격 하한 적용 검토.
- **검색 성능** — 활성 listing 수가 수만 건 넘어가면 ILIKE 가 느려짐. 그 시점에 pg_trgm 인덱스 추가.
- **닉네임 변경 후 등록 시점 스냅샷이 stale** — `seller_name` 은 표시용이라 OK. 다만 사용자가 "이 사람 누구지" 헷갈릴 수 있음 → seller_id 기반으로 현재 닉네임 조회하는 옵션도 검토.
