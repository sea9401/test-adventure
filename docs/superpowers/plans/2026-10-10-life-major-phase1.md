# 생활 전공·명장 단계 1차 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Lv.100 생활 중 주전공·부전공을 지정하면 넘친 경험치가 명장 단계로 쌓이고, 효율 보너스와 명장 산물 4종(거래 가능)을 얻게 한다.

**Architecture:** 순수 규칙 `src/adventure/v2/lifeMajor.ts`(상태·단계·보너스·확률·지정 검증), 서버 헬퍼 `src/lib/server/lifeMajor.ts`(세이브 잠금·적립·산물 굴림), 활동 라우트 연결, 지정 API, 생활 기록 카드. 넘친 경험치는 각 경로에서 `획득량 − (적용 후 − 적용 전)`으로 계산한다.

**Tech Stack:** Next.js 16 라우트 핸들러, savesKv, Vitest, React + Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-10-life-major-design.md` (1차 = 1~8절)

## Global Constraints

- 전공 대상: `farming`·`woodcutting`·`mining`·`fishing`·`cooking`. 지정 조건 Lv.100. 변경 쿨다운 30일(`30 × 86_400_000` ms), 처음 채우기는 무료.
- 단계 누적 `M(k) = round(T100 × k × (k + 1) / 110)`, k=1..10. `T100 = extendedLifeXpThreshold(100, legacy)`(생활별 legacy threshold).
- 효율: 주전공 `1 × 단계`, 부전공 `0.5 × 단계` (%/%p).
- 산물 확률: 주전공 `0.5 + 0.15 × 단계`(%), 부전공 절반. 산물 ID `v2_master_crop`·`v2_master_catch`·`v2_master_wood`·`v2_master_alloy`. 요리는 산물 없음.
- 세이브 키 `life-major.v1`. 활동 라우트에서는 기존 잠금들 **뒤에** 잠근다.
- 축제 때처럼 기존 라우트 테스트의 시각·세이브 의존을 피한다(전공 세이브가 없으면 효과 0).
- 사용자 문구에 "v2" 금지, 표면 토큰 사용, 배포·운영 데이터 수정 없음.

## Review Focus

1. 경험치가 상한을 **걸쳐** 넘는 한 번의 획득 → 넘친 부분만 명장 경험치(Task 1 `lifeXpOverflow` 테스트).
2. 산물을 지급한 라우트가 캐릭터 세이브를 나중에 자기 사본으로 덮어써 산물이 사라지는 경우 → 각 라우트 테스트에서 최종 `character.v2.materials`에 산물이 남는지 확인(Task 3).
3. 10단계 도달 후 추가 적립 → 상한 고정, 넘침 버림(Task 1).
4. 쿨다운 중 주·부전공 맞바꿈 → `change_cooldown`(Task 1·4).
5. 부전공만 Lv.100 생활이고 주전공은 비어 있는 지정 → 허용(주전공 없이 부전공만은 거절: `major_required`)(Task 1).

---

### Task 1: 순수 규칙과 재료 등록

**Files:**
- Create: `src/adventure/v2/lifeMajor.ts`, `src/adventure/v2/lifeMajor.test.ts`
- Modify: `src/adventure/data/v2/dungeonDrops.ts` (`V2_MATERIALS`에 산물 4종, NPC 판매 비등록)

**Interfaces (Produces):**
- `LIFE_MAJOR_SAVE_KEY = "life-major.v1"`, `LIFE_MAJOR_ACTIVITIES`, `type LifeMajorActivity`, `type LifeMajorState`(명세 5절), `LIFE_MAJOR_CHANGE_COOLDOWN_MS`, `LIFE_MAJOR_MAX_STAGE = 10`
- `LIFE_MAJOR_PRODUCT_ID: Record<Exclude<LifeMajorActivity,"cooking">, string>` / 이름: 명장 작물·명장 어획·명장 목재·명장 합금
- `parseLifeMajorState(raw: unknown): LifeMajorState`
- `lifeMajorT100(activity): number` (생활별 legacy threshold 사용: 농사 `legacyFarmingLevelXpThreshold` 등 — 각 모듈에서 export 필요 시 export 추가)
- `lifeMajorStageForXp(activity, xp): { stage, xpInto, xpForNext, capped }`, `lifeMajorStageXp(activity, stage): number`
- `lifeMajorRole(state, activity): "major" | "minor" | null`
- `lifeMajorBonusPct(state, activity): number` (주 1×단계, 부 0.5×단계, 아니면 0)
- `lifeMajorProductChancePct(state, activity): number` (요리·비전공 0)
- `lifeXpOverflow({ gained, before, after }): number` = `max(0, gained − max(0, after − before))`
- `addLifeMajorXp(state, activity, overflowXp): { state, gained }` — 전공일 때만, M(10) 상한
- `assignLifeMajors(state, { major, minor }, levels: Record<LifeMajorActivity, number>, now): { state } | { error: "invalid_activity" | "not_level_100" | "same_activity" | "major_required" | "change_cooldown" }` — "처음 채우기"(이전 값 null → 값)는 쿨다운 무시·`lastChangedAt` 미갱신, 그 외 달라지는 슬롯이 있으면 변경

- [ ] **Step 1: 실패 테스트** — 단계: `lifeMajorStageXp(a, 10) === T100(a)`, 1~10 단조 증가, `lifeMajorStageForXp(a, M(3))` → stage 3. 보너스/확률: 주 3단계 → 3 / 0.95, 부 3단계 → 1.5 / 0.475, 요리 확률 0, 비전공 0. `lifeXpOverflow`: (10,100,110)→0, (10,100,105)→5, (10,100,100)→10. `addLifeMajorXp`: 비전공 gained 0, 상한 고정. `assignLifeMajors`: 처음 지정 OK·lastChangedAt null 유지, Lv.99 → not_level_100, 같은 생활 → same_activity, 주 없이 부 → major_required, 지정 후 29일 변경 → change_cooldown, 31일 변경 OK·lastChangedAt=now, 맞바꿈도 쿨다운 대상, 부전공 처음 채우기는 쿨다운 무시. 파싱: 손상값 정리, 알 수 없는 활동 제거. 재료: `V2_MATERIALS`에 4종 등록.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/lifeMajor.test.ts`
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인**
- [ ] **Step 5: 커밋** — `feat: 생활 전공 규칙과 명장 산물 재료`

---

### Task 2: 서버 헬퍼

**Files:**
- Create: `src/lib/server/lifeMajor.ts`, `src/lib/server/lifeMajor.test.ts`

**Interfaces (Produces):**
- `readLifeMajorState(executor, userId): Promise<LifeMajorState>`
- `applyLifeMajorProgress(tx, userId, activity, { overflowXp, successes, rng }): Promise<{ masteryXpGained: number; productId: string | null; productCount: number }>` — `life-major.v1` 잠금 → 전공이 아니면 아무것도 쓰지 않고 0 반환 → `addLifeMajorXp` → 산물은 `successes`회 독립 굴림(`rng() * 100 < chance`) → 세이브 저장(`masterProductsEarned` 누적). 산물은 **반환만** 하고 캐릭터 세이브는 쓰지 않는다(호출 라우트가 자기 재료 쓰기에 합친다).

- [ ] **Step 1: 실패 테스트**(savesKv 모킹): 비전공이면 upsert 0회·0 반환; 주전공 3단계 + overflow 100 → masteryXp +100; successes 5, rng 0.001 고정 → productCount 5, rng 0.99 → 0; 요리 → productId null.
- [ ] **Step 2~4**: 실패 확인 → 구현 → 통과
- [ ] **Step 5: 커밋** — `feat: 생활 전공 적립·산물 서버 헬퍼`

---

### Task 3: 활동 연결

**Files (Modify):**
- 효율(시작 시점, 축제 보너스 옆에 더함): `farm/harvest/route.ts`(yieldBonusPct), `woodcutting/start|auto`(bonusLogChancePct·bonusMaterialRate), `mining/start|auto`(bonusOreChancePct·bonusMaterialRate), `fishing/cast`(specialWeightPct), `cooking/route.ts` craft(masterpieceChancePct). 값은 `lifeMajorBonusPct(await readLifeMajorState(...), activity)`.
- 적립·산물(성공 시점): `farm/harvest`(successes 1), `woodcutting/chop`(성공 1), `woodcutting/auto`(settlement.successes), `mining/strike`(1), `mining/auto`(settlement.successes), `fishing/reel`(잡았을 때 1), `cooking/route.ts`(craft·research, successes 0). `overflowXp = lifeXpOverflow({ gained: 그 경로의 최종 획득량, before: 적용 전 xp, after: 적용 후 xp })`.
- 산물은 해당 라우트가 저장할 `character.v2.materials`에 `mergeDrops`로 합친다. 응답에 `masteryXpGained`, `masterProduct`(`{ materialId, name, count }` | null)를 추가한다.
- Test: `src/lib/server/{farmHarvestRoute,woodcuttingRoute,miningRoute,fishingReelRoute}.test.ts`, `src/app/api/v2/cooking/route.test.ts`

- [ ] **Step 1: 실패 테스트** — 각 파일에 2건씩: (a) Lv.100·주전공 3단계 세이브 + 성공 → `life-major.v1.masteryXp[activity]`가 그 경로 경험치만큼 증가, Math.random 0.001이면 최종 `character.v2.materials[산물]` 증가, 응답 `masteryXpGained`·`masterProduct`; (b) 시작 라우트(또는 수확·조리)에서 효율 보너스 +3이 축제 보너스와 같은 필드에 반영. 요리는 (a)에서 산물 없음.
- [ ] **Step 2~4**: 실패 확인 → 구현 → 통과(+ 각 라우트 기존 테스트 전부 통과)
- [ ] **Step 5: 커밋** — `feat: 생활 전공 효율·명장 경험치·산물을 활동에 연결`

---

### Task 4: 전공 지정 API

**Files:**
- Create: `src/app/api/v2/life-major/route.ts`, `src/lib/server/lifeMajorRoute.test.ts`

**Interfaces:** 명세 6절. 생활별 레벨은 기존 생활 요약(`lifeSummaryFromSaves`)으로 계산한다. POST는 `life-major.v1` 잠금 → `assignLifeMajors` → 저장. `nextChangeAt = lastChangedAt + 30일`(null이면 null).

- [ ] **Step 1: 실패 테스트** — GET: 생활별 eligible/stage/effectText/productChancePct; POST 성공, `not_level_100` 409, `change_cooldown` 409(응답에 nextChangeAt), 잘못된 본문 400.
- [ ] **Step 2~4**
- [ ] **Step 5: 커밋** — `feat: 생활 전공 지정 API`

---

### Task 5: 화면·매뉴얼·전체 검증

**Files:**
- Create: `src/adventure/v2/LifeMajorCard.tsx`, `LifeMajorCard.test.tsx`, `src/adventure/v2/lifeMajorClient.ts`(응답 타입·오류 문구)
- Modify: `src/adventure/v2/V2LifeRecordView.tsx`(카드 배치), 활동 화면 5곳(축제 표시 옆에 "주전공 · 명장 N단계" 한 줄 — `LifeMajorBadge`, 전공 아닐 때 null), `src/app/manual/content/pastimes.tsx` + `current-content.test.tsx`

- [ ] **Step 1: 실패 테스트** — 카드: Lv.100 없음 → 잠금 안내; 선택지는 Lv.100만 활성; 쿨다운 중 "다음 변경 가능" 표시·저장 버튼 비활성; 저장 시 POST 본문; 표면 토큰. 매뉴얼: "생활 전공", "명장 단계", "30일", 산물 4종 이름.
- [ ] **Step 2~4**
- [ ] **Step 5: 전체 검증** — `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`, `npx vitest run`, `npm run lint`, `npm run check-images`, anti-slop scan
- [ ] **Step 6: 커밋** — `feat: 생활 전공 화면과 매뉴얼`
