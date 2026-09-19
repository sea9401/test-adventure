# 결투가 패턴 블록 보존 구현 계획

> **For agentic workers:** `superpowers:executing-plans` 절차로 직접 실행한다.
> AGENTS.md에 따라 별도 승인 단계와 서브에이전트 없이 현재 브랜치에서 진행한다.

**Goal:** #687의 저장된 선언 블록이 화면 재진입 시 사라지는 문제를 수정한다.

**Architecture:** 에디터 초기화에서 저장 블록을 직접 보존하고 미설정·빈 패턴에만
스마트 기본값을 사용한다. 기존 선언 판별 함수로 하위 선언 블록의 연계 상태를
안내한다. 전투 필터와 저장 API는 변경하지 않는다.

**Tech Stack:** React, TypeScript, Vitest, Testing Library.

## 제약

- 저장 조건·순서, 프리셋, 교대 블록을 보존한다.
- 기존 최고 선언 시전·효과 합성 규칙을 유지한다.
- 운영 데이터 변경·배포 없이 현재 브랜치에 커밋한다.

## 작업

수정: `src/adventure/v2/V2CombatPatternView.tsx`.
테스트: `src/adventure/v2/V2CombatPatternView.persistence.test.tsx`.

- [x] 실제 에디터를 렌더링하고 HTTP 경계만 대체하여 네 선언의 재진입,
  편집 자동 저장, 프리셋 저장·재적용 회귀 테스트를 작성한다.
  `npm test -- src/adventure/v2/V2CombatPatternView.persistence.test.tsx`로
  네 블록 대신 하나만 표시되는 실패를 확인한다.
- [x] 초기화에 `saved?.length ? saved : smartDefaultPatternFromEquipped(eq).blocks`
  를 사용하고 하위 선언이 있는 블록에 연계·시전 제외 안내를 추가한다.
- [x] 같은 회귀 테스트와 기존 패턴·결투가 PvE/PvP 테스트를 실행한다.
- [x] 타입 검사, 변경 파일 린트, 모듈 예산, diff 검토를 완료한다.
- [x] 검증 결과를 기록하고 현재 브랜치에 커밋한다.

## 검증 결과

- 수정 전 새 테스트 5개 중 3개 실패: 네 선언이 하나로 줄어들고, 하위 선언이
  포함된 교대 블록은 통째로 사라진다. 수정 후 5개 모두 통과.
- 패턴 UI·파서·시전, 결투가 PvE/PvP, 암흑사제 패턴의 8개 파일 197개 테스트 통과.
- 추가 실행한 `V2LoadoutPanel.test.tsx`는 23개 통과, 원소 공명 기본 SP 기대값
  테스트 1개 실패. 수정 전 HEAD `8c3f687d3`의 `/tmp` 복사본에서도 동일하게
  `기본 8 SP` 기대값 실패를 재현했다. 이번 변경과 무관한 기존 실패다.
- `node --max-old-space-size=4096 node_modules/typescript/bin/tsc --noEmit --incremental false`
  통과. 최초 기본 힙 실행은 메모리 한도로 중단되어 CI와 같은 4 GiB 한도로 재실행했다.
- 변경한 TSX 두 파일의 ESLint, 모듈 예산 12개 파일, `git diff --check` 통과.
- 직접 diff 검토: 저장 API·전투 필터는 변경하지 않았으며, 미장착 선언은 연계
  안내 대상에서 제외한다. 새 안내는 기존 불투명 카드 안에 표시한다.
