# 인벤토리·거래소 판매 검색 구현 계획

**Goal:** #633의 보유 아이템 탐색 불편을 이름 검색으로 해결한다.
**Architecture:** 공통 이름 비교와 수량 필터, 검색 입력을 두 화면에 연결하고 기존 정렬·페이지 처리 전에 필터링한다.
**Tech Stack:** React, TypeScript, Vitest, Testing Library.

## 제약
현재 브랜치에서 직접 수행한다. 서브에이전트, 외부 쓰기, 배포 없음. 판매 동작의 원본 데이터와 일괄 처리 범위를 유지한다.

## 작업
- [x] `itemSearch.test.ts`와 UI 회귀 테스트를 먼저 작성하고 실패를 확인한다. 부분 이름, 공백과 대소문자, 빈 검색어 복원, 수량 보존, 첫 페이지 복귀를 검증한다.
- [x] `itemSearch.ts`, `ItemSearchInput.tsx`를 구현한다. 이름 비교는 `name.toLocaleLowerCase("ko-KR").includes(search.trim().toLocaleLowerCase("ko-KR"))`로 수행한다.
- [x] `V2InventoryView`, `EquipmentTab`, `MaterialsTab`, `RareMapsTab`에 검색을 연결한다. 장비 원본은 일괄 처리용으로 유지하고 표시 목록만 검색한다.
- [x] `V2MarketplaceView` 판매 분류에 독립 검색 상태를 추가하고 소모품을 포함한 표시 데이터를 필터링한다. 모든 판매 페이지 resetKey에 검색어를 포함한다.
- [x] 관련 Vitest 테스트, `npx tsc --noEmit`, 변경 파일 ESLint, `git diff --check`를 실행하고 변경을 자체 리뷰한다.
- [x] 현재 브랜치에 커밋하고 결과를 보고한다.

## 검증 결과

- 관련 31개 테스트 파일, 114개 테스트 통과.
- `npx tsc --noEmit`, 변경 TypeScript 파일 ESLint, `git diff --check` 통과.
- 검색 초기화와 페이지 축소가 겹칠 때 페이지 보정이 초기화를 덮어쓰는 기존 문제를 회귀 테스트로 재현하고 `usePagination`의 함수형 상태 갱신으로 수정했다.
- 새 입력은 라이트·다크 모두 불투명 배경을 사용하며, 원본 보유 데이터와 판매·사용 콜백을 보존하는지 자체 리뷰했다. 실제 브라우저 시각 검증은 수행하지 않았다.

## 통합 브랜치 검증

`cc31caeb9`를 계승한 `284ec8588`에 검색 기능을 스쿼시했다. 기존 #634 변경을 보존하고 거래소 화면의 분리된 경매 설정 컴포넌트를 유지했다. 통합 브랜치에는 가격 캐시 모듈이 없어 검색 테스트의 캐시 초기화 의존성을 제거했다.

- 관련 29개 테스트 파일, 112개 테스트 통과.
- 변경 파일 ESLint와 `git diff --check` 통과.
- 기본 Node 힙 한도로 타입 검사가 중단되어 `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit`으로 재실행, 통과.
