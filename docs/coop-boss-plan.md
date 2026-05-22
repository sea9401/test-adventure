# 협동 보스 (월드 보스) 시스템 계획

> 상태: ✅ **구현 완료** — 협동(월드) 보스 출고. 이 문서는 설계 기록.

운봉의 거인을 협동 버전으로 — 시간 기반 자동 리젠, 모든 유저가 누적 데미지로 처치, 기여도에 따라 차등 보상.
exten 프로젝트의 `coop` 시스템을 참조하되, 우리 환경(Postgres·Clerk·작은 hp 규모)에 맞게 단순화.

---

## 1. 컨셉

| 항목 | 내용 |
|---|---|
| **보스 출처** | 운봉의 거인 (기존 인스턴스 보스 재사용) |
| **소환** | 별도 아이템·동작 없음. **canyon 지역에 시간 기반 자동 리젠** (처음 1회는 admin/cron 으로 spawn) |
| **참여** | canyon 도달한 유저 누구나, 쿨다운 안에서 N턴 공격 |
| **처치 조건** | 모든 유저의 누적 데미지 합 ≥ 보스 maxHp |
| **보상** | 본인 누적 데미지 / maxHp 비율로 5단계 티어. 도달 티어 + 하위 티어 누적 |
| **테스트 기간 친화** | hp 2,000 ~ 작은 규모. 4~5명이면 잡을 수 있는 수준 |

---

## 2. 인당 턴수 시뮬 — "한 방컷" 막기 + 약빌드 참여 보장

### 2.1 보스 hp 결정

운봉의 거인 인스턴스 버전 hp 420. 협동 버전은 그 5배 = **2,000** 으로 설정 (작지만 의미 있는 누적).

### 2.2 현재 빌드 대비 dmg/turn 추정 (vs def 14)

| 빌드 | atk | dmg/턴 | (참고: 운봉 무기 보유 시) |
|---|---:|---:|---|
| Lv 18 full warrior (마정석 검) | 23 | ~11 | — |
| Lv 22 full warrior (마정석 검) | 26 | ~14 | — |
| Lv 22 full warrior + 운봉 검 | 27 | ~15 | str/atk 보너스 |
| Lv 25 over geared | 30+ | ~17~20 | def_pierce 스킬 더하면 ~25 |

### 2.3 인당 턴 옵션 비교

20턴 시뮬 (보스 반격 포함) 기준:

| 빌드 | 1회 공격 누적 dmg | hp 2000 대비 % | 평가 |
|---|---:|---:|---|
| Lv 18 → 11×20 | 220 | 11% | bronze ~ silver |
| Lv 22 → 14×20 | 280 | 14% | silver |
| Lv 25 over → 20×20 | 400 | 20% | gold |
| 극한 빌드 → 25×20 | 500 | 25% | gold ~ epic |

**결론: 1회 공격 = 20턴 추천.** 강빌드도 1회로 25% 이상 못 가져감 → 한방 클리어 차단. 약빌드는 1회만 해도 bronze 도달 가능.

### 2.4 처치까지 필요한 공격 횟수

- 강빌드 1명 단독 — 5회 공격 = 100턴, 누적 ≈ 2,000 → 가능 (단독 솔로처럼)
- 평균 빌드 4~5명이면 1회씩만 쳐도 처치 가능

→ 테스트 기간 (유저 적음) 에 1~2명만 와도 4~5회 공격으로 잡을 수 있음.

### 2.5 쿨다운 (재공격까지 대기)

| 옵션 | 평가 |
|---|---|
| 30초 (exten 동일) | 너무 짧음, 매크로 위험 |
| **5분** (추천) | 자동화 무력화, 반복 부담 적당 |
| 10분 | 약빌드는 풀 기여까지 50분 이상 |
| 30분 | 처치까지 너무 김 — 만료 위험 |

→ **쿨다운 5분 추천.**

---

## 3. 리젠 / 만료 사이클

| 단계 | 시간 | 비고 |
|---|---|---|
| 보스 등장 후 | 24시간 | 만료 — 못 잡으면 자동 청소 + 다음 등장까지 대기 |
| 처치 후 | **1시간** | 자동 재소환 (canyon 진입 시 노출) |
| 만료 후 | 1시간 | 즉시 재소환 (테스트 기간 가성비) |

→ 처치되든 만료되든 1시간 뒤 다시 등장 — 테스트 기간 회전 빠르게.

리젠 트리거: **Vercel Cron 사용** (1시간 단위). DB 의 `coop_boss_session` 의 `next_spawn_at` 이 지났으면 새 인스턴스 생성.

---

## 4. 보상 티어

exten 의 5단계 임계 그대로 (검증된 곡선). 보상은 진입장벽 낮추는 방향으로 조정 — gold 부터 무기 제작서 풀림.

| 티어 | 데미지 비율 | 누적 데미지 (hp 2,000) | **이번 티어 추가 보상** | **누적** |
|---|---:|---:|---|---|
| **bronze** | ≥ 2% | 40 | 거인 비늘 ×1 | 거인 비늘 ×1 |
| **silver** | ≥ 7% | 140 | 운봉석 ×1 | 거인 비늘 ×1 + 운봉석 ×1 |
| **gold** | ≥ 15% | 300 | 거인 비늘 ×1 + 운봉석 ×1 + **운봉 무기 제작서 ×1 (4종 중 랜덤)** + **견갑 제작서 0.15 확률** ★ | 거인 비늘 ×2 + 운봉석 ×2 + 무기 제작서 ×1 + (견갑 0.15) |
| **epic** | ≥ 30% | 600 | **운봉의 심장 제작서 ×1** (장신구) | 위 + 심장 제작서 ×1 |
| **legend** | ≥ 50% | 1,000 | **칭호 「거인살해자」** | 위 + 칭호 |

★ 견갑 제작서 0.15 굴림은 **gold 도달 시 단 1회** (epic/legend 추가 굴림 없음).
운봉의 거인은 솔로 인스턴스 경로 없이 협동 처치만으로 잡히므로 견갑 제작서는 협동 풀이 유일 출처.

도달 티어까지 누적 지급 (exten 동일).

**기여 못 채운 유저**: bronze 미달 (2% < 40 dmg) 이면 보상 없음. 참여만 한 유저는 다음 인스턴스 시도하라는 메시지.

### 4.1 신규 장신구 — 운봉의 심장 (epic 보상)

기존 액세서리 라인에 비어 있던 **str 중심 공격형** 자리를 채움. 같은 협동 풀의 견갑(민첩·기동형, 0.15)과 분기 — 심장은 epic 확정.

```ts
peak_heart: {
  name: "운봉의 심장",
  slot: "accessory",
  bonus: { str: 4, vit: 2 },
  rarity: "rare",
}
```

**제작서 재료:** 거인 비늘 ×2 + 운봉석 ×2 (운봉 견갑보다 살짝 가벼움 — 진입재).

| 액세서리 | 보너스 | 출처 |
|---|---|---|
| 마정석 팔찌 | vit +3, spd +2 | 광맥 보스 0.15 |
| 운봉 견갑 | dex +5, spd +4 | **협동 보스 gold+ 0.15** |
| **운봉의 심장** | **str +4, vit +2** | **협동 보스 epic 확정** |

→ 솔로는 견갑(방어), 협동은 심장(공격) 으로 자연 분기.

### 4.2 신규 칭호 — 거인살해자 (legend 보상)

```ts
{
  id: "giant_slayer",
  name: "거인살해자",
  description: "운봉의 거인을 홀로 절반 이상 깎아낸 자. 산정의 메아리가 그를 기억한다.",
}
```

자원 보상은 epic 과 동일하게 두고 **legend 차별화는 칭호 한 줄로** — 보상 인플레 방지 + 영광 부여.

### 4.3 협동 단일 경로 — 보상 누적 요약

운봉의 거인은 협동 처치만 존재 (region.boss 솔로 인스턴스 제거).

| | 협동 gold | 협동 epic | 협동 legend |
|---|---|---|---|
| 거인 비늘 | ×2 | ×2 | ×2 |
| 운봉석 | ×2 | ×2 | ×2 |
| 무기 제작서 | 확정 1 (4종 중 랜덤) | 확정 1 | 확정 1 |
| **견갑 제작서** | **0.15** | **0.15** | **0.15** |
| **심장 제작서** | — | **확정 1** | 확정 1 |
| 칭호 「거인살해자」 | — | — | **확정** |

견갑은 gold+ 도달 시 0.15 굴림 (단 1회), 심장은 epic+ 확정, 칭호는 legend 고유.

### 4.4 진입장벽 시뮬

| 빌드 | gold 도달 | epic 도달 | legend |
|---|---|---|---|
| Lv 18 약빌드 (1회 220 dmg) | 2회 | 3회 | 5회 |
| Lv 22 평균 (1회 280 dmg) | **2회** | 3회 | 4회 |
| Lv 25 강빌드 (1회 400 dmg) | **1~2회** | 2회 | 3회 |

5분 쿨다운 기준, **약빌드도 gold 까지 10분 (2회 공격)** 으로 무기 제작서 1자루 확보 가능 — 진입 보상 크게 개선.

---

## 5. 데이터베이스 설계 (drizzle)

### 5.1 신규 테이블 2개

```ts
// 활성 협동 보스 세션 (region 별 1개).
export const coopBossSessions = pgTable("coop_boss_sessions", {
  id: text("id").primaryKey(),               // uuid
  regionId: text("region_id").notNull(),     // canyon 등
  bossName: text("boss_name").notNull(),     // 운봉의 거인
  hp: integer("hp").notNull(),               // 현재 hp
  maxHp: integer("max_hp").notNull(),
  spawnedAt: timestamp("spawned_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),     // spawnedAt + 24h
  defeatedAt: timestamp("defeated_at"),             // 처치 시각 (null 이면 진행 중)
  nextSpawnAt: timestamp("next_spawn_at"),          // defeatedAt + 6h 또는 expiresAt + 1h
}, (t) => [
  uniqueIndex("coop_boss_active_region_idx").on(t.regionId).where(sql`${t.defeatedAt} IS NULL`),
]);

// 유저별 누적 데미지 + claim 상태.
export const coopBossContributors = pgTable("coop_boss_contributors", {
  sessionId: text("session_id").notNull().references(() => coopBossSessions.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  damage: integer("damage").notNull().default(0),
  attackCount: integer("attack_count").notNull().default(0),
  lastAttackAt: timestamp("last_attack_at"),         // 쿨다운 검증
  claimedAt: timestamp("claimed_at"),                 // 보상 수령 시각
  claimedTier: text("claimed_tier"),                 // bronze/silver/gold/epic/legend
}, (t) => [
  primaryKey({ columns: [t.sessionId, t.userId] }),
  index("coop_boss_contributors_user_idx").on(t.userId),
]);
```

### 5.2 동시성

- canyon region 활성 세션은 1개 (uniqueIndex 로 보장)
- damage/contribution 업데이트는 단일 트랜잭션 (UPDATE coop_boss_sessions ... + UPSERT contributors)
- claim 도 트랜잭션으로 idempotent

---

## 6. API 설계 — `/api/coop/[region]`

### 6.1 GET — 현재 세션 조회

```
GET /api/coop/canyon
→ {
  session: { id, bossName, hp, maxHp, expiresAt, defeated, nextSpawnAt },
  myContribution: { damage, attackCount, lastAttackAt, claimable, tier? } | null,
  topContributors: [{ name, damage }, ...] // 상위 5명
}
```

`canyon` 진입한 유저면 누구나 호출. 폴링 간격 5초.

### 6.2 POST — 공격 (`action: "attack"`)

요청 시 서버가 20턴 시뮬 실행 → damage 결과를 세션에 누적 + contributors UPSERT.

```ts
POST /api/coop/canyon
{ action: "attack" }

→ {
  damageDealt: 280,
  damageTaken: 60,
  finalPlayerHp: 96,    // BattleView 에 반영
  log: [...],            // exten 의 BossCombatLogEntry 와 유사
  session: { hp: 1720, ... },
}
```

**서버 검증:**
- 5분 쿨다운 (`now < lastAttackAt + 5min` → 429)
- 보스 처치 상태면 거부
- canyon 도달했는지 확인 (visitedRegionIds 체크)
- HP 0 인 유저는 거부 (사망 상태로 못 침)

**시뮬:** `engine.ts` 의 `advanceTurn` 으로 20턴. 보스 stat 은 `MONSTERS["운봉의 거인"]` 그대로 (hp 만 maxHp 2000 으로 override). 사망 시 캐릭터 hp 0 으로 갱신 + canyon 에 stuck 안 되도록 안전망 동일 적용 (respawn 마을 회귀).

### 6.3 POST — 보상 수령 (`action: "claim"`)

```ts
POST /api/coop/canyon
{ action: "claim" }

→ { tier: "gold", reward: { materials: {...}, recipes: [...] }, claimedAt }
```

처치된 세션에서만 가능. claimedAt 박힌 유저는 거부 (idempotent).

### 6.4 Cron — 리젠 트리거

```ts
GET /api/cron/coop-respawn
// vercel.json 에 schedule: "0 * * * *" (매시간)
```

- 만료된 세션 청소 (`expiresAt < now AND defeatedAt IS NULL`)
- `next_spawn_at < now` 이고 활성 세션 없는 region → 새 세션 생성
- 처치된 세션의 nextSpawnAt 이 지났으면 새 세션 생성 + 옛 것 삭제

---

## 7. 클라이언트 UI

광맥의 수호자 솔로 보스와 **동일 슬롯·동일 위치** — 전투 탭 안의 pre-encounter 화면. 일관성 유지.

### 7.1 위치 — `BattleView.tsx` pre-encounter 카드

```
[전투 탭 진입]
┌─ 현재 위치: 운무 협곡 ─────────┐
│ 구름이 낮게 깔리는 좁은 협곡… │
└──────────────────────────────┘
┌─ 협동 보스 ──────────────────┐  ← 광맥 수호자 카드와 동일 자리
│ 운봉의 거인                  │
│ HP ████░░░░ 1,720 / 2,000   │  ← 진행도 바 (광맥엔 없음)
│ 잔여 18시간 23분 · 기여자 4명 │
│ 내 기여 280 (14% · gold)     │  ← 본인 기여 + 도달 티어
│ [공격하기 (5분 쿨)]           │
│ [순위 보기 ▼]                │  ← 펼치면 top 5 contributors + 본인
└──────────────────────────────┘
[ 적과 만난다 ]      ← 일반 인카운터 (절벽 늑대 등)
[ 자동 사냥 ON/OFF ]
```

**광맥 수호자 카드와 차별점:**
- HP 진행도 바 (모든 유저 공유)
- 본인 기여 데미지 + 비율 + 도달 티어
- 5분 쿨다운 (개인 카운터, dailyEntryLimit 대신)
- 처치 직후 `[보상 수령]` 으로 전환
- "순위 보기" 펼침 — top 5 contributors + 본인 (기여 데미지 정렬)

세션 없음 / nextSpawnAt 대기 중일 땐 카드 자체를 흐리게 + "X 시간 후 등장" 표시.

### 7.2 컴포넌트 구조

```
BattleView.tsx (pre-encounter 화면)
└─ <CoopBossCard regionId={region.id} />   // 신규 — region 의 활성 세션 polling
   ├─ 활성: 보스 정보 + 공격 버튼
   ├─ 처치됨: 보상 수령 버튼
   └─ 미등장: nextSpawnAt 카운트다운 흐린 카드
```

`region.boss` (솔로 인스턴스) 분기와 평행 — 한 region 에 양쪽 다 있을 수도, 한쪽만 있을 수도. canyon 은 협동만.

### 7.3 공격 버튼 동작 — BattleView 모달 또는 인라인

| 옵션 | 동작 |
|---|---|
| **A. 인라인** | 카드 안에 결과 펼침 (데미지/받은 피해/로그 5줄 요약) |
| **B. 별도 모달** | 광맥 보스처럼 BattleView 풀화면으로 점프 (20턴 자동 재생) |

광맥 보스가 BattleView 풀화면 — 일관성을 위해 **B 안 (모달/풀화면)** 추천. 단 BattleView 컴포넌트에 `coopMode: true` flag 로 분기 (자동 사냥 토글 숨김, 1회 20턴 종료 후 결과 모달).

### 7.4 폴링

- 카드 마운트 시 5초 간격 fetch (region 매칭).
- 다른 탭/지역으로 나가면 cleanup.
- 공격 직후엔 즉시 1회 갱신.

---

## 8. 구현 단계 (분할 PR 권장)

### PR #1 — 데이터·API 토대 (서버)

- [ ] `coop_boss_sessions` / `coop_boss_contributors` 테이블 마이그레이션
- [ ] `/api/coop/[region]/route.ts` — GET / POST(attack/claim)
- [ ] `/api/cron/coop-respawn/route.ts` — 리젠 트리거
- [ ] `vercel.json` cron 등록
- [ ] `simulateCoopAttack` 어댑터 — `engine.ts` 의 advanceTurn 을 20턴 시뮬로 묶음
- [ ] 보상 티어 계산 헬퍼 (`coopTierForRatio`, `sumCoopTierRewards`)

### PR #2 — 클라이언트 UI

- [ ] `CoopBossPanel.tsx` — canyon 화면에 마운트
- [ ] 공격 시 BattleView 모달 또는 인라인 결과
- [ ] 폴링 + 보상 수령 플로우

### PR #3 — 밸런싱·관리

- [ ] admin 도구: 강제 spawn / 강제 리셋
- [ ] 시뮬 테스트 (`coopBossSim.test.ts`) — 보스 hp 2000 적정 처치 인원/시간 검증
- [ ] 리워드 로그 + 알림 (처치 시 광장 / 길드에 broadcast?)

### PR #4 — 확장 (선택)

- [ ] 다른 region 에도 협동 보스 (예: 폐허 — 폐허의 군주)
- [ ] 길드 전용 협동 보스 (길드 시스템과 통합)
- [ ] 처치 시 연관 storyFlag 발급 (`peak_giant_defeated` 도 협동으로 풀리도록)

---

## 9. 결정 보류 항목

| # | 항목 | 추천 |
|---|---|---|
| 1 | 협동 처치도 `peak_giant_defeated` flag 발급할지 | **YES** — 인스턴스 / 협동 둘 다 운향 진입로 해금 |
| 2 | 사망 시 누적 데미지 보존? | **보존** — 죽어도 이미 가한 데미지는 그대로. 다만 5분 쿨다운은 그대로 적용 |
| 3 | 사망 페널티 | 인스턴스 사망과 동일 (HP 0 + respawn 마을 회귀, 1HP 안전망) |
| 4 | top contributors 표시 인원 | 상위 5명 + 본인 |
| 5 | 처치 알림 broadcast | 광장 게시판에 1줄 ("운봉의 거인이 쓰러졌다 — 기여자 N명") |
| 6 | 만료 hp 처리 | 누적 데미지 그대로 보존하되 보상은 못 받게 (만료된 세션은 claim X) |

---

## 10. 참고 — exten 협동 보스에서 가져올 부분

| 패턴 | 출처 | 우리 적용 |
|---|---|---|
| 5단계 reward tier | `data/coop.ts` | 그대로 |
| `coopTierForRatio` / `sumCoopTierRewards` | 동일 | 그대로 — 단 보상 시그니처는 우리 `inventory.addMaterial` 에 맞게 변환 |
| 30턴 시뮬 + 보스 반격 | `simulate-coop.ts` | **20턴**으로 줄이고 우리 `advanceTurn` 으로 단순화 |
| 폴링 3초 | `CoopBossPanel.tsx` | **5초** (DB 부하 ↓) |
| KV 세션 저장 | `app/api/coop/route.ts` | **Postgres + 트랜잭션**, uniqueIndex 로 단일 활성 세션 보장 |
| 닉네임 기반 | — | **userId 기반** (Clerk + users.name) |

---

## 11. 작업 시작 시 첫 검증

PR #1 끝났을 때 admin 으로 강제 spawn 한 뒤:
1. 캐릭터 1로 attack 5회 → 누적 데미지 표시
2. 캐릭터 2로 attack → 다른 contributor 추가 확인
3. 처치까지 끌고 가서 양쪽 모두 claim 가능 확인
4. 강빌드로 1회 공격해 누적 25% 이상 안 나오는지 검증 (한방컷 방지)
5. 5분 쿨다운 강제 위반 → 429 확인
