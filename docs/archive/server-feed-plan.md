# 전체 소식 (서버 피드) 계획

> 상태: ✅ **구현 완료 (v1)** — 전체 소식(서버 피드) 출고. 일부 항목 v2 보류. 이 문서는 설계 기록.

> 유니크 드랍·걸작 제작 성공·마일스톤 같은 **자랑할 만한 순간**을 서버 전체에 보여주는 패널.
> 글로벌 채팅에 섞으면 혼잡 → **모험탭 맨 아래에 별도 "전체 소식" 패널**(append-only 피드, 폴링 갱신).
> 채팅은 대화용 / 이건 서버 전광판용 — 역할 분리.

---

## 0. 한눈에

| 항목 | 결정 / 추천 |
|---|---|
| 위치 | 모험탭 하단, `RecentLogView`(내 최근 로그) 바로 아래 형제 패널 |
| 형태 | ticker 아님. **최근 N개(~20) 고정 리스트**, 접기/펼치기(기본 접힘 또는 3줄) |
| 갱신 | 폴링 — 채팅 폴링 인프라 재사용 (`since` 커서) |
| 저장 | 새 테이블 `server_feed` (append-only, 오래된 행 정리) |
| 쓰는 쪽 | unique 드랍 / 걸작 제작 성공 처리 지점에서 `insert` (협동 보스 broadcast 패턴과 동일) |
| 노이즈 컨트롤 | **희소한 것만** + 송신자 opt-out 토글(기본 ON) + 같은 유저 디바운스 |
| 출시 순서 | v1: unique 드랍 + 걸작 제작 → v2: 마일스톤·협동 보스 통합 |

---

## 1. 왜 이 구조인가 — 이미 있는 것 재사용

| 필요한 것 | 이미 있는 것 |
|---|---|
| 서버 이벤트를 클라에 흘리기 | 협동 보스 spawn/kill **채팅 broadcast** (`feat(coop-boss): spawn 시 채팅 broadcast`) — insert 패턴 그대로 |
| 폴링 + 낙관적 갱신 + 패널 열림 시 가속 | 글로벌 채팅 폴링 (`feat(chat): 낙관적 전송 + 패널 열림 시 폴링 가속`) |
| 모험탭 하단 로그 패널 UI | `RecentLogView` — 형제로 `ServerFeedView` 추가 |
| 알림 종류 분리 원칙 | `feat(notify): 알림 종류 분할 — milestone/expedition/loot` — 남의 자랑은 **벨에 안 넣음**, 피드 패널에만 |
| unique 드랍 감지 + 배너 | `feat(items): 유실된 명품 — 잡몹 unique 드랍 + 굉장한 발견 배너` — 배너 띄우는 그 자리에서 피드 insert도 |

---

## 2. 무엇이 피드에 올라가나

**v1**
- `○○ 님이 [유실된 명품 — 망령검] 획득` — unique 드랍
- `○○ 님이 걸작 제작 성공 — [정련된 화염갑]` — masterpiece 등급 제작 성공

**v2 (통합)**
- `○○ 님이 만렙 70 달성`
- `○○ 님이 봉황령 클리어` 등 지역/스토리 마일스톤
- 협동 보스 spawn/kill — 현재 채팅으로 가는데 피드에도(또는 피드로 이전). spawn 은 "모이세요" 신호라 채팅+피드 둘 다 유지, kill 은 피드만으로 충분

**올리지 않는 것**
- 흔한 품질(정교한/빼어난 등) 드랍·제작 — 도배 원인 1순위
- 일반 전투 승패, 일상 진행 — 그건 개인 `RecentLogView` 몫
- 남의 소식을 **벨 알림에 누적**하는 것 — 벨은 "내 일"만. 피드는 흘러가는 거라 부담 없지만 벨은 쌓여서 짜증

---

## 3. 데이터

### 테이블 `server_feed` (append-only)

| 컬럼 | 타입 | 비고 |
|---|---|---|
| `id` | serial / bigint PK | 폴링 커서로도 사용 (`since=lastId`) |
| `ts` | timestamptz default now() | |
| `type` | text | `unique_drop` \| `masterpiece` \| `milestone` \| `coop_boss` ... |
| `actorName` | text | 표시용 닉네임 스냅샷 (채팅 메시지와 동일하게 비정규화) |
| `payload` | jsonb | type 별 — 예: `{ itemId, itemName, rarity }`, `{ regionId }` |

- 채팅 메시지 테이블 구조를 거의 그대로 베껴옴.
- 정리: cron 또는 insert 시 트림 — 최근 ~500행만 유지하거나 `ts < now() - interval '7 days'` 삭제. (협동 보스 세션 정리 패턴 참고)
- drizzle 마이그레이션 1개.

### 송신자 opt-out

- 프로필 설정에 `shareFeed: boolean` (기본 `true`).
- insert 직전에 체크 — false면 skip. (서버 권위 — `derivePlayerCombatFromSaves` 처럼 저장된 프로필 읽는 자리에서)

---

## 4. API

- `GET /api/feed?since=<lastId>` → `{ entries: FeedEntry[], lastId }`
  - `since` 없으면 최근 N개. 채팅의 `GET /api/chat` 라우트 거의 복붙.
- 쓰기는 별도 라우트 없음 — 게임 로직 서버 코드(드랍 처리 / 제작 처리)에서 직접 `insertFeedEntry(...)` 헬퍼 호출.

### `insertFeedEntry` 헬퍼

```ts
// src/adventure/notifications/serverFeed.ts (서버)
export async function insertFeedEntry(
  userId: string,
  type: FeedType,
  payload: FeedPayload,
): Promise<void> {
  // 1. 프로필 shareFeed 체크 → false면 return
  // 2. 같은 userId+type 디바운스 (최근 60s 내 동일 항목 있으면 skip)
  // 3. insert + 오래된 행 트림
}
```

호출 지점:
- unique 드랍 확정되는 곳 (현재 "굉장한 발견 배너" 트리거 위치)
- 제작 성공 + 등급이 masterpiece인 곳

---

## 5. UI — `<ServerFeedView>`

- `src/adventure/log/ServerFeedView.tsx` (또는 `notifications/` 아래).
- `AdventureScreen` 에서 `RecentLogView` 바로 아래 렌더.
- 폴링 훅 — `useServerFeed()`: 패널 닫혀 있을 때 느린 폴링(30~60s), 펼쳐지면 가속(채팅 패턴 그대로). 단순화하려면 v1은 그냥 30s 고정.
- 항목 렌더: 아이콘(type별) + `actorName` + 문구 + 상대시간(`3분 전`).
- 접기/펼치기 — 기본 접힘, 헤더에 새 항목 개수 뱃지(`전체 소식 ·3`).
- v2: 아이템 항목 클릭 → 아이템 툴팁/상세. v1은 텍스트만.

---

## 6. 스코프

### v1 (하루치)
1. `server_feed` 테이블 + drizzle 마이그레이션
2. `insertFeedEntry` 헬퍼 (shareFeed 체크 + 디바운스 + 트림)
3. unique 드랍 / 걸작 제작 성공 두 군데에 `insertFeedEntry` 연결
4. `GET /api/feed?since=` 라우트
5. `useServerFeed` 훅 + `<ServerFeedView>` — `RecentLogView` 아래 배치, 접기/펼치기
6. 프로필 설정에 `shareFeed` 토글 (기본 ON)

### v2
- 마일스톤(만렙/지역 클리어) 피드 항목
- 협동 보스 spawn/kill 을 채팅 → 피드로 (or 양쪽)
- 아이템 항목 클릭 상세
- 폴링 가속(패널 열림 시)

---

## 7. 열린 결정

1. **피드 항목 클릭 상세** — v1에 넣을지 v2로 미룰지. (추천: v2)
2. **협동 보스 broadcast 처리** — 채팅 유지 / 피드 이전 / 양쪽. (추천: spawn 은 양쪽, kill 은 피드만)
3. **트림 정책** — 행 수 기준(~500) vs 기간 기준(7일). (추천: 행 수 — 활동량 변동에 강함)
4. **패널 기본 상태** — 접힘 vs 3줄 미리보기. (추천: 3줄 미리보기 — 발견 가능성)

---

## 8. v1 구현 메모 (feat/server-feed)

§6 v1 그대로 구현. 위 열린 결정은 ③(행 수), ④(접힘+3줄 미리보기)로 확정. ①②는 v2.

- **스키마**: `server_feed` 테이블 + `users.share_feed` 컬럼 (`drizzle/0013_famous_tombstone.sql`).
- **`src/lib/feed-config.ts`**: `FEED_FETCH_LIMIT=20` / `FEED_MAX_ROWS=500` / `FEED_DEBOUNCE_MS=60s` / `FEED_POLL_MS=30s`, `FeedType`/`FeedEntry` 타입.
- **`src/lib/server/serverFeed.ts`**: `insertFeedEntry(userId, type, payload)` — share_feed 체크 → 디바운스 → actorName 해석(gameName→profile→"이름 없는 모험가") → insert → trim. 내부 self-catch (부수 효과).
- **`src/app/api/feed/route.ts`**: `GET` 최근 항목+share, `POST` 클라 보고(`unique_drop`만, rarity 재검증), `PATCH` share 토글.
- **이벤트 연결**:
  - 걸작 제작 → `/api/craft` 에서 `result.tier === 2` 일 때 (서버 권위).
  - 위탁 사냥 유실된 명품 → `/api/hunt/collect` 정산 결과의 `equipsGained` 중 unique (서버 권위, replay/noop 제외).
  - 라이브 전투 유실된 명품 → `onBattleEnd` → `reportUniqueDrop()` (`src/lib/clientFeed.ts`) → `POST /api/feed` (fire-and-forget).
- **UI**: `src/adventure/log/ServerFeedView.tsx` — 모험탭(`AdventureScreen`) 최하단. 기본 접힘(최근 3개 미리보기), 펼치면 전체 20개 + "내 소식 공유" 토글. visibility-hidden 시 폴링 멈춤, focus 시 즉시 갱신.

v1 에서 뺀 것: "N개 새 소식" 뱃지, 항목 클릭 상세, 마일스톤/협동 보스 통합, `since` 커서 폴링 → v2.

알아둘 것: `drizzle/meta/0012_snapshot.json` 이 원래부터 누락돼 있어(0012 가 손으로 작성됨) `db:generate` 가 0013 에 무관한 `DROP INDEX guild_quest_active_unique_idx` 를 끼워 넣어서 SQL 에서 제거함. `0013_snapshot.json` 은 현재 스키마를 정확히 반영.
