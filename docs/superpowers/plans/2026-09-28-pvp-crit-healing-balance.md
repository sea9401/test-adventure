# PvP 치명타 저항·회복 밸런스 Implementation Plan

> **For agentic workers:** Inline execution in this session. Tests precede production changes; no subagents, integration, or deployment.

**Goal:** PvP 치명타 저항이 확률을 0으로 지우지 않도록 하고, 회복을 보호막과 분리해 검증한다.

**Architecture:** PvP 호출만 저항 제한을 활성화한다. 전투 상태에 회복 배율을 독립적으로 보관하고 공통 회복 스케일 함수에서 사용한다. 기존 생존 배율은 보호막에 적용한다.

**Tech Stack:** TypeScript, Vitest, Next.js App Router.

## Global Constraints

- 기존 작업 트리 변경을 보존한다. `/tmp` 외 새 격리 폴더를 만들지 않는다.
- PvE와 별도 PvP 제한 회복기의 동작을 유지한다.
- 사용자 요청 없이 배포하거나 점검 모드를 변경하지 않는다.

---

### Task 1: PvP 치명타 저항

**Files:** `src/adventure/v2/combat/engine.damageHelpers.ts`, `engine.pvpPhase.ts`, `engine-pvp.ts`, `engine.damageHelpers.test.ts`, `src/adventure/battle/engine-pvp.test.ts`.

- [x] 원본 75/저항 100에서 18.75%, 원본 150/저항 50에서 기존 75% 및 초과 피해, PvE 기존 동작을 확인하는 실패 테스트를 작성·실행한다.
- [x] 저항 차감 상한을 PvP 두 호출부에 적용하고 관련 테스트를 다시 실행한다.

### Task 2: 회복과 보호막 분리

**Files:** `src/adventure/v2/combat/engine.pvpScaling.ts`, `engine-pvp.ts`, `engine.pvp-atb.ts`, `engine.pvpDamageMultiplier.test.ts`, `engine.pvpScaling.test.ts`, `src/lib/server/arena.ts`, 세 PvP 호출부.

- [x] 회복 50%/보호막 65%인 상태의 실제 회복 및 보호막 출력과 일반 PvP 기본값을 검증하는 실패 테스트를 작성·실행한다.
- [x] 독립 회복 배율을 상태·호출부에 전달하고 세 PvP 표면에 50%를 주입한 뒤 테스트를 실행한다.

### Task 3: 안내·검증·커밋

**Files:** `src/app/manual/content/combat-formulas.tsx`, 필요 시 관련 테스트.

- [x] 치명타 저항 적용 순서, PvP 저항 제한, 회복·보호막 배율을 문서에 반영한다.
- [x] 관련 Vitest, 타입 검사, 린트와 전투 시뮬레이션을 실행한다. 기존 실패가 있으면 변경 전 상태와 구분해 보고한다.
- [x] 변경 파일만 검토·스테이징·커밋한다. #721 답변 초안을 작성한다.
