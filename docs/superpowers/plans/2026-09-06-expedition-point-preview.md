# Expedition Point Preview Implementation Plan

> Execute inline using superpowers:executing-plans; no subagents per user instructions.

**Goal:** 포인트가 부족해도 목표 노드의 최단 경로 필요/보유/부족량 확인.
**Architecture:** 기존 BFS 경로와 별도의 읽기 전용 비용 모델, 노드 상세 안내.
**Tech Stack:** React, TypeScript, Vitest.

- [x] `unexploredTreeModel.test.ts`에 남은 1포인트로 7개 노드를 열 때 필요 7/부족 6, 잔액 0, 충분한 잔액, 활성/미선택, 시작/인접 노드 테스트 작성. `V2UnexploredTreeView.test.tsx`에 부족 상태에서도 비용 안내와 잠긴 버튼이 함께 표시되는 테스트 작성. 실패 확인.
- [x] `unexploredTreeModel.ts`에 `routePointPreview` 추가. `previewPath.filter(id => !active.has(id)).length`와 서버 snapshot 잔액으로 계산. 기존 plan은 유지.
- [x] `V2UnexploredTreeView.tsx` 상세에 SURFACE_INSET 비용 정보 표시. 부족량이 양수일 때만 부족 문구 제공. 권한 및 실행 조건 유지.
- [x] 모델/UI/트리 데이터 관련 테스트, TypeScript, 변경 파일 ESLint 및 diff 검토. 해당 브랜치에 커밋.

## Validation

- RED: 13 new cases failed because the cost preview was absent; 35 existing cases passed.
- GREEN: model, UI and tree-data suites passed, 61 tests across 3 files.
- Full TypeScript check with 8 GB heap passed; changed-file ESLint and git diff whitespace checks passed.
- Inline review: cost uses the existing multi-source shortest path, excludes active nodes, includes inactive start/target, retains activation errors and disabled controls. UI uses the existing opaque light/dark inset token.
- No server/DB changes, merge, push or deployment.
