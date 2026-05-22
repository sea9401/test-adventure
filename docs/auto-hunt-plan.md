# 자동 사냥 (위탁 원정) 설계

> 상태: ✅ **구현 완료** — 자동 사냥(위탁 원정) 서버 권위 출고. 이 문서는 설계 기록.

> UI 명칭은 **"자동 사냥"**. 이 문서에서 "위탁 사냥 / 위탁"은 같은 것 — 라이브 자동 전투(BattleView 화면 안)와 구분하기 위한 호칭이다.
>
> 2026-05 의 오프라인 사냥 / "서버 권위" 모델(`docs/server-authority-plan.md` §2)은 away/back 상태머신·outbox·reload·claimId 멱등성이 꼬여서 통째로 제거됨. 이 문서는 그 자리를 메우는 **타이머형 자동 사냥**. 핵심: "버튼 = 30분 사냥 한 묶음", 요청은 dispatch/collect 딱 2번, 서버가 시간을 소유.
>
> **2026-05-11 구현 완료** — 서버 헬퍼 `src/lib/server/autoHunt.ts`, `/api/hunt/{dispatch,collect,status}`, 클라 `useAutoHunt`·`AutoHuntCard`·`AutoHuntResultModal`, BattleView/GameContext/AdventureScreen/TownScreen/CoopBossCard/page.tsx 배선. §4 "위탁 중 잠금" — **라이브 사냥·솔로 보스·치유소 회복·코업 보스** 적용. **지역 이동은 v1 미적용** (sim 이 huntRegion 에 핀돼 있어 다른 지역으로 이동해도 결과는 위탁 지역 기준 — 정합성은 유지, 서사적 어색함만 남음). 자동 포션은 collect body 로 디바이스 룰을 받아 sim 에 적용 (라이브와 동일). 수령 UX 는 `location.reload()` (v2 인플레이스 미구현).
>
> **2026-05-11 이후 조정** — ① 지속시간 **30분 → 1시간**(`AUTO_HUNT_DURATION_MS`). ② **전투 수 cap 추가** `AUTO_HUNT_MAX_BATTLES`(= `DURATION_MS / 1200` ≈ 3000) — 원샷 캐릭터가 전투당 최소 쿨다운(600ms)으로 1시간이면 ~6000전투를 돌 수 있어, "전투당 ~1.2초" 기준으로 다시 cap. `simulateOfflineHunt` 의 `input.maxBattles` 로 전달(미지정 시 무제한 — 밸런스 테스트 sim 에는 영향 없음). 보통 캐릭터(전투당 ≳1.5초)는 시간 cap 에 먼저 걸려 무영향. 아래 본문의 "30분" 표기는 이 조정 이전 기준 — 코드 기준은 1시간.

## 0. 검토 상태 (2026-05-11 1차 확정)

- ✅ 효율 70% — **EXP·골드·전리품 확률만** ×0.7. 잡은 마릿수(퀘스트 처치·도감)는 100%. **UI 에는 표기하지 않음** (의도적 — 사용자가 효율 깎인 걸 모르게).
- ✅ 위탁 중 잠금 — **라이브 자동전투 / 치유소 / 지역 이동 / 보스 도전** 불가. (퀘스트 보상 수령은 잠그지 않음 — HP 충돌은 §2-2 의 "HP 델타 적용"으로 흡수.)
- ✅ 수령 UX — **v1: `location.reload()`**. DB 컬럼 이름은 유지(마이그레이션 없음, 주석으로 새 의미 명기).
- ✅ 지속시간 — **1시간 고정, 슬롯 1개** (초기 30분 → 2026-05-11 이후 1시간으로 상향 + 전투 수 cap 추가, 상단 노트 참고). (가변/다중 슬롯은 추후.)
- 🔲 남은 소소한 2건 → §7. 이견 없으면 그대로 확정.

## 1. 컨셉

- **라이브 자동전투(기존, 그대로 둠)** — "사냥 시작" → 전투 화면에 머무는 동안 적→전투→다음 적. 화면 떠나면 멈춤. 클라이언트 전부, 네트워크 0. *손 안 댐* (단, 위탁 사냥이 나가 있는 동안엔 비활성화 — §4).
- **위탁 사냥(신규)** — "위탁 사냥 보내기 (30분)" → 캐릭터를 30분간 사냥 보냄 → 30분 뒤 "수령" → 그동안의 결과를 한 번에 받음. 안 보는 동안 진행되는 idle-게임 원정 패턴.
- **효율 70%** — 위탁 사냥으로 받는 **EXP·골드·전리품은 라이브 대비 ~70%**. 직접 안 싸운 데 대한 세금 / "길드 수수료·분실" 서사. 잡은 마릿수 자체는 그대로 — **퀘스트 처치 진행·도감은 100% 반영**. 줄어드는 건 가져오는 것뿐.
- **한 번에 1건** — 위탁 슬롯 1개. 진행 중엔 새 위탁 불가.

## 2. 흐름

### 2-1. 보내기 — `POST /api/hunt/dispatch`
- body: `{ regionId }`
- 서버:
  1. users 행 + character save 락.
  2. 검증: 이미 위탁 중이면 거부 / region 에 적 없으면 거부 / 캐릭터 HP ≤ 0 이면 거부.
  3. 기록: `huntActive=true`, `huntBaselineAt=now`, `huntRegion=regionId`, `huntBaselineHp=<character save 의 현재 HP>`.
  4. 반환: `{ ok, startedAt, regionId, durationMs: 30*60_000 }`.
- 클라: 응답으로 카운트다운 UI 진입. (start 시각은 서버 응답값 신뢰 — 클라 시계 안 씀.)

### 2-2. 수령 — `POST /api/hunt/collect`  (조기 수령 겸용)
- body: 없음 (또는 `{ regionId }` — 사망 후 map 갱신 보조용, 옵션).
- 서버:
  1. users 행 락. `huntActive` 아니면 `{ ok, noop:true }`.
  2. `elapsedMs = now - huntBaselineAt`. **`simMs = min(elapsedMs, 30*60_000)`.** ← "30분만" 캡이 자연스럽게 처리 (3일 방치하고 수령해도 30분치만). `simMs < 10초` 면 거부(`{ ok:false, reason:"too_soon" }`) — 실수로 슬롯 날림 방지. (§7 Q3)
  3. KV save (character / inventory / crafting / map) 락 로드. character save 에서 `derivePlayerCombat` (서버 진실), `hp = huntBaselineHp` 로 시작.
  4. `simulateOfflineHunt({ playerCombat, region: WORLD_MAP[huntRegion], awayMs: simMs, autoPotionRules(collect body), playerLevel, ... })` 실행 — 라이브와 동일하게 자동 포션 룰 적용 (보유 0 은 sim 이 공격으로 폴백). **페이싱도 라이브와 동일**: 전투 자체는 즉시, 전투 1판마다 `battleCooldownMs(min(로그줄수, 8))` ≈ 600~2000ms 경과 (옛 "턴당 250ms" 모델 폐기 — 강한 캐릭이 한 방에 죽이면 전투당 250ms 라 라이브보다 훨씬 빨랐던 버그 수정, 2026-05-11). seed = `makeRng(userId, huntBaselineAt)` 라 (룰+seed) 결정적.
  5. **효율 70% 후처리** (`DISPATCH_EFFICIENCY = 0.7`):
     - `expGained = floor(raw.expGained * 0.7)`, `goldGained = floor(raw.goldGained * 0.7)`.
     - 전리품(재료 unit / 장비 / 제작서): 각 항목을 `rng() < 0.7` 일 때만 keep. (기대값 ×0.7, sim 내부 드롭 로직 안 건드림.)
     - `killsByName` / `cappedByLimit` / `died` / `finalPlayerHp` 는 **그대로** — 마릿수·도감·퀘스트 처치 진행 100%.
  6. **HP 적용** ⚠️:
     - `died` → `character.hp = 0`, map save 의 region 을 `respawnRegionId` 로 (시작 마을 이동), 델타 무시.
     - 생존 → `hpDelta = finalPlayerHp - huntBaselineHp`; `character.hp = clamp(현재 character.hp + hpDelta, 0, maxHp)`. (위탁 중 퀘스트 보상 레벨업으로 maxHp/HP 가 바뀌었어도 안전 — "설정"이 아니라 "델타"라서.)
  7. 그 외 보상을 KV save 에 트랜잭션 적용 — 지운 `offlineHunt.ts` 의 `loadStateForSim` / `applyResultToSaves` / `updateBaseline` 을 git 에서 복구해 **간소화 버전**으로 재사용 (outbox·claimId 멱등성 풀세트·deferred advance 다 빼고, "락 → 로드 → sim → 적용 → 플래그 해제"만).
  8. 마무리: `huntActive=false`, `huntBaselineAt/huntRegion/huntBaselineHp = null`. 결과 객체 + "ack 안 됨" 표시를 `lastClaimResult` 에 캐시 (수령 중복 호출/새로고침/탭닫힘 replay 용 — 작은 멱등성만).
  9. 반환: `{ ok, result: <70% 적용 후 결과>, simMs, died }`.
- 클라 (v1):
  - 결과를 `sessionStorage` 에 박고 `location.reload()`. → SaveProvider 가 갱신된 character/inventory/crafting/map 을 fresh hydrate.
  - 마운트 직후 핸들러: sessionStorage 결과(없으면 서버 `lastClaimResult` 의 미-ack 분) 읽어 → 요약 모달 + 도감/퀘스트 진행도(클라 KV: adventureLog.v2 / quest-progress.v2) 추가 반영 + 알림 → sessionStorage·서버 ack 클리어.
  - 즉 지운 시스템의 mount-time 핸들러와 같은 패턴이지만, 트리거가 "수령 버튼" 1회라 명확 — away→back 자동 발화·heartbeat reload 경쟁(옛 `e754e66` race) 없음.
  - 추후 v2: reload 없이 `SaveProvider` 에 "강제 재-hydrate" 메서드 추가 → diff 반영. v1 은 reload 로.

## 3. UI

전투 진입 화면(`BattleView` pre-screen — 지금 "사냥 시작" / `AutoPotionSection` 있는 곳)에 카드 추가:

- **① 유휴** — `[ 위탁 사냥 보내기 — 30분 (효율 70%) ]`. HP ≤ 0 / region 에 적 없음 → disabled.
- **② 위탁 중** — `위탁 사냥 중 · 완료까지 12:34` 카운트다운 + `[ 지금 수령 ]`(조기 수령 — `min(경과,30분)×0.7`). 카운트다운은 서버 `startedAt + 30분` 기준 표시만.
- **③ 완료(30분 경과)** — `위탁 사냥 완료!` + `[ 수령하기 ]`(강조).
- 위탁 중이면 같은 화면의 라이브 "사냥 시작" 버튼 disabled ("캐릭터가 위탁 사냥 중").
- 헤더 배지: 기존 "사냥"(라이브) 대신 "위탁" 배지(카운트다운 tooltip).

## 4. 위탁 중 제약 (확정)

위탁 사냥이 나가 있는 동안:
- ❌ 라이브 자동전투 진입 불가
- ❌ 치유소 회복 불가 (HP 가 `huntBaselineHp` 로 "묶임" — 수령 시 sim 결과로 풀림)
- ❌ 지역 이동 불가 ("위탁 사냥 중이라 이동할 수 없다")
- ❌ 보스 도전 불가 (캐릭터가 자리에 없음)
- ✅ 마을/상점/제작/캐릭터/광장/훈련장 등 그 외 전부 OK. 훈련(8h)과 위탁(30m)은 독립.
- ✅ 퀘스트 보상 수령 OK — 레벨업으로 HP/maxHp 가 바뀌어도 수령 시 HP 를 **델타로** 적용(§2-2 #6)하므로 충돌 없음.

→ "위탁 중 HP/인벤이 옆에서 변해 수령 결과와 충돌" 케이스가 거의 닫힘.

## 5. 엣지 케이스

- **장시간 방치 후 수령** → `simMs = min(경과, 30분)` 이라 항상 ≤ 30분치. 옛 시스템의 "1시간 cap + 그 와중 reload 가 forfeit" 류 race 가 원천 차단.
- **사망(위탁 sim 중)** → sim 이 거기서 break → `died=true` + 그때까지 마릿수 100% + 전리품/EXP/골드 70% → 수령 시 HP=0 + 시작 마을. `huntActive=false`. adventureLog 전투 패배 +1. 라이브 패배와 결과 동일 (위탁이라 더 가혹/무르지 않음 — 70% 효율이 이미 세금).
- **조기 수령 = 헤지** → sim상 12분에 죽는다면, 실시간 5분에 조기수령 시 `simMs=5분` → 죽음 안 일어남(적게 챙기고 생존). 20분에 수령 시 죽음 발생. **의도된 리스크/보상 손잡이** (죽는 시점은 수령 전 못 봄 — preview 엔드포인트 없음).
- **첫 전투 즉사 (지역이 너무 셈)** → `simulatedMs ≈ 0`, 전리품 ≈ 0, 사망. 라이브에서 너무 센 지역 들어갔다 지는 것과 동일. (옵션: 위탁 버튼에 "이 지역 평균 레벨 ≫ 내 레벨" 경고 — v1 엔 안 함.)
- **보냈는데 영영 수령 안 함** → DB에 `huntActive=true` 로 남음(재위탁 불가). 나중에 수령하면 `simMs=30분` 으로 정상 해소.
- **수령 중복 호출 / 새로고침** → 첫 collect 가 `huntActive=false` 로 → 2번째는 캐시된 `lastClaimResult` replay, 재적용 안 함.
- **수령 눌렀는데 응답 전 탭 닫힘** → 서버 트랜잭션은 이미 커밋(보상 DB에 들어감) → 다음 로드 시 `lastClaimResult` 의 미-ack 분을 읽어 모달 한 번 재생. 손실 0.
- **서버 시계** → `now`, `huntBaselineAt` 둘 다 서버 → 클라 시계 skew 무관 (옛 시스템은 클라가 baseline 소유해 취약).
- **멀티 디바이스** → 서버 소유 상태 → 일관. A에서 보내고 B에서 수령 가능 (B는 다음 hydrate / 가벼운 polling 으로 "위탁 중" 인지).

## 6. 재사용 / 신규

**재사용 (이미 있음)**
- `src/adventure/battle/engine.ts` `resolveBattle` — 순수 함수.
- `src/adventure/battle/offlineSim.ts` `simulateOfflineHunt` / `summarizeOfflineResult` / `OfflineSimResult` — 그대로. 70% 후처리는 collect 라우트 쪽에서, sim 안 건드림.
- `src/adventure/character/derivePlayerCombat.ts` — 클라/서버 공용.

**git 에서 복구 후 간소화** (`git show HEAD:src/lib/server/offlineHunt.ts` — 이번 세션에서 지움)
- `loadStateForSim` / `assembleSimInput` / `applyResultToSaves` / `updateBaseline` / `computeFinalLevelExp` / `rehydrateEquip` / `readKv` — 유지 (`src/lib/server/dispatchHunt.ts` 로).
- `makeRng`(결정적 PRNG, seed=userId+baselineMs) — 유지.
- **버림**: `CLAIM_MIN_AWAY_MS` 류는 `simMs<10초` 거부로 대체, outbox, claimId/lastClaimId 풀 멱등성, `hasMeaningfulResult`, deferred advance. (`lastClaimResult` 캐시만 가벼운 멱등성으로 남김.)

**신규**
- `src/app/api/hunt/dispatch/route.ts`, `src/app/api/hunt/collect/route.ts`.
- `src/adventure/hunting/useDispatchHunt.ts` — dispatch/collect 호출 + 카운트다운 state + "위탁 중" 제약 플래그 노출.
- `src/adventure/battle/DispatchResultModal.tsx` (또는 알림 한 줄).
- `BattleView` pre-screen 위탁 카드 + 카운트다운 + `GameContext`/`page.tsx` 배선 + 위탁 중 제약 적용 지점들(라이브전투/치유소/이동/보스).
- 상수 `DISPATCH_DURATION_MS = 30*60_000`, `DISPATCH_EFFICIENCY = 0.7`, `DISPATCH_MIN_COLLECT_MS = 10_000` (`src/adventure/battle/dispatch.ts`).
- DB: 기존 미사용 컬럼 **재활용 (마이그레이션 X)** — `huntActive`→위탁 진행중, `huntBaselineAt`→위탁 시작, `huntRegion`→위탁 지역, `huntBaselineHp`→시작 HP, `lastClaimResult`→수령 결과 캐시(+ack 플래그). schema.ts 에 주석으로 새 의미 명기.

## 7. 검토 포인트 — 모두 확정

- **Q3 — 조기 수령 최소 경과** → ✅ 허용. `simMs < 10초`(`AUTO_HUNT_MIN_COLLECT_MS`) 면 `too_soon` 거부. UI 도 그동안 "지금 받기" disabled.
- **Q6 — 위탁 sim 의 자동포션** → ✅ 적용. `/collect` body 로 디바이스 자동 포션 룰을 받아 라이브와 동일하게 sim 에 사용. 보유 0 은 sim 이 공격으로 폴백. 결정성: (룰+seed) 고정 + collect 후 `lastClaimResult` replay.
- **위탁 중 잠금 범위** → ✅ 라이브 사냥·솔로 보스·치유소 회복·코업 보스 잠금. 지역 이동은 v1 미적용.

## 8. 단계

- **PR 1** — `src/adventure/battle/dispatch.ts`(상수) + `offlineSim.ts` 에 70% 후처리 헬퍼(또는 collect 쪽 유틸) + `src/lib/server/dispatchHunt.ts`(`offlineHunt.ts` 복구·간소화).
- **PR 2** — `/api/hunt/dispatch` + `/api/hunt/collect` 라우트 + schema.ts 주석.
- **PR 3** — `useDispatchHunt` 훅 + `BattleView` 위탁 카드/카운트다운/결과 모달 + `GameContext`/`page.tsx` 배선 + 위탁 중 제약(라이브전투·치유소·이동·보스) + HP 델타 적용.
- **PR 4** — `docs/features.md` 갱신, 헤더 "위탁" 배지, 알림 문구, sessionStorage 키 정리.
