# Skill Cards Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. 사용자 지시에 따라 서브에이전트와 추가 승인 단계는 사용하지 않는다.

**Goal:** 승인된 요약/상세 분리 스킬 카드를 장착·학습 화면에 적용한다.

**Architecture:** `describeV2Skill`의 표시 결과를 순수 모델에서 분류한다. 공통 `SkillEffectChips`가 요약과 native details를 렌더하며 부모의 상세창 트리거는 제목만 감싼다.

**Tech Stack:** Next.js 16, React, TypeScript, Tailwind, Vitest, Playwright.

## Global Constraints

게임 계산·카탈로그 데이터·저장 동작은 변경하지 않는다. 기존 효과는 보존한다. 공통 불투명 표면을 사용한다. 로컬 커밋만 수행한다.

### Task 1: Shared summary and details

- [x] `src/adventure/v2/skillCardModel.test.ts`에서 파공 계수 그룹, 표시 비용, 교차 조건, 모든 카탈로그 문구 보존을 먼저 검증한다.
  ```ts
  expect(buildSkillCardModel("v2c_skyascendant_voidbreak")?.resources).toContain("MP 119");
  ```
- [x] `npm test -- src/adventure/v2/skillCardModel.test.ts`로 실패 확인.
- [x] `skillCardModel.ts`에서 `buildSkillCardModel(skillId: string)`을 구현한다. summary, kind, meta, resources, highlights, details, synergy 필드를 반환하고 없는 ID는 null을 반환한다. 반복 피해 계수는 연속 범위만 묶는다.
- [x] `SkillEffectChips.tsx`를 모델 기반 요약·상세로 바꾸고 기존 효과 테스트와 신규 모델 테스트를 통과시킨다.

### Task 2: Card integration

- [x] `V2LoadoutPanel.test.tsx`, `V2SkillLearnView.test.tsx`에 details가 버튼 안에 없는지 검증을 추가하고 실패 확인.
- [x] 두 컴포넌트에서 제목 트리거와 효과를 분리한다. 장착 카드에는 장착 상태, 하단 소형 동작을 표시한다. SP 할인/생활/간략 모드를 보존한다.
- [x] `src/app/dev/skill-loadout/page.tsx`에 파공·낙성·교차 예시를 추가하고 SP 여유를 확보한다.
- [x] 관련 Vitest를 재실행한다.

### Task 3: Visual and regression verification

- [x] `e2e/skill-cards.mobile-ui.spec.ts`로 접기/펼치기, 제목 상세창, 즐겨찾기/장착/해제, 화면 넘침, 불투명 표면을 검사한다.
- [x] 실제 브라우저 스크린샷으로 승인 시안과 비교한다.
- [x] 전체 Vitest, 타입 검사(8GB heap), 변경 파일 ESLint, `git diff --check`를 실행한다.
- [x] 변경 내용을 자체 검토하고 검증 결과를 기록한 뒤 `feat: simplify skill card summaries and details`로 커밋한다.

## 검증 및 검토 기록

- 최종 전체 Vitest: 1,095파일 통과 / 5파일 스킵, 8,614테스트 통과 / 23테스트 스킵(212.99초).
- 관련 Vitest 9파일 / 55테스트 통과.
- Playwright 320/390/1280px × 라이트/다크, 총 6테스트 통과. 키보드 펼치기·접기, 별도 설명창, 즐겨찾기·해제·재장착, 44px 동작 영역, 불투명 배경, 수평 넘침을 확인했다.
- TypeScript 검사(8GB heap, incremental false), 변경 파일 ESLint, diff 공백 검사 통과.
- 바탕화면에 실제 요약/상세 스크린샷을 복사하고 cmp로 원본과 일치를 확인했다.
- 자체 diff 검토: 변경은 표시 모델·공유 UI·부모 배치·개발 미리보기·테스트에 한정된다. 드래그 핸들 이벤트와 저장·학습 요청, SP 계산 코드는 변경하지 않았다.
- 기존 카탈로그의 교차 상세 설명 일부는 직전 공격의 적중을 요구한다고 서술하지만 엔진은 현재 교대 공격의 적중을 검사한다. 이번 신규 연계 요약은 엔진에 맞춰 표기했으며 기존 카탈로그·전체 상세창 문구는 별도 정리 대상으로 남겼다.
- 운영 빌드·배포·통합·푸시는 수행하지 않는다.
