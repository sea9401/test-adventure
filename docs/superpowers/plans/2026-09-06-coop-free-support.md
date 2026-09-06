# Coop Free Support Implementation Plan

> Execute inline using superpowers:executing-plans. User instructions prohibit subagents and authorize proceeding on the current branch while preserving unrelated edits.

**Goal:** 소환자가 무료 토벌 지원을 허용하고 지원자는 비용과 보상 없이 토벌을 도울 수 있게 한다.

**Architecture:** 세션 boolean 설정, 소환자 전용 변경 API, 기존 공격 API의 명시적 support 분기, 클라이언트 소환/상세/기록 표시를 연결한다.

**Tech Stack:** Next.js 16 Route Handlers, Drizzle/PostgreSQL, React, Vitest.

## Constraints

설계: `docs/superpowers/specs/2026-09-06-coop-free-support-design.md`. 기본 false, 보상 보존, 동일 쿨다운, 잠금 재검증. 기존 작업 보존. 배포 없음.

## Tasks

- [x] 1. `summon/route.test.ts`, 신규 `support/route.test.ts`, `attack/route.test.ts`에 실제 route를 호출하는 회귀 테스트를 작성하고 실패 확인. 요청 `{kind, allowFreeSupport: true}`, `{allowFreeSupport: false}`, `{sessionId, support: true}`를 사용한다. 비용 0인 처치가 `killingBlowReward: null`이고 기존 damage 500을 유지하는지 검증한다. 비소유자 403, 종료 409, 해제된 지원 403 및 정상 공격 비용을 확인한다.
- [x] 2. `schema.ts`에 `allowFreeSupport: boolean("allow_free_support").notNull().default(false)`와 공격 로그 `isSupport`를 추가하고 `npm run db:generate -- --name=coop_free_support`로 SQL/스냅샷 생성. 소환 값 검증·저장 및 신규 `POST /api/v2/coop/[sessionId]/support` 행 잠금·소유·활성 검사 구현.
- [x] 3. `attack/route.ts`에서 support boolean 검증, 비용 0 분기, 잠금 전후 허용 검사, 기여 증가량 0과 기존 상태 보존, 처치 보상 제외, 로그 표식 저장 구현. 지원은 성장 도약 스태미나 사용 진척을 지급하지 않는다. GET 목록/상세/로그에 설정/표식 전달, damage 0 미수령 제외.
- [x] 4. UI 회귀 테스트 실패 확인 후 `useCoopBossState.ts` 요청과 `V2CoopBossListView.tsx` 소환 옵션, `V2CoopBossDetailView.tsx` 소환자 토글과 무료 지원 버튼 연결. 최근 전투/리플레이에 무료 지원 표시. 불투명 공통 표면 사용. 매뉴얼 설명 추가.
- [x] 5. 관련 테스트, 타입 검사, 변경 파일 ESLint, 마이그레이션 검사 실행. diff 자체 리뷰 후 이 작업 파일만 커밋한다.

## Verification

- Relevant coop suites: 18 files, 85 tests passed.
- Full TypeScript check: `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit` passed. Default 2 GB run exhausted heap; enlarged heap run found one old fixture missing the new boolean, corrected and passed.
- ESLint for coop UI/APIs, manual and schema passed.
- Migration journal validation passed (185 migrations). Migration 0184 only adds two boolean columns with false defaults; no runtime database migration or deployment performed.
- Inline review confirmed owner-only settings, locked permission recheck, unchanged reward fields, no stamina/growth/last-hit rewards for support, unchanged paid attack behavior, explicit support labels and opaque light/dark content surfaces.
