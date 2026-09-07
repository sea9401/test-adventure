# 침식 조건 구현 계획

**Goal:** #607의 침식 활성 여부에 따른 스킬 사용 지원.
**Architecture:** 기존 enemy_debuff 조건과 공유 시전 컨텍스트 확장.
**Tech Stack:** TypeScript, React, Vitest.

- [x] 회귀 테스트: parseCombatPattern 저장 유지 및 PvE/PvP 활성·만료 시 castFired 비교.
- [x] combatPattern.ts 타입·파서·판정, combatShared.ts 컨텍스트, engine.ts와 engine-pvp.ts 대상 상태 전달 구현.
- [x] V2CombatPatternView.tsx 선택지와 arenaLoadout.ts 요약 표시 추가.
- [x] 관련 Vitest, TypeScript, diff 검증 후 요청 파일만 커밋.

실행은 현재 세션에서 직접 수행하며 기존 사용자 변경을 보존한다.

검증 결과: 회귀 테스트 최초 6개 실패 확인 후 관련 5개 파일 185개 테스트 통과. TypeScript는 Node 힙 8GB로 통과, 변경 파일 ESLint 및 diff 검사 통과.
