# Workshop Material Navigation Implementation Plan

> 실행: 현재 세션에서 직접 수행. 사용자 지침에 따라 서브에이전트와 별도 승인 단계는 사용하지 않는다.

**Goal:** #698의 부족 재료 이동 링크를 실제 수급 사냥 단계에 연결한다.

**Architecture:** `workshopMaterialSource`가 기존 드랍 규칙과 사냥 도감에서 깊이를 조회하고 `normalHuntFloorHref`로 경로를 생성한다. UI와 라우트는 기존 구현을 사용한다.

**Tech Stack:** TypeScript, Next.js Link, Vitest, React static rendering.

### Task 1: 수급처 경로 수정 및 회귀 검증

- [x] `workshopMaterialSources.test.ts`에 공용 5종·몬스터 10종의 구체적 목적지 사례와 실제 드랍 가능성 검증을 추가한다. `WorkshopCraftPanel.test.tsx`의 부족 재료 링크 기대값을 심층 동굴 `/battle/dungeon/20`, 리자드 늪지 `/battle/dungeon/32`로 바꾼다.
- [x] 두 테스트 파일을 실행해 `/battle` 반환 때문에 실패하는지 확인한다.
- [x] `workshopMaterialSources.ts`에서 공용 재료의 `GUILD_WORKSHOP_MATERIAL_DROP_RULES.minDepth`, 몬스터의 `HUNT_MONSTER_CODEX.firstDepth`를 `normalHuntFloorHref`에 전달한다. 데이터가 없으면 기존 전투 링크를 유지한다.
- [x] 관련 테스트, 타입 검사, 변경 파일 ESLint와 diff 검토를 수행한다.
- [x] 이번 변경 파일만 현재 브랜치에 커밋한다. 기존 작업 문서는 포함하지 않는다.

검증 결과: 관련 4개 파일 41개 테스트 통과, 변경 파일 ESLint 통과, `NODE_OPTIONS=--max-old-space-size=8192 npx tsc --noEmit` 통과. 최초 타입 검사는 기본 Node 힙 한도에서 메모리 부족으로 중단되어 한도를 늘려 재실행했다.
