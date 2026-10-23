# 거대어 보상 개편 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거대어 고기여 보상을 늘리고, 증표를 태양석·심해성철로 반복 교환하게 한다.

**Architecture:** 보상 공식은 `dangerousBossReward` 순수 함수만 바꾼다. 교환은 기존 카탈로그에 `material` 결과 종류를 더하고, 교환 상태 저장 키에 주간 태양석 사용량을 함께 보관한다.

**Tech Stack:** Next.js, TypeScript, vitest

**Spec:** `docs/superpowers/specs/2026-10-24-giant-fish-reward-rework-design.md`

## Global Constraints

- 주간 태양석 한도 5개, 주 경계 `kstWeekMondayKey`.
- 교환표: 해일 3→태양석 1, 심연 2→태양석 1, 해일 1→심해성철 2, 심연 1→심해성철 3.
- 추가 보상: `extraSteps = max(0, floor(min(total,max)*10/max) - 1)`, 증표 +extraSteps, 코인 +20×extraSteps.
- 플레이어 노출 문구에 마크다운·대시 금지, "v2" 노출 금지.

## Review Focus

- 강화 후 교환 상태 저장 시 `weekly`가 사라지면 한도가 초기화된다 → Task 2에 "강화 후 주간 사용량 유지" 테스트.
- 한도 1개 남았는데 2회 요청 → 거절·무차감 → Task 2.
- 지난 주 사용량이 남은 상태로 새 주 진입 → 0부터 → Task 2.
- 서버 응답에 `weeklySunstone`이 없으면(구버전) 클라이언트가 화면을 거부 → 배포는 동시라 허용, Task 3 파서 테스트로 명시.
- 기여 총량이 체력을 넘는 경우(막타 초과) → 100%로 상한 → Task 1.

---

### Task 1: 고기여 추가 보상

**Files:** Modify `src/lib/server/dangerousFishingBoss.ts` (`dangerousBossReward`), Test `src/lib/server/dangerousFishingBoss.test.ts`

- [ ] 기존 "고기여 구간에서 완만해진다" 테스트를 새 공식으로 교체: (75, 18_000/4=4_500 → 25%) 증표 5·코인 240, 50% 8·300, 100% 13·400, 180_000(초과) == 100%, 10%·19.9% 추가 0, 발견자 100% 14·440.
- [ ] 실패 확인 → 구현 → 통과 → 커밋.

### Task 2: 교환 카탈로그·서버

**Files:** Modify `src/adventure/v2/dangerousFishingExchange.ts`, `src/lib/server/dangerousFishingExchange.ts`, `src/adventure/data/v2/dangerousFishing.ts`(증표 설명). Test `src/lib/server/dangerousFishingExchangeRoute.test.ts`, `src/adventure/v2/dangerousFishingExchange.test.ts`

**Produces:** `DANGEROUS_FISHING_WEEKLY_SUNSTONE_LIMIT = 5`, `weeklyLimitedSunstone(entry): number` (1회당 태양석 수, 아니면 0), 출력 `{ kind: "material"; materialId: GuildWorkshopMaterialId; count: number }`, 뷰 `weeklySunstone: { limit: number; used: number; remaining: number }`, 오류 `weekly_limit`(409).

- [ ] 테스트: 태양석 교환 지급·차감, 한도 초과 거절 무차감, 주 변경 초기화, 강화 후 weekly 보존, 심해성철 무제한, maxBatches가 남은 한도로 제한.
- [ ] 실패 확인 → 구현 → 통과 → 커밋.

### Task 3: 클라이언트·문구·매뉴얼

**Files:** Modify `src/adventure/v2/useDangerousFishingExchange.ts`, `src/adventure/v2/DangerousFishingExchangeSection.tsx`, `src/adventure/v2/DangerousFishingBossPanel.tsx`, `src/adventure/v2/dangerousFishingFeedback.ts`, `src/app/manual/content/pastimes.tsx` 및 각 테스트.

- [ ] 테스트: 섹션에 "제작 재료 교환"·"이번 주 태양석 0/5"·"태양석 1개" 표시, 한도 소진 시 버튼 비활성, `weekly_limit` 문구, 매뉴얼 교환표 행.
- [ ] 실패 확인 → 구현 → 통과.
- [ ] 전체 검증: `npx vitest run` 관련 파일, `npx tsc --noEmit`, `npm run lint` → 커밋.
