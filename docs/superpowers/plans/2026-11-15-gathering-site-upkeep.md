# 채집지 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 광맥 6곳·숲 6곳마다 원자재와 부산물로 올리는 정비 단계를 두고, 단계만큼 그 채집지의 느긋한 자동 채집 시간을 늘린다.

**Architecture:** 규칙은 화면도 읽는 순수 모듈 하나에 둔다. 단계는 `life-workshop.v1`의 선택 필드에 저장하고, 정비는 전용 라우트가 처리한다. 자동 채집 라우트는 시작할 때 단계를 읽어 작업 시간을 세션에 굳힌다.

**Tech Stack:** Next.js App Router, TypeScript, vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-11-15-gathering-site-upkeep-design.md`

## Global Constraints

- 단계 0~5는 누구나, 6단계는 그 생활(광맥=채광, 숲=벌목) 주전공 명장 3단계 이상(`lifeMajorCanCraft`).
- 느긋한 작업 시간(분): `[120, 132, 144, 156, 168, 180, 210]`. 기본 작업 30분과 효율(재료 60%, 성공률 80%, 경험치 70%)은 그대로.
- 1회분(등급 1~6): `640, 550, 430, 350, 270, 220`. 단계별 회분: `3, 8, 15, 25, 40, 60`.
- 부산물: 1·2단계 단단한 돌 200·400, 3·4단계 석탄 250·500, 5·6단계 원석 보석 400·600. 6단계 명장 산물 20.
- 칭호: 개척자(단계 합계 24 이상), 산과 숲의 주인(12곳 모두 5단계 이상).
- 잠금 순서: `character.v2` → `life-workshop.v1`.
- 패널·카드 배경은 `SURFACE_*` 토큰, 글씨는 12px 이상, 새 이모지·그라데이션 없음(`.claude/skills/anti-slop-ui`).
- 화면 문구에 개발 경위·"v2"를 쓰지 않는다. 일수·수량은 코드 상수를 읽는다.
- `/tmp` 워크트리 `feat/gathering-site-upkeep`에서 작업하고, 푸시·배포는 하지 않는다.

## Review Focus

- 진행 중인 자동 채집은 정비해도 길어지지 않는다 → Task 2가 세션에 `durationMs`를 굳히는 것을 검사한다.
- 정비 단계를 모르는 다른 공방 동작(가공·도구 승급)이 저장할 때 `siteUpkeep`를 지우지 않는다 → Task 1의 파서 왕복 검사.
- 세이브의 단계가 범위를 벗어나면(99, 음수, 소수) 0~6으로 맞춘다 → Task 1.
- 채광 주전공이 숲의 6단계를 열지 못한다(반대도) → Task 1·3.
- 재료가 정확히 필요량과 같을 때 정비되고 그 재료 키가 0으로 남지 않는다 → Task 1·3.

---

### Task 1: 규칙 모듈과 저장 필드

**Files:**
- Create: `src/adventure/v2/gatheringSiteUpkeep.ts`, `src/adventure/v2/gatheringSiteUpkeep.test.ts`
- Modify: `src/adventure/data/titles.ts`, `src/adventure/v2/lifeWorkshop.ts`, `src/adventure/v2/lifeWorkshop.test.ts`

**Interfaces (Produces):**

```ts
export type GatheringSiteActivity = "mining" | "woodcutting";
export type GatheringSiteId = MiningNodeId | WoodcuttingTreeId;
export type GatheringSite = { id: GatheringSiteId; activity: GatheringSiteActivity; name: string; grade: 1|2|3|4|5|6; materialId: string; materialName: string };
export const GATHERING_SITES: readonly GatheringSite[];           // 광맥 6(등급순) 뒤에 숲 6(등급순)
export const GATHERING_SITE_BASE_MAX_STAGE = 5;
export const GATHERING_SITE_MASTER_STAGE = 6;
export const GATHERING_SITE_MASTER_PRODUCT_COUNT = 20;
export const GATHERING_SITE_TITLE_TOTAL_STAGE = 24;
export type GatheringSiteUpkeepState = Partial<Record<GatheringSiteId, number>>;
export function isGatheringSiteId(value: unknown): value is GatheringSiteId;
export function parseGatheringSiteUpkeep(raw: unknown): GatheringSiteUpkeepState; // 0단계·모르는 id 생략
export function gatheringSiteStage(state: GatheringSiteUpkeepState, id: GatheringSiteId): number;
export function gatheringSiteExtendedDurationMs(stage: number): number;
export type GatheringSiteCost = { materialId: string; materials: number; byproductId: string; byproducts: number; masterProductId: string; masterProducts: number };
export function gatheringSiteCost(id: GatheringSiteId, targetStage: number): GatheringSiteCost | null;
export type GatheringSiteUpkeepContext = { materials: Record<string, number>; masterUnlocked: Record<GatheringSiteActivity, boolean> };
export type GatheringSiteBlockReason = "upkeep_max" | "upkeep_master_locked" | "not_enough_materials" | "not_enough_byproducts" | "not_enough_master_product";
export function gatheringSiteBlockReason(state, id, context): GatheringSiteBlockReason | null; // 위 순서로 판정
export class GatheringSiteUpkeepError extends Error { code: GatheringSiteBlockReason }
export function upkeepGatheringSite(state, id, context): { state: GatheringSiteUpkeepState; materials: Record<string, number>; result: { siteId; siteName; stage; extendedDurationMs; cost } };
export function gatheringSiteTotalStage(state): number;
export function gatheringSiteEarnedTitleIds(state): string[];
```

- 숲의 이름은 `WOODCUTTING_SPOTS`의 `shortName`("소나무숲"), 광맥은 `MINING_NODES`의 `name`("철 광맥").
- 명장 산물 id는 `LIFE_MAJOR_PRODUCT_ID.mining` / `.woodcutting`.
- 칭호 id: `GATHERING_PIONEER_TITLE_ID = "gathering_pioneer"`, `GATHERING_SITE_MASTER_TITLE_ID = "gathering_site_master"`, 분류 `collection`.
- `LifeWorkshopState.siteUpkeep?: GatheringSiteUpkeepState` — 비어 있으면 필드를 두지 않는다.

- [ ] 실패하는 테스트 작성: 12곳 구성과 등급, 철 광맥 비용 표(1,920 / 5,120 / 9,600 / 16,000 / 25,600 / 38,400), 편백나무숲 6단계(13,200 + 원석 보석 600 + 명장 목재 20), 시간 표, 범위 밖 단계 보정, 판정 순서, 채광 주전공만 있을 때 숲 6단계 잠금, 정확히 필요량일 때 재료 키 삭제, 합계 24와 12곳 5단계의 칭호, 공방 파서 왕복.
- [ ] 실패 확인 → 구현 → 통과 확인 → 커밋.

### Task 2: 자동 채집 시간

**Files:**
- Modify: `src/adventure/v2/autoGathering.ts`, `src/adventure/v2/autoGathering.test.ts`, `src/app/api/v2/mining/auto/route.ts`, `src/app/api/v2/woodcutting/auto/route.ts`, 두 자동 라우트의 테스트

**Interfaces:**
- Consumes: `gatheringSiteStage`, `gatheringSiteExtendedDurationMs`, `parseLifeWorkshopState(...).siteUpkeep`.
- Produces: `createAutoGatheringSession({ ..., extendedDurationMs?: number })` — 계획이 `extended`일 때만 쓰고, 계획 기본 시간보다 짧거나 4시간보다 길면 무시한다. 세션과 세션 뷰에 `durationMs?: number`(굳힌 작업 시간). `autoGatheringDurationLabel(durationMs: number): string` → `"30분"`, `"2시간"`, `"2시간 12분"`.

- [ ] 실패하는 테스트: 5단계 시간(3시간)으로 만든 느긋한 세션의 `readyAt`·`attempts`·`durationMs`, 같은 값을 준 기본 작업은 30분 그대로, 파서가 `durationMs`를 보존, 라벨 세 가지, 채광 자동 시작이 정비 3단계 채집지에서 2시간 36분 세션을 만든다.
- [ ] 실패 확인 → 구현 → 통과 확인 → 커밋.

### Task 3: 정비 API

**Files:**
- Create: `src/lib/server/gatheringSiteUpkeep.ts`, `src/app/api/v2/life-workshop/upkeep/route.ts`, `src/app/api/v2/life-workshop/upkeep/route.test.ts`
- Modify: `src/app/api/v2/mining/status/route.ts`, `src/app/api/v2/woodcutting/status/route.ts`

**Interfaces:**
- Produces: `GatheringSiteUpkeepView = { stages: GatheringSiteUpkeepState; materials: Record<string, number>; masterUnlocked: Record<GatheringSiteActivity, boolean> }`, `gatheringSiteUpkeepView(workshop, materialsRaw, lifeMajorRaw)`. `GET`/`POST /api/v2/life-workshop/upkeep`(설계 문서 7번). 두 status 응답에 `siteUpkeep`.

- [ ] 실패하는 테스트: 401, 잘못된 `siteId` 400, 성공 시 재료 차감·단계 저장·응답, 재료 부족 409 `not_enough_materials`, 6단계 잠금 409, 주전공 명장 3단계면 6단계 성공과 명장 산물 차감, 합계 24를 넘는 요청에서 칭호 지급, 다른 공방 필드 보존.
- [ ] 실패 확인 → 구현 → 통과 확인 → 커밋.

### Task 4: 화면

**Files:**
- Create: `src/adventure/v2/gatheringSiteUpkeepClient.ts`, `src/adventure/v2/GatheringSiteUpkeepPanel.tsx`, `src/adventure/v2/GatheringSiteUpkeepPanel.test.tsx`, `src/app/dev/gathering-upkeep/page.tsx`
- Modify: `src/adventure/v2/AutoGatheringCard.tsx`(+테스트), `src/adventure/v2/LifeWorkshopView.tsx`, `src/adventure/v2/useMining.ts`, `src/adventure/v2/useWoodcutting.ts`, `src/adventure/v2/MiningView.tsx`, `src/adventure/v2/WoodcuttingView.tsx`, `src/adventure/v2/LifeMajorCard.tsx`, `src/app/dev/page.tsx`

- 패널: `GatheringSiteUpkeepPanel({ preview?: GatheringSiteUpkeepView; onChanged?: () => void })`. 한 카드 안에 합계·칭호 진행도, 광맥 6행, 숲 6행. 행마다 이름, 단계, 느긋한 작업 시간, 비용(보유/필요), "정비" 버튼, 6단계 잠금 안내.
- 자동 채집 카드: `extendedDurationMs?: number` prop. 계획 선택과 시작 버튼, 진행 중 제목이 실제 시간을 보여 준다.
- 공방 탭 `upkeep` "채집지 정비". 정비 뒤 공방 재료를 다시 불러온다.

- [ ] 실패하는 테스트: 패널이 단계·시간·비용을 보여 주고 모자란 재료를 구분한다, 정비 버튼이 요청을 보내고 결과로 갱신한다, 6단계 잠금 안내, 자동 채집 카드가 `extendedDurationMs`로 "2시간 36분"을 보여 준다.
- [ ] 실패 확인 → 구현 → 통과 확인 → 미리보기 화면 390·1280 라이트·다크 확인 → 커밋.

### Task 5: 안내서·기록·전체 검증

**Files:**
- Create: `src/app/manual/content/pastimes-gathering-upkeep.tsx`, `docs/content-modification-records/2026-11-15-gathering-site-upkeep.md`
- Modify: `src/app/manual/content/pastimes.tsx`, `src/app/manual/current-content.test.tsx`, 칭호·재료 수를 고정한 테스트(있으면)

- [ ] 안내서 항목과 검사 추가, 변경 기록 작성.
- [ ] `npx vitest run`, `NODE_OPTIONS=--max-old-space-size=6144 npx tsc --noEmit`, `npx eslint <변경 파일>`, `npm run check-module-budgets`, `bash .claude/skills/anti-slop-ui/scan.sh origin/main`.
- [ ] 커밋.
