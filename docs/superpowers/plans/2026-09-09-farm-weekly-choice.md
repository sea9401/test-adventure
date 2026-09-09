# Farm weekly choice implementation plan

**Goal:** 전체 작물 중 주간 3종 선택 납품.
**Architecture:** 기존 주문 API와 저장 형식을 유지하고 farm 도메인에서 한도를 강제한다. UI와 대시보드는 목록 길이 대신 공통 한도 상수를 사용한다.
**Tech Stack:** TypeScript, Next.js, React, Vitest.

- [x] 도메인·대시보드 회귀 테스트를 먼저 작성하고 기존 코드 실패 확인.
- [x] `farm.ts`에 8종 주문과 주간 3건 제한 추가. 기존 주문과 기록 유지.
- [x] `AdventurerFarmPanel.tsx`, `useFarm.ts`, `adventureDashboard.ts`에 진행 표시, 한도 안내, 납품 가능 집계 반영.
- [x] 실제 납품 보드 렌더 테스트로 진행 표시·버튼 비활성·선택 납품 호출 검증.
- [x] 관련 테스트, 변경 파일 lint, 전체 타입 검사 및 diff 검토 후 이번 변경만 커밋.

사용자가 승인한 범위에서 현재 브랜치에 직접 구현한다. 서브에이전트·배포·푸시는 사용하지 않는다.

## Validation

- 기존 코드에서 도메인 회귀 13건 및 보드 렌더 2건 실패 확인. 목록 확장 뒤 대시보드 3/11 오류도 재현했다.
- 수정 후 농장 도메인·화면·대시보드·납품 API·도움말 등 10개 파일 159개 테스트 통과.
- 변경 파일 ESLint와 전체 TypeScript 검사(`NODE_OPTIONS=--max-old-space-size=8192`, `--noEmit --incremental false`) 통과.
- 주간 납품 보드와 공용 납품 카드가 라이트/다크 모두 불투명 SURFACE_CARD를 사용하는지 코드 검토했다.
- 기존 트랜잭션의 세이브 잠금과 새 한도 검사를 검토했으며 배포·푸시는 하지 않았다.
