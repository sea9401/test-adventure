# 생활 전공 2차 (명장 요리·단련 촉매) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 명장 산물의 쓰임을 연다. 요리 주전공은 명장 요리(새 품질 `signature`), 채광 주전공은 단련 촉매(강화 하락 −10%p)를 만든다.

**Spec:** `docs/superpowers/specs/2026-10-10-life-major-design.md` 9~11절

## Global Constraints

- 제작 조건: 해당 생활 **주전공** 명장 3단계 이상(`LIFE_MAJOR_CRAFT_MIN_STAGE = 3`). 부전공은 제작 불가.
- 명장 요리: 성능 +35(걸작 +20), 성능 상한 135→150, 배달 점수 200, 지속시간 2배(24시간). 재료 = 보유 걸작 요리 1 + (레시피 분야 `seafood`면 명장 어획, 아니면 명장 작물) 1. 결과는 같은 레시피·원조·전문 값을 유지한 `signature` 요리 1개.
- 단련 촉매 `v2_tempering_catalyst`: 명장 합금 2 + 명장 목재 1 → 1. `V2_MATERIALS` 등록(거래 가능, NPC 판매 없음).
- 강화: 촉매 사용 시 시도당 1개 소모. 강화석 변환과 +10 체크포인트 처리 **뒤** 하락에서 `min(10, 하락)`을 유지로 옮긴다. 그 시점 하락이 0이면 사용 불가(`catalyst_not_needed`).
- 품질 순서: normal < careful < masterpiece < signature. "걸작 이상" 요건은 명장 요리도 충족.

## Review Focus

1. 기존 저장 요리 ID·활성 버프(normal/careful/masterpiece)가 그대로 파싱되는지(Task 1).
2. 명장 요리 만들기 중 걸작이 아닌 요리·보유 0·산물 부족 → 무변경 거절(Task 2).
3. 촉매 선택 + 먹이(feed) + 강화석 조합에서 결과표 합이 100 유지(Task 3).
4. 촉매 보유 0으로 사용 요청 → 409, 재료·장비 무변경(Task 3).
5. 부전공 3단계 이상이 제작 요청 → 거절(Task 2·3).

### Task 1: 요리 품질 `signature`
Files: `cooking/foodShared.ts`, `cooking/food.ts`, `cooking/delivery.ts`, `CookingPanel.tsx`(품질 순서), `lifeFestival.ts`·`lifeFestivalClient.ts`·`lib/server/lifeFestival/inventory.ts`(품질 순서·타입). Tests: `cooking/food.test.ts`, `cooking/delivery.test.ts`, `lifeFestival.test.ts`.
- [ ] 실패 테스트: `cookingQualityName("signature") === "명장"`; `cookingPerformancePct({signature, originator, s5}) === 150`; `COOKING_QUALITY_DELIVERY.signature === 200`; `parseCookingFoodIdFormat("food2:x:signature:o0:s0")` 성공·기존 3품질 유지; 정의 `durationMs === 2 × COOKING_BUFF_DURATION_MS`·이름 태그 "명장"; 활성 버프 quality signature 보존; 배달 최소 품질 masterpiece 를 signature 가 충족; 축제 `minQuality: "masterpiece"` 요건을 signature 가 충족.
- [ ] 구현 → 통과 → 커밋 `feat: 요리 품질 명장 추가`

### Task 2: 명장 요리 만들기
Files: `lifeMajor.ts`(`LIFE_MAJOR_CRAFT_MIN_STAGE`, `lifeMajorCanCraft(state, activity)`, `signatureIngredientFor(field)`), `api/v2/cooking/route.ts`(action `signature`, view `signature` 블록), `cooking/CookingSignaturePanel.tsx`, `CookingPanel.tsx`(탭). Tests: `lifeMajor.test.ts`, `cooking/route.test.ts`, `cooking/CookingSignaturePanel.test.tsx`.
- 거절 코드: `signature_locked`(주전공 3단계 미만), `not_masterpiece`, `not_enough_food`, `not_enough_master_product`.
- view: `signature: { unlocked, stage, requiredStage, products: { crop, catch } }` — `life-major.v1`·`character.v2.materials`에서 계산.
- 탭은 `unlocked`일 때만 보인다. 패널은 보유 걸작 요리 목록(필요 산물·보유 수)과 "명장 요리로" 버튼.
- [ ] 실패 테스트 → 구현 → 통과 → 커밋 `feat: 요리 주전공의 명장 요리 만들기`

### Task 3: 단련 촉매
Files: `lifeMajorProducts.ts`(`TEMPERING_CATALYST`), `dungeonDrops.ts`(등록), `v2Enhance.ts`(`enhanceOutcomeRow(level, choice, { catalyst })`, `enhanceCatalystUsable`, `rollEnhanceOutcome` 옵션), `api/v2/me/enhance/route.ts`(body `catalyst`), `api/v2/life-major/catalyst/route.ts`(POST `{ quantity }` 1~20), `api/v2/life-major/route.ts`(GET `crafting` 블록), `LifeMajorCard.tsx`(제작 행), `V2EnhanceView.tsx`(사용 선택). Tests: `v2Enhance.test.ts`, 강화 라우트 테스트, `lifeMajorRoute.test.ts`, `LifeMajorCard.test.tsx`, 재료 수 검사(127→128).
- [ ] 실패 테스트 → 구현 → 통과 → 커밋 `feat: 채광 주전공의 단련 촉매와 강화 연결`

### Task 4: 매뉴얼·전체 검증
- [ ] 매뉴얼에 명장 요리·단련 촉매 문단(상수 사용) + 테스트
- [ ] tsc / vitest / lint / check-images / anti-slop scan → 커밋 `docs: 매뉴얼에 명장 요리·단련 촉매 안내`
