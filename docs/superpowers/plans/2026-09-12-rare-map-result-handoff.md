# Rare map result handoff implementation plan

Goal: #651의 희귀 탐사 완료 결과를 일반 사냥 화면에서 확인하고 바로 N회 사냥을 계속한다.
Architecture: 공통 던전 레이아웃 Provider의 일회성 결과 전달과 전투 화면의 초기 표시 결과. 세션 key 및 서버 API 유지.
Tech stack: React, Next.js App Router, Vitest, Testing Library.

1. 기존 페이지 및 희귀 복귀 테스트로 기준 상태를 확인한다.
2. `src/app/(game)/battle/dungeon/[floorId]/page.test.tsx`에 실제 결과 유지·일반 요청·결과 교체·재방문 회귀 테스트를 작성하고 실패를 확인한다.
3. `V2DungeonFloorView.tsx`에 완료 결과 전달과 초기 표시 결과 입력을 추가한다. `DungeonResultHandoffProvider.tsx`와 던전 `layout.tsx`를 추가해 동적 깊이 페이지 교체를 견디는 전달 상태를 두고 페이지에 연결한다.
4. 희귀 복귀 테스트를 완료 콜백 계약에 맞추고 만료/남은 횟수 동작도 검증한다.
5. 관련 테스트, 타입 검사, 변경 파일 lint와 모듈 크기 검증을 실행한다. 직접 diff를 검토하고 수정 브랜치에 커밋한다.

사용자의 AGENTS.md에 따라 승인 재질문과 서브에이전트 없이 순차 실행한다.

## 검증 기록

- 기존 기준 테스트 5개 통과 후, 일반 복귀 시 결과 영역이 사라지는 회귀 테스트 2개 실패를 확인했다.
- 같은 깊이 복귀뿐 아니라 페이지가 재생성되는 레거시 깊이 복귀도 재현해 공통 레이아웃에 전달 상태를 두었다.
- 실제 페이지/레이아웃을 StrictMode로 렌더하는 테스트를 포함한 관련 29개 테스트 통과. 이전 요청 중 수동 복귀도 정상이다.
- 전체 타입 검사와 변경 파일 ESLint 통과. 모듈 크기 제한 통과.
- 전투 결과를 새로 지급하지 않고 표시 데이터만 전달하며, 첫 전달 이후 재방문 시 오래된 결과가 복원되지 않음을 직접 검토했다.
