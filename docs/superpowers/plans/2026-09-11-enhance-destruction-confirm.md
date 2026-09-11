# 파괴 위험 강화 확인 구현 계획

**Goal:** 파괴 확률이 있는 강화 시도에 사용자 확인을 받는다.

**Architecture:** V2EnhanceView의 공통 강화 핸들러에서 실제 확률을 검사하고 브라우저 confirm 결과로 POST 진행 여부를 결정한다.

**Tech Stack:** Next.js Client Component, React, Vitest, Testing Library.

1. `V2EnhanceView.confirm.test.tsx`에 실제 화면 클릭 회귀 테스트를 작성한다. 위험 단계 취소가 POST를 막지 못하는 실패를 확인한다.
2. `V2EnhanceView.tsx`의 `doEnhance`에서 `enhanceOutcomeRow(level, stone)[3] > 0`이면 장비명·단계·확률 확인 후 진행한다. 취소는 busy 설정 전에 반환한다.
3. 붉은 +7, 푸른 +12 위험 경계와 그 직전 안전 단계, PC·모바일 버튼, 확인 후 요청을 검증한다.
4. 관련 Vitest, ESLint, TypeScript, diff 검증 후 현재 브랜치에 커밋한다. 푸시·배포하지 않는다.
