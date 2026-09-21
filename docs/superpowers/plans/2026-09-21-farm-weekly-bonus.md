# 주간 납품 선택 보너스 검증 및 안내 개선

**Goal:** #704의 보너스 조건을 명확히 표시하고 실제 API 보상 처리를 검증한다.
**Architecture:** 서버 계산은 유지한다. `WeeklyDeliveryBoard`에서 현재 재고로 예상 보상을 표시하며 완료 주문의 과거 결과를 추정하지 않는다.
**Tech Stack:** Next.js 16, React, TypeScript, Vitest.

사용자 AGENTS.md에 따라 현재 세션에서 직접 실행하며 별도 승인·서브에이전트·푸시·배포 없이 관련 파일만 커밋한다. 다른 진행 중 변경은 보존한다.

- [x] `src/app/api/v2/farm/weekly/route.test.ts`: 11종 보너스 지급 및 재고 차감, 희귀 작물 미보유, 중복/주간 한도/일반 재료 부족 시 재고 무변경 테스트.
- [x] `src/adventure/v2/AdventurerFarmPanel.test.tsx`: 황금 밀 2개일 때 예상 증표 11개와 1개 자동 사용, 0개일 때 기본 6개와 보너스 미적용, 완료 시 현재 재고로 보상 추정하지 않는 테스트를 작성하고 실패 확인.
- [x] `src/adventure/v2/AdventurerFarmPanel.tsx`: 카드에 별도 보너스 안내를 전달한다. 미완료 보상은 `rewardReputation + (보유 시 optionalRareBonusReputation)`으로 표시하고 보유량·소모량·추가 증표를 안내한다.
- [x] 관련 농장 테스트, 변경 파일 ESLint, TypeScript 검사 및 diff 검토 후 관련 파일만 커밋.

## 검증 결과

- 기존 보상 계산을 사용하는 API 검증 16건 통과. 희귀 작물 11종 모두 1개 소모 및 보너스 포함 증표 지급 확인. 제보의 보상 누락은 재현되지 않았다.
- UI 회귀 테스트 3건은 기존 코드에서 보유량/적용 여부 안내 부재로 실패했고 수정 후 통과했다.
- 농장 도메인·주간 선택·API·화면 관련 5개 파일 106개 테스트 통과.
- 변경된 코드 3개 파일 ESLint 및 diff 공백 검사 통과. 라이트/다크 표면은 `SURFACE_CARD`와 `SURFACE_INSET`의 불투명 배경을 사용한다.
- 전체 TypeScript 검사에서 이번 변경과 무관한 `src/app/api/v2/guild/claim-leadership/route.test.ts:109-110`의 TS2345/TS2322 오류 2건이 보고되었다. 병행 작업 파일이므로 수정하지 않았다.
- 운영에서는 코드와 해당 계정 농장 상태만 읽기 전용 조회했다. 납품 시점의 재고 증거는 없어 원인을 확정하지 않았으며, 운영 쓰기·배포·푸시하지 않았다.
