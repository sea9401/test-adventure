# 그림자 도약 패턴 수정 Implementation Plan

> 실행: superpowers:executing-plans로 현재 세션에서 직접 수행한다. AGENTS.md에 따라 추가 승인·서브에이전트 없이 진행한다.

**Goal:** 그림자 도약이 사용자가 지정한 조건과 순서를 따른다.

**Architecture:** 공유 패턴 보정 함수의 강제 오프너 삽입을 제거한다. 기본 패턴 생성과 전투당 1회 처리는 유지한다.

**Tech Stack:** TypeScript, Vitest.

## Constraints

- 사용자 작업을 보존하고 관련 파일만 커밋한다.
- 배포·푸시·PR 생성은 하지 않는다.

## Task 1: 사용자 패턴 존중

- [x] `src/adventure/v2/combat/combatPatternCast.test.ts`의 강제 보완 테스트를 제외 존중 테스트로 변경하고, HP 조건·후순위·1회 제한·기본 패턴 테스트를 추가한다.
- [x] `npm test -- src/adventure/v2/combat/combatPatternCast.test.ts`로 기존 강제 발동 때문에 실패함을 확인한다.
- [x] `src/adventure/data/v2/v2Skills.ts`의 `effectiveCombatPatternFromEquipped`는 `withoutLowerDuelistDeclarations(equipped, savedPattern && savedPattern.blocks.length > 0 ? savedPattern : smartDefaultPatternFromEquipped(equipped))`를 반환하도록 줄인다.
- [x] `src/adventure/v2/V2CombatPatternView.tsx`에서 필수 오프너를 보완한다는 오래된 주석을 갱신한다.
- [x] 관련 데이터·시전·PvE·PvP 테스트와 TypeScript 검사를 실행하고 diff를 검토한다.
- [x] 관련 파일만 현재 브랜치에 커밋한다.

## 검증 결과

- 수정 전: 강제 첫 행동으로 인해 회귀 테스트 4개 실패.
- 수정 후: 전투·데이터 245개, 패턴 편집 화면 33개 통과(총 278개).
- 기본 Node 힙 한도에서 타입 검사 메모리 부족 발생. `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit` 재실행 통과.
- `git diff --check` 통과. 공유 함수 호출 경로와 변경 diff를 직접 검토함.
