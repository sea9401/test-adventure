# 결계 행동패턴 구현 계획

**Goal:** 세 결계 중 하나라도 없을 때 만법불침을 선택하는 패턴 지원.

**Architecture:** 기존 self_resource와 any 조건을 재사용하고 양쪽 엔진의 시전자 결계 상태를 공통 평가기에 연결한다.

**Tech Stack:** TypeScript, React, Vitest.

## 작업 순서

- [x] `combatPattern.test.ts`에 세 자원 저장·프리셋 왕복 및 OR/경계 비교 테스트를 추가한다.
- [x] `tripleWardPve.test.ts`, `tripleWardPvp.test.ts`에 전부 남으면 미시전, 각 결계가 소진되면 재전개하는 테스트를 추가한다.
- [x] `V2CombatPatternView.test.tsx`에서 세 결계 이름 및 설정 예시 표시를 검증하고 테스트 실패를 확인한다.
- [x] `combatPattern.ts`의 타입·파서, `combatShared.ts`의 시전자 입력·자원 합성, `engine.ts`와 `engine-pvp.ts`의 상태 전달을 확장한다.
- [x] `V2CombatPatternView.tsx`의 자원 선택지와 OR 설정 예시를 추가한다.
- [x] `arenaLoadout.ts`의 결계 자원 표시 이름을 추가하고 `arenaLoadout.test.ts`로 요약 표시를 검증한다.
- [x] 관련 테스트, TypeScript 검사, 변경 파일 ESLint, diff 검토 후 현재 브랜치에 커밋한다. 서브에이전트·배포·외부 쓰기는 수행하지 않는다.

검증: 관련 8개 테스트 파일 205개, 전체 TypeScript 검사(6GB 힙), 변경 파일 ESLint 통과. 새 테스트의 구현 전 실패 13개를 확인한 뒤 구현했다. 코드 리뷰는 저장 호환성, 시전자 구분, 기존 스킬 실행 게이트, 기존 불투명 UI 표면 유지를 직접 확인했다.
