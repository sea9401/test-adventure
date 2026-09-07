# 숙련 화면 구현 계획

**Goal:** 미발견 요리 이름 노출을 막고 숙련 목록의 탐색과 상세 가독성을 개선한다.

**Architecture:** 서버 snapshot에서 이름을 가리고 클라이언트 공통 표시 함수를 사용한다. 기존 목록에 접이식 상세를 배치한다.

**Tech Stack:** Next.js 16, React 19, TypeScript, Vitest.

1. `codexMasterySnapshot.test.ts`에 미발견 이름 직렬화 차단과 발견 시 공개 테스트를 추가하고 실패를 확인한다.
2. `CodexMasteryPanel.test.tsx`에 미발견 이름 렌더링 및 이름/ID 검색 차단 테스트를 추가하고 실패를 확인한다.
3. snapshot 이름 마스킹과 UI 표시/검색 보호를 구현한다. GET에서 주방 상태를 읽어 knownCookingRecipeIds로 전달하고 nameHidden으로 발견과 숙련 기록의 시차를 처리한다.
4. 분야 카드 진행도·선택 강조, 행 바로 아래 접이식 상세, 필터 변경 시 선택 초기화를 구현한다.
5. 관련 Vitest, TypeScript, ESLint, diff 검토 후 현재 브랜치에 커밋한다.

프로젝트 지침에 따라 현재 세션에서 직접 실행하며 설계 재승인과 서브에이전트는 사용하지 않는다.

실행 결과: 서버/화면 이름 노출 회귀 테스트의 실패를 확인한 뒤 구현했다. 주방에서 발견했지만 숙련 기록은 없는 경우도 실패를 확인한 뒤 보호 기준을 보완했다. 관련 테스트 39개와 변경 파일 ESLint가 통과했다. 상세 펼침/접힘과 필터 전환은 jsdom 상호작용 테스트로 검증했다.

전체 타입 검사는 기본 메모리 한도를 초과해 8GB로 재실행했다. 이번 변경 파일에서는 오류가 없었으나 별도 작업 중인 `src/adventure/v2/combat/erosionCondition.test.tsx`의 Monster.tags 누락과 V2SkillId 배열 타입 오류로 종료 코드 2를 반환했다. 해당 파일은 수정하거나 커밋에 포함하지 않는다. 브라우저 시각 검증은 수행하지 않았다.
