# 제작서 공유 + 거래소 개선 설계

> 상태: ✅ **구현 완료** — 제작서 공유 + 거래소 개선 출고. 이 문서는 설계 기록.

> 유저들이 알고 있는 제작서를 다른 유저에게 공유할 수 있게 한다.
> 두 채널: **거래소 판매** (option 1) + **우편 첨부** (option 2).
>
> 부수로 거래소 일반 개선 — **매물 등록 시간 표시** + **24시간 자동 유찰 → 판매자 우편 환불** 도 같이 작업.

## 목표 / 설계 원칙

1. **두 채널 동시 지원** — 거래소(가격 형성) + 우편(무료 직접 전달).
2. **이미 알고 있는 제작서 = silent no-op** — 골드/시간 손실 X. 가능한 한 사전 차단, 불가피한 경우 사후 silent skip.
3. **기존 인프라 최대 재활용** — `marketplaceListings` 와 `marketplaceInbox` 테이블 확장만으로 처리.
4. **레시피 = 지식, 인벤토리에 안 쌓임** — quantity 항상 1, 학습되면 사라짐.
5. **거래 가능 여부는 데이터에 표기** — `Recipe.tradable?: boolean`. 미지정/true 면 가능. 퀘스트 전용 레시피 등은 향후 false 로 막기.

---

## DB 스키마 변경

### `marketplaceListings`
- 기존: `itemKind: 'equip' | 'material'`
- 추가: `'recipe'`
- 의미 매핑:
  - `itemKind='recipe'` → `itemId = recipeId`
  - `itemName` = 등록 시점 레시피명 스냅샷 (예: "끈끈이 망토 제작서")
  - `quantity` = **항상 1** (서버에서 강제)
- 인덱스/스키마 자체는 **변경 불필요** (text 필드라 새 값만 추가)

### `marketplaceInbox`
- 기존 `kind`: `sale_proceeds | purchase_item | cancel_return | user_message`
- 추가: **`recipe_gift`** (직접 우편 선물) + **`recipe_purchase`** (거래소 구매 결과)
- payload 형식:
  - `recipe_gift`: `{ recipe_id: string, recipe_name: string }`
  - `recipe_purchase`: `{ recipe_id: string, recipe_name: string }`
- `fromUserId`/`fromName`: gift 는 사용자 발송, purchase 는 NULL (시스템)
- 스키마 자체 변경 불필요.

> **Drizzle migration 불필요** — 모두 text/jsonb 필드 안에서 새 값만 추가.

---

## API

### POST `/api/marketplace/listings` (기존)
**확장**:
- `itemKind === 'recipe'` 분기 추가:
  - 검증: `recipeId` 가 `RECIPES` 에 존재하는지
  - 검증: `Recipe.tradable !== false`
  - 검증: 판매자가 해당 recipeId 를 알고 있는지 (saves_kv `crafting.v2` 의 `known` 배열)
  - **차감 없음** — 레시피는 인벤토리에서 빠지지 않음 (지식이라 본인은 계속 보유)
  - 슬롯 한도(`MARKETPLACE_SLOT_LIMIT = 10`) 는 기존 룰 그대로 적용

### POST `/api/marketplace/listings/buy` (기존)
**확장**:
- 트랜잭션 내부에서:
  1. listing 조회 (`FOR UPDATE`)
  2. `itemKind === 'recipe'` 면:
     - **사전 차단**: 구매자 `crafting.v2.known` 에 이미 `recipeId` 있으면 → `400 already_known` 반환, 골드 차감 X, listing 상태 X
     - 통과 시: 골드 차감 → listing `sold` 처리 → `marketplaceInbox` 에 `recipe_purchase` 한 건 INSERT
  3. 기존 `equip/material` 분기는 그대로

> **주의**: `crafting.v2` 는 saves_kv 라 약간 stale 가능. race window 에서 거래 → 우편 학습 시 **inbox claim 단계의 idempotency** 가 마지막 안전망.

### POST `/api/inbox/send` (사용자 쪽지 발송 — 기존)
**확장**:
- 기존 페이로드: `{ to_user_id, text }`
- 추가 옵션: `{ to_user_id, text, attached_recipe_id?: string }`
- 검증:
  - `attached_recipe_id` 가 `RECIPES` 에 있고 `tradable !== false` 인지
  - 발송자가 해당 레시피를 알고 있는지
- 처리:
  - 1건의 inbox row 생성, `kind='recipe_gift'`, `payload={recipe_id, recipe_name}`, `message=text`, `from_user_id=발송자`
  - 기존 user_message 의 rate limit 동일 적용

### POST `/api/marketplace/inbox/claim` (기존)
**확장**:
- `recipe_gift` / `recipe_purchase` 처리:
  - 응답에 `recipesAdded: string[]` 항목 추가
  - 클라이언트가 응답 받고 `crafting.learnRecipe(id)` 호출 (idempotent)

---

## 클라이언트 변경

### 1. ListingCreateModal — 카테고리 추가
- 등록 가능 카테고리 셀렉터에 "제작서" 추가
- 선택 시: 본인 `crafting.state.known` 에서 알고 있는 레시피 목록 표시 (`tradable !== false` 만)
- 가격 입력은 동일

### 2. ListingsView — 표시
- 제작서 listing 은 책 아이콘 + "📜 X 제작서" 표시
- "이미 알고 있는 제작서" 면 구매 버튼 disabled + "이미 알고 있음" 라벨 (사전 차단)

### 3. SendMessageModal (기존 쪽지 모달) — 첨부 옵션
- "제작서 첨부" 토글
- 토글 ON 시: 본인이 아는 레시피 드롭다운
- 무료 (gift)

### 4. InboxView — 수령
- `recipe_gift`/`recipe_purchase` 항목 표시: "📜 X 제작서 — Y 유저로부터 받음" / "📜 X 제작서 — 거래소"
- 수령 버튼 클릭 → `claim` 호출 → 응답의 `recipesAdded` 로 학습
- **이미 알고 있는 경우의 silent 처리**:
  - 1차: 받은 즉시 `crafting.knows(id)` 확인. 알면 카드에 "이미 보유 — 폐기" 식 표시 + 자동 폐기 버튼
  - 2차 (race): claim 호출 시 서버는 일단 inbox row 만 claim 처리, 클라이언트는 학습 시도 → idempotent. 토스트는 "이미 알고 있는 제작서입니다" 한 줄만.

### 5. CraftingView — 변화 없음
- 학습된 레시피는 자동으로 표시됨 (기존 로직 그대로)

---

## Idempotency 매트릭스

| 시점 | 행위 | 동작 |
|---|---|---|
| 등록 시 | 본인 모르는 레시피 등록 시도 | 차단 (`400 not_known`) |
| 등록 시 | `tradable=false` 레시피 | 차단 (`400 not_tradable`) |
| 구매 시 | 본인 이미 아는 레시피 | **차단** (`400 already_known`) — 골드 안 빠짐, listing 그대로 active |
| 구매 시 (race) | UI 통과했으나 서버 검증 사이 학습됐음 | 위와 동일 차단 — 골드 안 빠짐 |
| Inbox 수령 시 | 이미 아는 레시피가 우편으로 옴 | claim 처리는 진행(우편 정리), 학습은 idempotent skip, 토스트 "이미 알고 있는 제작서입니다" |
| 우편 보내기 시 | 받는 사람이 알고 있는지 | **확인 안 함** (보내는 측이 알 수 없음 — 받는 쪽 silent skip 으로 처리) |

---

## 데이터 정의 변경

### `Recipe` 타입 (recipes.ts)
```ts
export type Recipe = {
  id: string;
  name: string;
  description: string;
  ingredients: RecipeIngredient[];
  result: RecipeResult;
  // 거래소/우편 공유 가능 여부. 미지정/true → 가능.
  // 퀘스트·NPC 전용 레시피에 false 로 막을 수 있음.
  tradable?: boolean;
};
```
- 기존 4개 일반 레시피는 모두 미지정 (= true).
- 향후 마린의 보상 레시피 등은 `tradable: false` 검토.

### 클라이언트 헬퍼 (server/marketplace.ts)
```ts
export type ItemKind = "equip" | "material" | "recipe";

export function isItemKind(s: string): s is ItemKind {
  return s === "equip" || s === "material" || s === "recipe";
}

export function getRecipeDef(id: string): Recipe | undefined { ... }

export function isTradable(kind: ItemKind, id: string): boolean {
  if (kind === "recipe") {
    const def = getRecipeDef(id);
    return def !== undefined && def.tradable !== false;
  }
  // ... 기존 분기
}
```

### 인벤토리 차감 / 환불 로직
- 레시피는 인벤토리 카테고리 없음 → `deductFromCategory` 호출 X
- 거래 취소 시 환불도 없음 (애초에 차감 안 했으니)
- 등록 후 취소: 단순 status 변경만 (close + cancelled)

---

## UI 흐름 시퀀스

### A. 거래소 — 등록 → 구매 → 학습
```
[판매자]                          [DB]                          [구매자]
  └─ ListingCreateModal
       └─ 카테고리 "제작서" 선택
       └─ "끈끈이 망토 제작서" 선택
       └─ 가격 1000 G
       └─ 등록 ─────────────────► listings INSERT
                                                                 ListingsView 새로고침
                                                                  └─ 카드 표시
                                                                  └─ "구매 (1000 G)" 클릭
                                                                  └─ BuyConfirmModal
                                                                  └─ 확인
                                  buy API ◄──────────────────────┘
                                  ├─ FOR UPDATE listing
                                  ├─ 구매자 known 검사
                                  │    ├─ 이미 알면 400 (silent UI alert)
                                  │    └─ 모르면 진행
                                  ├─ 골드 차감
                                  ├─ status='sold'
                                  └─ inbox INSERT (recipe_purchase)
                                                                 InboxView
                                                                  └─ "📜 끈끈이 망토 제작서" 카드
                                                                  └─ 수령
                                                                       └─ claim → recipesAdded
                                                                       └─ learnRecipe (idempotent)
                                                                       └─ 토스트 "끈끈이 망토 제작서를 익혔다"
```

### B. 우편 선물
```
[발송자]                          [DB]                          [수신자]
  └─ SendMessageModal (쪽지)
       └─ 받는 사람 닉네임
       └─ 메시지 "이거 한 번 써봐"
       └─ "제작서 첨부" ON
       └─ 끈끈이 망토 선택
       └─ 보내기 ──────────────► inbox INSERT (recipe_gift, payload, message, fromUserId)
                                                                 InboxView
                                                                  └─ "📜 ... — Lucky 로부터"
                                                                  └─ (이미 알면) 카드에 "이미 보유" + 폐기
                                                                  └─ (모르면) 수령 → learnRecipe
```

---

## 마이그레이션 / 호환성

- DB 스키마 변경 없음 → 기존 행 영향 X
- 기존 클라이언트가 새 `kind='recipe_gift'` inbox 를 만나면 `summarizePayload` 분기에서 "(알 수 없는 우편)" 표시 — 무해. 단 **클라이언트 강제 업데이트는 권장**.
- 기존 4개 레시피는 자동으로 tradable (미지정 = true).

---

## 향후 확장 후보 (이번 PR 에서는 X)

- 거래소 검색 필터: 카테고리 = 제작서
- 제작서 카드에 "결과 장비 미리보기" (스탯/아이콘)
- 인기 제작서 통계 (매출 ↓ 정렬)
- 우편 첨부 비용 부과 (스팸 방지)
- "제작서 사본" 시스템 (option 4) — 별도 PR

---

## 작업 분량 (추정)

| 단계 | 변경 파일 | 시간 |
|---|---|---|
| 데이터 타입 (Recipe.tradable, ItemKind 확장) | `recipes.ts`, `lib/server/marketplace.ts` | 30m |
| API: listings POST 분기 | `app/api/marketplace/listings/route.ts` | 30m |
| API: buy 분기 + already_known 검사 | `app/api/marketplace/listings/buy/route.ts` | 45m |
| API: inbox/send 첨부 옵션 | `app/api/inbox/send/route.ts` | 30m |
| API: inbox/claim 분기 + recipesAdded | `app/api/marketplace/inbox/claim/route.ts` | 30m |
| 클라이언트: ListingCreateModal 카테고리 | `marketplace/ListingCreateModal.tsx` | 30m |
| 클라이언트: ListingsView 표시 + already_known UX | `marketplace/ListingsView.tsx`, `BuyConfirmModal.tsx` | 30m |
| 클라이언트: InboxView 처리 | `marketplace/InboxView.tsx` | 30m |
| 클라이언트: SendMessageModal 첨부 | `inbox/SendMessageModal.tsx` (사용자 쪽지 모달) | 45m |
| 검증 + 테스트 | tsc/lint/test | 20m |
| **총** | | **약 4.5h** |

---

## 결정 사항 (확정)

1. **거래소 가격 범위** → 자유 (`MIN=1`, `MAX=999,999,999` 그대로). 추후 재조정.
2. **우편 첨부 비용** → 무료. 추후 재조정 가능성 열어둠.
3. **이미 아는 제작서 받았을 때** → 토스트 한 줄 표시 ("이미 알고 있는 제작서입니다").
4. **`tradable: false` 적용 대상**:
   - **시작 장비** (나무 막대 / 천 옷 / 엄마가 준 부적) — 이미 EquipItem 에 `tradable: false`.
   - **NPC 보상 / 퀘스트 전용 장비** — 예비 손도끼 (이미 false).
   - **제작서 측**: 일단 현재 모든 레시피는 거래/우편 가능 (`Recipe.tradable` 미지정 = true). 추후 마린의 보상 등 추가 시 case-by-case false.
   - **매물 등록 시 검증** = `equip` 은 `EquipItem.tradable !== false`, `material` 은 `Material.tradable !== false`, `recipe` 는 `Recipe.tradable !== false`.

---

## 추가 요건 — 거래소 일반 개선

### A. 매물 등록 시간 표시
- 카드에 `등록 시각` / `경과 시간` 표시.
- 표기 형식 (제안):
  - 1시간 이내: `방금 전` / `12분 전`
  - 24시간 이내: `3시간 전`
  - 그 이상: `1일 전` / `2일 5시간 전` (만료 24h 룰과 함께 — 그 이상 잔존 안 함)
- 데이터 소스: `marketplaceListings.createdAt` (이미 있음, 추가 변경 X)
- 표시 위치: `ListingCard` 카드 우측 상단 또는 가격 옆 작은 회색 텍스트
- 헬퍼: `lib/format.ts` 의 `formatDuration` 활용 또는 `formatRelativeTime` 신규 추가

### B. 24시간 자동 유찰 + 판매자 우편 환불

#### 룰
- `marketplaceListings.status === 'active'` AND `createdAt + 24h < now` → **유찰 처리**.
- 처리:
  1. 트랜잭션 내부에서 listing `status` → `'expired'` (신규 status 추가), `closedAt = now`
  2. 판매자 inbox 에 환불 우편 INSERT
     - `kind = 'cancel_return'` 재활용 (기존 취소 환불과 의미 동일 — 등록 분이 판매자에게 돌아감)
     - 또는 신규 `'listing_expired'` kind 추가 (메시지 차별화 용이) — **권장**
     - payload: `{ item_kind, item_id, quantity }` (기존 cancel_return 와 동일 형식)
     - message: `"24시간 이내 거래되지 않아 매물이 회수되었습니다."`

#### 트리거 메커니즘 (옵션 정리)
- (a) **Lazy expire on read** — 거래소 listings GET 시 만료된 것 sweep 처리 후 응답. 트래픽 있을 때만 작동.
- (b) **Vercel Cron / 정기 sweep** — 별도 cron 으로 N분 주기. 트래픽 무관.
- (c) **하이브리드** — read 시 sweep + 옵션으로 cron.

> **추천: (c) 하이브리드** — 평소엔 read sweep (즉시성), cron 은 새벽에 1회 정도 (오랜 기간 트래픽 없을 시 안전망).
> 또는 (a) 만으로도 충분 — 거래소 페이지 들어가는 유저가 거의 항상 있을 것이라면.
> v1 은 (a) 만 — cron 은 추후.

#### 새 status 값
- `'active'` | `'sold'` | `'cancelled'` | **`'expired'`** (신규)
- DB 스키마 변경 X (text 필드)
- 클라이언트 표시 분기 (admin marketplace tab 등)에 'expired' 추가 처리

#### 신규 inbox kind
- `'listing_expired'` 추가
- payload 형식: `{ item_kind, item_id, quantity }` (= cancel_return 와 동일)
- 클라이언트 `summarizePayload` 에 분기 추가:
  - "⏰ 유찰 — 끈끈이 망토 제작서 회수"

#### Recipe listing 의 유찰 환불은?
- 레시피는 인벤토리에 안 쌓임 → "환불할 인벤토리 분량 없음"
- 환불 우편을 만들 필요 없음 (걍 expired 만 처리)
- 또는 알림용 inbox row 만 생성 (payload 비우거나 단순 메시지) — 판매자가 "유찰됨" 인지하도록
  - 권장: `kind='listing_expired'`, `payload={ item_kind: 'recipe', item_id, quantity: 0 }`, message="레시피 매물이 24시간 이내 거래되지 않아 회수되었습니다."

---

## 추가 작업 분량

| 단계 | 변경 파일 | 시간 |
|---|---|---|
| 등록 시각 표시 헬퍼 + ListingCard | `lib/format.ts`, `marketplace/ListingsView.tsx` | 30m |
| Lazy expire sweep + 'expired' status | `app/api/marketplace/listings/route.ts` (GET) | 30m |
| inbox 'listing_expired' kind | `lib/server/marketplace-inbox.ts`, claim/inbox 분기 | 30m |
| 클라이언트 `listing_expired` 표시 | `marketplace/InboxView.tsx` | 15m |
| 검증 추가 | tsc/lint | 15m |
| **부수 총** | | **약 2h** |

**전체 작업량**: 4.5h (recipe sharing) + 2h (거래소 개선) = **약 6.5h**

---

## 구현 순서 (제안)

1. 데이터 타입 (Recipe.tradable, ItemKind 확장, listing status 'expired', inbox kind 'listing_expired')
2. 서버: 등록 / 구매 / 우편 발송 / 클레임 — recipe 분기 + already_known 검사
3. 서버: listings GET 에서 lazy expire sweep
4. 클라이언트: ListingCreateModal / ListingsView / SendMessageModal / InboxView
5. 검증 + 로컬 테스트
6. 커밋 (단일 PR 권장 — 두 기능이 같은 스키마/API 영역)
