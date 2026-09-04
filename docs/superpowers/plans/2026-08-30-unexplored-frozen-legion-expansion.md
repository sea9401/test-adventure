# Unexplored Frozen Legion Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 서리 접촉자·빙결 술사·혹한 파수자를 실제 미개척지 사냥에 균등 출현시키고 기존 한기·마법 공격·집중 효과·보상·이미지를 연결한다.

**Architecture:** 기존 풀별 `releaseStage`와 몬스터 ID 기반 런타임 구조를 재사용한다. 혹한 군단을 `expanded`로 전환하면 조우, 서버 사냥 준비, 집중 효과, 풀 공통 보상은 기존 공통 경로를 따른다. 이미 배선된 `mob_chilling_touch`, `mob_deep_chill`, `mob_glacial_chill`, `mob_arcane_bolt`, `mob_arcane_nova`는 변경하지 않는다.

**Tech Stack:** TypeScript, Vitest, Next.js 정적 이미지 자산, Sharp 기반 프로젝트 이미지 최적화/검사 스크립트

## Global Constraints

- 앞의 열한 개 특수 풀만 `expanded`; 파쇄 거수는 `launch` 상태를 유지한다.
- 혹한 군단 세 몬스터는 각각 1/3 확률로 출현한다.
- 새 빙결 규칙을 만들거나 기존 한기·마법 공격 수치를 변경하지 않는다.
- 집중은 서리 접촉자의 `한기`만 `심층 한기`로 교체하고 두 특화형의 기존 스킬·공격 타입·MP를 보존한다.
- 세 몬스터는 같은 `v2_unexplored_frozen_legion_material`과 드롭 확률을 사용한다.
- 신규 이미지는 512×512 WebP, 실제 RGBA 알파 배경, 청백색 빙정·서리 안개·청색 발광의 사실적인 어두운 판타지 스타일이다.
- 배포, 병합, 푸시, PR 생성은 하지 않는다.

---

### Task 1: 혹한 군단 활성화와 런타임 배선

**Files:**
- Modify: `src/adventure/data/v2/unexploredMonsterPools.ts`
- Modify: `src/adventure/data/v2/unexploredMonsterPools.test.ts`
- Modify: `src/adventure/data/v2/unexploredEncounters.test.ts`
- Modify: `src/adventure/data/v2/unexploredSimulationMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.ts`
- Modify: `src/adventure/data/v2/unexploredMonsters.test.ts`
- Modify: `src/adventure/data/v2/unexploredHuntRewards.test.ts`
- Modify: `src/lib/server/unexploredHunt.test.ts`

- [x] **Step 1: 풀·조우·시뮬레이션·런타임·서버·보상 실패 테스트를 작성한다**

풀은 앞의 열한 개만 `expanded`이고 혹한 군단 활성 ID는 `frost_toucher | freezing_mage | frozen_sentinel`이어야 한다. 조우 RNG `0`, `0.34`, `0.67`은 세 몬스터를 순서대로 선택해야 한다.

시뮬레이션과 런타임은 서리 접촉자의 `mob_chilling_touch`, 빙결 술사의 `mob_deep_chill | mob_arcane_bolt`, 혹한 파수자의 `mob_glacial_chill | mob_arcane_nova`를 검사한다. 후자의 두 몬스터는 `atkType: "magic"`, 혹한 파수자는 `v2MaxMp: 70`이어야 한다.

런타임 카탈로그는 활성 특수 34종과 전체 39종을 기대한다. 집중 후 서리 접촉자는 `mob_deep_chill`로 교체되고 두 특화형의 스킬·마법 공격 타입·최대 MP는 보존되어야 한다. 서버 테스트는 RNG `0.34`, `0.67`로 확장 몬스터 ID가 보존되는지 검사하고 미출시 거부 대상은 `crushing_colossi/ironwall_crusher`로 옮긴다. 보상 테스트는 세 활성 몬스터 모두 혹한 결정, 확률 0.01, 수량 1을 기대한다.

- [x] **Step 2: 관련 테스트를 실행해 출시 단계·런타임 이미지 때문에 실패함을 확인한다**

Run: `npm test -- src/adventure/data/v2/unexploredMonsterPools.test.ts src/adventure/data/v2/unexploredEncounters.test.ts src/adventure/data/v2/unexploredSimulationMonsters.test.ts src/adventure/data/v2/unexploredMonsters.test.ts src/adventure/data/v2/unexploredHuntRewards.test.ts src/lib/server/unexploredHunt.test.ts`

- [x] **Step 3: 출시 단계와 이미지 경로를 최소 변경한다**

혹한 군단에 `releaseStage: "expanded"`를 추가하고 `SPECIAL_IMAGE_PATHS`에 `freezing_mage`, `frozen_sentinel`의 WebP 경로를 추가한다.

- [x] **Step 4: 관련 테스트를 다시 실행해 통과시킨다**

- [x] **Step 5: `feat: activate frozen legion monster roster`로 커밋한다**

### Task 2: 빙결 술사와 혹한 파수자 이미지

**Files:**
- Create: `public/images/monster/v2/unexplored-freezing-mage.webp`
- Create: `public/images/monster/v2/unexplored-frozen-sentinel.webp`

- [x] **Step 1:** 기존 서리 접촉자를 스타일 참조로 가늘고 연약한 빙결 술사를 투명 배경 전신 렌더로 생성한다.
- [x] **Step 2:** 기존 서리 접촉자를 스타일 참조로 넓고 무거운 혹한 파수자를 투명 배경 전신 렌더로 생성한다.
- [x] **Step 3:** PNG 알파를 검사하고 필요하면 built-in image generation으로 배경 추출 편집을 수행한다.
- [x] **Step 4:** 프로젝트 경로로 옮기고 `npm run optimize-images`를 실행한다.
- [x] **Step 5:** 두 파일이 512×512, 4채널, 실제 알파인지 확인하고 `npm run check-images`와 육안 검사를 수행한다.
- [x] **Step 6:** `feat: add frozen legion variant artwork`로 커밋한다.

### Task 3: 전체 검증과 완료 정리

- [x] **Step 1:** 위 관련 테스트를 실행한다.
- [x] **Step 2:** 변경 파일 ESLint와 `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`을 실행한다.
- [x] **Step 3:** `npm run check-images`와 `npm test`를 실행한다.
- [x] **Step 4:** `V2_UNEXPLORED=true npm run build`를 실행한다.
- [x] **Step 5:** `git diff --check`, 상태와 최근 커밋을 확인한다. 배포·병합·푸시·PR은 하지 않는다.
