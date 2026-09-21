# 완전식 발동 조건 구현 계획

> 실행: AGENTS.md에 따라 현재 브랜치에서 직접 수행하며 추가 승인 및 서브에이전트 없이 진행한다.

**Goal:** #693의 스킬 조건 설정에서 선택한 주문의 완전식 발동 여부를 사용한다.

**Architecture:** 엔진의 기존 완성 스킬 목록을 조건 컨텍스트로 전달하고, 행동을 결정한 뒤 조건을 평가한다. 저장과 UI는 기존 조건 체계를 확장한다.

**Tech Stack:** TypeScript, React, Next.js, Vitest.

## 제약

- 완전식의 충전 및 소비 규칙과 기존 사용 가능 검사를 유지한다.
- 최적화 없이도 조건이 동작해야 한다.
- 서버/클라이언트 지침은 설치된 Next.js 문서를 따른다.
- 배포와 외부 피드백 변경은 하지 않는다.

## 작업

- [x] `formulaCondition.test.tsx`와 `combatPattern.test.ts`에 실패하는 회귀 테스트 작성. 조건 `{ kind: "formula_completion", active: true }`의 저장 왕복, 두 단계에서 새로운 1단계 주문의 실제 시전과 초기화, 중복/미충전 시 건너뛰기를 검증한다. `active: false`는 반대 결과를 검증한다.
- [x] `npm test -- src/adventure/v2/combat/formulaCondition.test.tsx src/adventure/v2/combat/combatPattern.test.ts`로 기능 미구현에 따른 실패 확인.
- [x] `combatPattern.ts`에서 조건 타입/파서, 선택된 스킬을 받는 `conditionPasses`, 행동 결정 후 조건 평가를 구현한다. `combatShared.ts`에서 완성 가능 ID 목록을 전달한다.
- [x] `engine.ts`, `engine-pvp.ts`에서 완전식 패시브만으로 목록을 계산하고 최적화가 있을 때만 같은 목록을 MP 부족 허용에 사용한다.
- [x] `V2CombatPatternView.tsx`에 조건 선택/기본값/도움말을, `arenaLoadout.ts`에 요약을 추가한다.
- [x] 위 테스트와 기존 패턴/UI/완전식/PvE/PvP 테스트, TypeScript 및 변경 파일 ESLint를 실행한다.
- [x] diff를 직접 검토하고 현재 브랜치에 커밋한다.

## 검증 결과

- 미구현 상태에서 신규 통합 테스트 11개 및 패턴 평가 테스트 4개 실패 확인 후 구현.
- 관련 11개 테스트 파일의 273개 테스트 통과.
- `env NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit --incremental false` 통과. 기본 2GB 힙에서는 메모리 부족으로 중단되어 한도를 늘려 재실행했다.
- 변경 파일 ESLint, `npm run check-module-budgets`, `git diff --check` 통과.
- 직접 diff 검토: 역할 선택은 장착 순서상의 첫 스킬로 고정되며, 조건을 평가하려고 역할을 먼저 해석해도 전투 상태나 RNG를 바꾸지 않는다. UI는 기존 불투명 패널과 카드 안에 버튼 및 도움말만 추가한다.
