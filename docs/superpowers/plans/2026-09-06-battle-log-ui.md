# Battle Log UI Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline. No subagents per AGENTS.md.

**Goal:** 승인 시안 v5의 좌우 정렬, 간결한 효과 배지, 접힌 타격 기록을 공용 전투 로그에 적용한다.

**Architecture:** 기존 그룹화와 로그 데이터는 유지하며 시전 경계 누락만 수정한다. 추가 피해/지속 효과 표시 변환은 작은 순수 모듈로 분리하고 ActionCard에서 소비한다. PvP 추격에 실제 HP 피해를 선택적 메타데이터로 기록한다.

**Tech Stack:** Next.js 16.2.11, React 19, Tailwind CSS 4, Vitest, Playwright.

## Global Constraints

공식·판정 불변. 과거 로그의 없는 상태/피해는 추정하지 않음. 불투명 surface 토큰. 내 로그 좌측/상대 로그 우측 정렬. 로컬 커밋만, 배포 금지.

### Task 1: 시전 경계와 피해 표시 데이터

Files: `src/adventure/battle/BattleLogList.tsx`, `battleLogPresentation.ts`, 해당 테스트, `src/adventure/v2/combat/engineState.ts`, `engine-pvp.ts`.

- [x] 명시 시전 → 추격 → 첫 타격 → 가속 → 나머지 타격의 실제 순서로 테스트 작성. `expect(actions).toHaveLength(1)` 및 4 hits, 별도 시전/평타/시간은 분리됨을 검증한다.
- [x] 순수 표시 모델 테스트: `3,472 * 3 + 5,831 + 6,499 = 22,746`; 반사/지속 피해/다른 주체 제외. 기록된 행동 수만 배지에 넣는다.
- [x] `npm test -- src/adventure/battle/BattleLogList.test.tsx src/adventure/battle/battleLogPresentation.test.ts`로 실패 확인.
- [x] 첫 실제 타격은 placeholder를 대체하고 이후 타격은 append한다. 시전 메타데이터는 유지한다. PvP 추격은 `hpHits.at(-1)`을 별도 메타데이터로 남긴다.
- [x] 같은 테스트 및 PvP 스킬 회귀 테스트 통과 확인.

### Task 2: 카드와 실제 미리보기

Files: `src/adventure/battle/BattleLogList.tsx`, `BattleLogList.presentation.test.tsx`, `src/app/dev/battle-log/page.tsx`, `e2e/battle-log.mobile-ui.spec.ts`.

- [x] DOM 테스트에서 개별 타격이 닫힌 details 안에만 존재하고 제목은 총 피해를 보여주는지 확인한다. 효과 배지의 행동 수와 반사 출처를 보존한다.
- [x] 카드 제목에 스킬과 결과를 함께 배치하고 우측 카드 전체에 `text-right`, 효과 행에 `justify-end`를 적용한다. 연타/추가 피해를 native details로 이동한다.
- [x] 개발 전용 기존 미리보기에서 양쪽 행동, 연타, 지속 효과, 회피를 제공한다. 기존 전술 미리보기 유지.
- [x] Vitest, ESLint, TypeScript 확인. Playwright로 320/390/1280 너비와 라이트·다크에서 넘침, 실제 우측 정렬, 키보드 상세 펼치기 확인 및 스크린샷 저장.
- [x] diff 자체 검토 후 명시 파일만 스테이징하고 `git commit -m "feat: streamline battle log action cards"` 수행.

## 검증 결과

- 전체 Vitest: 1,094 파일 통과, 5 파일 건너뜀. 8,609 테스트 통과, 23 건너뜀, 실패 없음.
- Playwright: 320/390/1280px × 라이트/다크 6개 통과. 상대 카드 내부 우측 정렬, 불투명 표면, 가로 넘침 없음, 타격 기록 키보드 펼치기/접기, compact 모드 확인.
- 변경 파일 ESLint 통과.
- TypeScript 전체 검사 통과. 기본 Node 힙 한도에서 메모리 부족이 발생해 8GB 한도로 재실행했다.
- 실제 모바일·다크 데스크톱 캡처를 직접 검토했다. 개발 전용 CSP의 React eval 경고는 기존 보안 정책 때문이며 정책을 완화하지 않았다.
- 최종 검토: 전투 판정 불변, 로그 메타데이터만 추가. 기록되지 않은 잔여 행동 수는 생성하지 않는다. 옛 PvP의 방어 전 추격은 합산 불가임을 알리고 원문을 보존한다.
