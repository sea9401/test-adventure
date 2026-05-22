# 서버 권위 이전 (Server Authority) 계획

> 상태: 🟡 **부분 구현** — 다수 액션은 서버 권위로 이전됐으나, 클라 권위 전면 마이그레이션(감사 Theme D)은 큰 잔여로 진행 중.

> 골드·EXP·드롭·인벤토리·제작서·퀘스트 진행 같은 **자원/진행 변경**을 모두
> 서버 권위로 옮긴다. 클라이언트는 **의도(intent)를 보내고 결과를 받아 표시**할
> 뿐, 더 이상 자기 보유량을 PATCH 로 덮어쓰지 않는다.
>
> 동기는 안티치트 — 현재는 `useRemotePatch` 가 클라이언트가 만든 새 state 를
> 그대로 서버에 덮어써서, devtools 로 골드/EXP/드롭이 다 위조 가능하다.

---

## 결정 사항 (요약)

| 항목 | 결정 |
|---|---|
| 권위 모델 | **서버 권위 (source of truth flip)** — 인벤토리 패턴 |
| 진행 키 PATCH 권한 | `character.v2` / `inventory.v2` / `crafting.v2` / `quest-progress.v2` / `adventure-log.v2` 의 **클라이언트 PATCH 를 제거** |
| 클라이언트 동기화 방향 | 서버 응답 → 클라 state **replace** (부분 머지 아님) |
| 비-진행 키 | `map.v2` / `edge-unlocks.v2` / `storyFlags.v2` / `shop.unlocks.v1` / `character-profile.v2` / `training.v2` 는 **PATCH 유지** (자원 위조 위험 낮음) |
| 결정론 게임 로직 | `src/shared/` 로 추출 — 클라(애니메이션)·서버(권위 처리)가 같은 함수 import |
| 전투 검증 | **시드 기반 재현** — 클라가 시드 + 최종 state 보내면 서버가 같은 시드로 재계산 후 결과 일치 검증 |
| 오프라인 사냥 | **서버 측 tick** — `last_active_tick` 을 서버에 저장. 복귀 시 서버가 sim 돌려 보상 + 결과 페이로드 |
| 제작 / 상점 / 신전 / 훈련 / 퀘스트 수령 | 단발 트랜잭션 — `POST /api/<domain>/<action>` 로 권위 처리 |
| 마이그레이션 단위 | **도메인별 단계 진행** — 한 번에 한 키씩 권위 이전 (큰 폭 release-train 회피) |
| 응답 포맷 | 변경된 키만 부분 반환 — `{ character?: ..., inventory?: ..., ... }` |
| 멱등성 | 모든 액션 endpoint 에 `clientActionId` (uuid) 받아 중복 호출 차단 |
| 시간 기반 액션 | 클라이언트 시계 신뢰 안 함 — 서버 `Date.now()` 만 사용 |

---

## 목표

- 자원(골드·EXP·아이템·제작서) 증감을 **클라이언트가 직접 정할 수 없게** 한다.
- 클라이언트는 "제작했어요" 같은 **의도** 만 보내고, 서버가 검증 후 결과를 통보.
- 결과는 **단일 트랜잭션** — race / 부분 적용 / 중간 실패 가시화 없음.
- 기존 UX 지연 0ms 원칙은 유지 — 자원 변경이 사용자 입력 직후라면 응답 도착 후
  교체, 그 외(전투 중 자동 행동)는 서버 권위 결과로 일괄 반영.
- 안티치트 — devtools 의 state 조작이 서버 DB 에 반영되지 않게.

## 비목표

- **전투 엔진의 서버 측 실시간 구동** — 매 턴 round-trip 은 비용·UX 모두 비현실.
  대신 결정론 + 시드 기반 사후 검증.
- 비결정성 검증 (모션·애니메이션 정확도) — 보상 수치만 권위, 시각 효과는 클라 자유.
- 안티치트의 100% 보장 — 실시간 전투 영역에서 시드 위조까지 막는 것은 v1 에서
  하지 않음. "쉬운 위조" 차단이 목표.
- 비-진행 키 (`map.v2`, `storyFlags.v2`, `edge-unlocks.v2`, `shop.unlocks.v1`) —
  자원이 아니라 단순 진행 마커라 v1 권위 이전 대상 아님 (유저 본인이 자기
  진행을 앞당기는 것은 안티치트 우선순위 낮음).
- 디바이스별 환경 설정 (`theme`, `auto-potion-rules.v2`, `notification-prefs.v1`) —
  계속 디바이스 로컬.
- 멀티 디바이스 동시 접속 충돌 — 기존 last-write-wins + 60s reload 정책 유지.

---

## 핵심 패턴 — PATCH 와 서버 권위의 race 해결

현재 모든 진행 키는 클라이언트가 자기 state 를 정답으로 PATCH. 서버에서 직접
DB 를 갱신하면 디바운스된 PATCH 가 그것을 덮는다. 거래소(marketplace)는
**inbox** 로 우회했지만 — 거래는 사용자 클릭으로 "수령" 하는 흐름이라 가능했음.

전투/제작/퀘스트는 즉시 반영이 자연스러워 inbox 로 빼면 UX 가 어색해진다.
**해법: PATCH 를 끊는다.**

### 서버 권위 키 (SERVER-AUTHORITATIVE)

다음 키는 **서버만 쓴다** — 클라이언트의 `useRemotePatch` 호출 제거:

- `character.v2` (HP / MP / EXP / level / gold / fame / 스탯)
- `inventory.v2` (포션 / 재료 / 장비 / 장착 / 가방 용량)
- `crafting.v2` (보유 제작서 / 공유 토큰 charges)
- `quest-progress.v2` (의뢰 진행 / 보상 수령 여부)
- `adventure-log.v2` (처치 / 방문 / 대화 / 칭호)

흐름:

```
클라 (자기 state)         서버
  │                         │
  │── intent (POST) ────→  │  ── DB transaction ──
  │                         │      validate
  │                         │      mutate
  │                         │      compute new snapshot
  │  ←── new snapshot ──    │
  │                         │
  setState(snapshot)        │
  // PATCH 없음
```

### 클라 PATCH 키 (CLIENT-AUTHORITATIVE)

다음 키는 **클라이언트가 PATCH** — 기존 흐름 유지:

- `map.v2` (방문/현재 지역) — 단순 마커
- `edge-unlocks.v2` — 단순 마커
- `storyFlags.v2` — 단순 마커
- `shop.unlocks.v1` — 단순 마커
- `character-profile.v2` — 닉네임/클래스 (1회 setup 후 거의 변경 없음)
- `training.v2` — 훈련 시작/완료 시점은 서버 endpoint 통과시키지만 진행 시계는
  클라가 PATCH 해도 무방 (시간 위조 위험 — 추후 별도 재검토)

이 분류로 race 자체가 발생할 수 없게 된다 (한 키엔 한 writer).

---

## 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│ 브라우저 (Next.js client)                                │
│  ┌────────────────┐  ┌──────────────────────────────┐    │
│  │ 게임 hook 들   │  │ remoteAction (신규 어댑터)   │    │
│  │ useCharacter   │←─│  POST /api/<domain>/<action> │    │
│  │ useInventory   │  │  → 응답으로 state replace    │    │
│  │ useCrafting    │  └──────────────────────────────┘    │
│  │ useQuests      │                                      │
│  │ useAdventureLog│                                      │
│  └────────────────┘                                      │
│         ↑                                                │
│  서버 응답이 도착하면 setState — PATCH 호출 없음          │
└──────────────────────────────────────────────────────────┘
                          │
                          ↓
┌──────────────────────────────────────────────────────────┐
│ Next.js Route Handlers                                   │
│   /api/battle/end           POST  - 전투 종료 보상       │
│   /api/battle/offline-tick  POST  - 오프라인 사냥        │
│   /api/craft                POST  - 제작 1회             │
│   /api/quest/claim          POST  - 의뢰 보상 수령       │
│   /api/shop/buy             POST  - 상점 구매            │
│   /api/shrine/buy-point     POST  - 성장 신전 포인트 구매 │
│   /api/training/start       POST  - 훈련 시작             │
│   /api/training/complete    POST  - 훈련 완료             │
└──────────────────────────────────────────────────────────┘
                          │
                          ↓
┌──────────────────────────────────────────────────────────┐
│ src/shared/  (클라·서버 공통 결정론 로직)                │
│   - rewards.ts        드롭 굴림, LUK 멀티                │
│   - leveling.ts       requiredExpToNext                  │
│   - crafting.ts       재료 검증, 결과물 계산             │
│   - sellPrices.ts     이미 공통화 (그대로)               │
│   - battle/engine.ts  결정론 advanceTurn                 │
└──────────────────────────────────────────────────────────┘
                          │
                          ↓
┌──────────────────────────────────────────────────────────┐
│ Neon Postgres                                            │
│   - saves_kv (기존)                                      │
│   - last_active_tick (신규 — 오프라인 sim 권위)          │
│   - action_log (신규 — clientActionId 멱등성용)          │
└──────────────────────────────────────────────────────────┘
```

**핵심 원리** — 클라이언트 hook 의 setState 시그니처는 유지하되, 호출 경로가
"로컬 mutate → debounced PATCH" 에서 "endpoint 호출 → 응답으로 replace" 로
바뀐다. 화면 단의 useState/useReducer 패턴은 그대로.

---

## 도메인별 마이그레이션

### 1. 전투 종료 보상 (`onBattleEnd`)

**현재**: `src/adventure/battle/onBattleEnd.ts` — 클라가 드롭 굴림 + 골드/EXP/장비/제작서 적용 + 도감 갱신 + 퀘스트 진행 누적.

**이전 후**:
- 클라가 결정론 `advanceTurn` 으로 전투 진행 → 종료 시 시드 + 적 이름 + 최종 state(playerHp, potionsConsumed) 를 `POST /api/battle/end` 로 전송.
- 서버가 같은 시드로 같은 엔진 재실행 → 결과 일치하면 보상 적용. 불일치면 거부.
- 보상 = 클라가 이미 있는 `onBattleEnd` 로직과 동일하지만 deps 가 클라 hook 이 아니라 DB 트랜잭션.
- 응답: `{ character, inventory, crafting, questProgress, adventureLog }` 의 새 스냅샷.
- 클라 hook 들은 응답을 받으면 자기 state 를 **replace**.

**핵심 시드**: `state.rng` 가 현재 `Math.random` 인 곳들을 모두 결정론 RNG 로
교체해야 함. `engine.ts` 의 회피/크리/추가 공격 판정, 드롭 굴림 모두.
`mulberry32(seed)` 같은 작은 PRNG 를 `src/shared/rng.ts` 로 도입.

**비용**: 전투 종료마다 API 1회 — 사용자 평균 ~20-60초당 1회 (자동 사냥 체이닝
기준). Vercel Functions 호출이 크게 늘진 않지만 cold start 영향 가시화 가능 →
Fluid Compute 로 해결.

### 2. 오프라인 사냥 (`useOfflineSimulation`)

**현재**: 클라가 visibility 복귀 시 `simulateOfflineHunt` 한 번 돌리고 결과 적용. baseline (`last-active-tick.v2`) 는 localStorage.

**이전 후**:
- baseline 을 서버 테이블 `last_active_tick` 로 옮김 (userId, regionId, ts, active).
- 모든 진행도 POST 의 응답 헤더에 `last_active_tick` 갱신을 포함하거나, 별도 heartbeat endpoint 로 갱신.
- 복귀 시 클라가 `POST /api/battle/offline-tick { regionId }` 호출 → 서버가:
  1. last_active_tick 조회 → 경과 시간 계산
  2. `simulateOfflineHunt` 서버 측 실행 (deterministic, 시드는 서버 생성)
  3. 보상 적용 + 새 last_active_tick 기록
  4. 응답으로 result + 갱신된 진행 키들 반환
- 클라는 결과로 `OfflineRewardsModal` 띄우고 hook state 교체.

**부가 효과**: 시계 위조로 30분 cap 우회하는 공격이 막힘 — 서버 시계 기준.

**유의**: 멀티 디바이스 시 마지막 활성 디바이스 기준으로 tick 갱신. 한 디바이스에서 자동 사냥 켜둔 채 떠나고, 다른 디바이스에서 들어오면 그 디바이스가 보상을 가져감 (의도된 동작).

### 3. 제작 (`useCrafting.craft`)

**현재**: 클라가 재료 검증 → 인벤토리 차감 → 결과물 추가 → 도감 갱신.

**이전 후**:
- `POST /api/craft { recipeId, clientActionId }`.
- 서버: 재료 보유 검증 → 차감 → 결과물 지급 → 공유 토큰 charge 차감(있으면) → 응답으로 갱신된 inventory + crafting + character(골드 비용 있을 시).
- 클라: 응답을 hook state 에 replace.
- 실패 사유(재료 부족 등) 4xx 반환 → 클라가 토스트.

### 4. 퀘스트 보상 수령 (`useQuests.claim` + `applyQuestReward`)

**현재**: 길드 NPC 다이얼로그에서 "보상 받기" → 클라가 진행 조건 확인 후 보상 적용.

**이전 후**:
- `POST /api/quest/claim { questId, clientActionId }`.
- 서버: questProgress 의 ready 상태 검증 → 보상 적용 → claimed 마킹 → 응답.
- **이중 수령 방지**가 가장 큰 수익 — 현재 클라 사이드만 막고 있는데 state 직접 조작으로 우회 가능.

### 5. 상점 구매 (`ShopView`)

**현재**: 클라가 골드 차감 + 아이템 인벤토리 추가.

**이전 후**:
- `POST /api/shop/buy { itemId, quantity, clientActionId }`.
- 서버: shopUnlocks 검증 → 가격 lookup → 골드 차감 → 인벤 추가.
- 응답: character + inventory.

### 6. 신전 환원 (`GrowthShrineView` — 되돌리기 포인트 골드 구매)

**현재**: 1pt / 100G — 클라가 골드 차감 + character.allocated 리셋 가능.

**이전 후**:
- `POST /api/shrine/buy-point { clientActionId }`.
- 서버: 골드 검증 → 차감 → character.shrinePoints 증가.
- 별도 `POST /api/shrine/respec { allocation, clientActionId }` 로 재배치도 권위화 (현재는 클라 사이드).

### 7. 훈련 (`useTraining`)

**현재**: 훈련 시작 시 클라가 비용 차감, 완료 시 보상 지급.

**이전 후**:
- `POST /api/training/start { trainingId, clientActionId }` — 비용 차감 + training.v2 에 시작 ts 기록.
- `POST /api/training/complete { trainingId, clientActionId }` — 서버 시계로 경과 검증 + 보상 지급.
- training.v2 은 PATCH 유지 가능하지만 시작/완료는 endpoint 통과 강제.

### 8. 거래소 (`marketplace`) — 이미 서버 권위

기존 inbox 패턴 유지. 별도 작업 없음.

### 9. 자원 변경 없는 액션 — 권위 이전 대상 아님

다음은 단순 클라 PATCH 유지:
- 지역 이동(map.v2 갱신) — 적정 레벨 검증은 추후.
- 시련(Trial) 해금 / edge-unlock — 자원 아님.
- 스토리 플래그 — 자원 아님.
- 칭호 장착 — 자원 아님 (장착 자체는 표시용).

---

## 공통 인프라

### 결정론 로직 공유 (`src/shared/`)

클라(애니메이션)·서버(권위) 양쪽이 같은 결과를 내려면 결정론 함수가 공통이어야 함.

- 옮길 함수:
  - `battle/engine.ts` 의 `advanceTurn`, `initialBattleState` (이미 결정론).
  - `battle/onBattleEnd` 의 드롭 굴림 (현재 `Math.random` 직접 호출 — RNG 인자로 변경 필요).
  - `offlineSim.ts` 전체.
  - `crafting` 의 재료/결과물 검증.
  - `leveling.ts` 의 EXP→레벨 계산.
- 위치: `src/shared/` (또는 `src/lib/game/`) — 클라 hook deps 없는 순수 함수만.
- import: 클라 hook + 서버 route handler 둘 다 동일 경로.
- `Math.random` 직접 호출 금지 — 모든 RNG 는 인자 주입.

### 응답 포맷

```ts
type ServerActionResponse = {
  character?: CharacterSnapshot;
  inventory?: InventorySnapshot;
  crafting?: CraftingSnapshot;
  questProgress?: QuestProgressSnapshot;
  adventureLog?: AdventureLogSnapshot;
  // 도메인별 결과 (예: 전투 보상 모달, 제작 결과물)
  result?: unknown;
};
```

변경된 키만 포함. 클라 어댑터(`remoteAction`)가 응답을 받아 각 hook 의
setState 호출.

### 멱등성

모든 액션 endpoint 는 `clientActionId: string (uuid v4)` 을 body 로 받음.
서버는 `action_log` 테이블에 (userId, clientActionId, response_snapshot)
기록. 같은 id 재요청 시 저장된 응답 그대로 반환.

용도: 네트워크 끊김 후 재시도, 더블 클릭 보호. action_log 는 7일 TTL cron 정리.

### 에러 처리

- 4xx (검증 실패: 재료 부족, 골드 부족, ready 아님): 토스트 + 클라 state 변경 없음.
- 401: Clerk 세션 만료 — 재인증 후 재시도.
- 5xx: 트랜잭션 롤백 — 클라 토스트 "잠시 후 다시 시도". 자동 재시도 안 함 (멱등성으로 안전하긴 하지만 의도된 사용자 액션은 한 번만).
- 검증 거부(전투 시드 불일치): 모니터링 로그에 기록 + 클라엔 일반 5xx 처럼 표시. 반복 시 차단 정책은 별도 기획.

---

## 단계별 진행

각 단계는 **독립 PR · 독립 배포 가능**. 한 번에 한 도메인씩.

### Phase 0 — 인프라 준비

- `src/shared/` 디렉토리 + 결정론 함수 이전 (드롭 굴림, RNG, 레벨링).
- `action_log` 테이블 + `clientActionId` 미들웨어.
- 응답 포맷 타입 + `remoteAction` 클라 어댑터.
- `useRemotePatch` 에 "이 키는 서버 권위" 표시 옵션 추가 → 표시된 키는 PATCH 호출 무시.

### Phase 1 — 제작 (가장 단순)

- `POST /api/craft` — 단발 트랜잭션, 시간/시드 무관.
- 클라 `useCrafting.craft` 를 endpoint 호출로 교체.
- `crafting.v2` 를 서버 권위 마킹.

### Phase 2 — 상점 / 신전 / 퀘스트 수령

- 동일 패턴 (단발 트랜잭션, 자원 검증 + 차감 + 지급).
- `POST /api/shop/buy`, `/api/shrine/buy-point`, `/api/quest/claim`.

### Phase 3 — 전투 종료 (가장 큰 변경)

- 결정론 RNG 도입 — `Math.random` 대체 (`engine.ts`, `pickAutoAction`).
- 시드 생성 + 검증 로직.
- `POST /api/battle/end`.
- 클라 `BattleView` 의 `onBattleEnd` 로컬 처리 → endpoint 호출로 교체.
- 패배 시 복귀 마을 이동도 서버 응답 따름.

### Phase 4 — 오프라인 사냥

- `last_active_tick` 테이블.
- 모든 endpoint 응답에 last_active_tick 갱신 포함하는 미들웨어.
- `POST /api/battle/offline-tick`.
- 클라 `useOfflineSimulation` 을 endpoint 호출로 교체.

### Phase 5 — 훈련

- 훈련은 시간 기반 + 분기 다양 — 마지막에 진행.
- `POST /api/training/{start,complete}`.

### Phase 6 — 정리

- 더 이상 클라 PATCH 가 없는 키들의 `useRemotePatch` 호출 제거.
- 죽은 클라 코드 (`onBattleEnd.ts`, `applyQuestReward.ts` 등 클라 deps 버전) 삭제.
- `src/shared/` 가 단일 출처임을 enforcing 하는 lint 룰.

---

## 비목표 / 보류

- **전투 중 매 턴 검증** — 비용·UX 모두 비현실. 사후 검증으로 충분.
- **자동 포션 룰의 서버 저장** — 디바이스 종속이라 의미 낮음.
- **실시간 멀티플레이어** — 본 계획 범위 아님.
- **서버 측 시계 권위 100%** — training/cooldown 의 시작 시점은 클라 시계
  의존이 잠시 남음 (Phase 5 에서 정리).
- **history 백필** — 현재 진행 중인 사용자 데이터 마이그레이션 — 서버 권위로
  바뀌어도 기존 saves_kv 그대로 사용. 별도 마이그레이션 불필요.

---

## Open questions

1. **전투 시드 불일치 어떻게 처리?**
   - 선택지: (a) 서버 결과로 강제 덮어쓰기 + 사용자 알림 X, (b) 토스트로 "재계산됨" 표시, (c) 일정 횟수 이상 누적되면 계정 플래그.
   - v1 권장: (a) — 사용자 입장에서 자기 화면 결과가 변하는 일이 거의 없도록 결정론 보장에 집중.

2. **endpoint 호출 실패 시 자동 사냥 체이닝 어떻게?**
   - 한 전투 결과 PATCH 가 실패하면 다음 전투를 시작해도 되나?
   - v1 권장: 실패 시 자동 사냥 일시 OFF + 토스트. 사용자가 수동 재진입.

3. **`adventureLog.v2` 의 칭호 자동 부여 (예: first_blood)** 도 서버 권위?
   - 칭호 자체는 자원 아님이라 위조 영향 작지만, 깔끔함을 위해 권위 이전 대상에 포함.

4. **Vercel Function 호출 횟수 폭증 모니터링**
   - 자동 사냥 체이닝 기준 사용자 평균 호출 빈도 측정 필요.
   - 빈번하면 batch endpoint (예: 여러 전투를 한 번에 검증) 도입 검토 — 이번 계획 v1 에선 제외.

5. **거래소 inbox 패턴과 통합?**
   - 현재 인벤 갱신은 우편함 claim 시점에 클라 PATCH 로 들어감.
   - 권위 이전 후 inventory.v2 가 서버 전용이 되면 우편함 claim 도 서버
     endpoint 가 직접 inventory 갱신 → 응답으로 통보. 현재 `MarketplaceTab`/
     `InboxView` 의 `addEquipment`/`addMaterial` 호출 지점들도 같이 정리해야 함.
