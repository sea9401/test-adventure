# Inbox Bulk Delete Implementation Plan

> 실행: 현재 브랜치에서 직접 수행한다. AGENTS.md에 따라 추가 설계 승인과 서브에이전트 없이 로컬 구현·검증·커밋까지 진행한다.

**Goal:** 읽음과 수령·처리가 모두 완료된 받은 우편 전체를 안전하게 일괄 삭제한다.

**Architecture:** 전용 POST 라우트가 단일 조건부 UPDATE로 수신자 삭제 시각을 기록하고 삭제 ID를 반환한다. 기존 우편 API 모듈과 V2InboxView에 연결한다.

**Tech Stack:** Next.js Route Handler, Drizzle/PostgreSQL, React, Vitest/Testing Library.

## Constraints

- 본인 수신 우편 AND 읽음 AND 완료 AND 미삭제 조건을 서버에서 보장한다.
- 최근 100개 제한 없이 처리하며 보낸 우편과 보상 데이터는 유지한다.
- 미수령 보상과 미응답 초대는 유지한다. 추가 의존성·마이그레이션·배포 없음.
- 기존 불투명 표면 토큰과 확인창을 재사용한다.

## Task 1: Server API

- [x] `src/app/api/marketplace/inbox/delete-completed/route.test.ts`에 인증, 실제 Drizzle SQL 필터, 삭제 ID 반환, 100개 초과 반환, 0건 테스트 작성 후 실패 확인.
- [x] 같은 폴더 `route.ts`에 POST 구현: `ensureUser()` 후 `db.update(marketplaceInbox).set({ recipientDeletedAt: new Date() }).where(and(eq(userId), isNotNull(readAt), isNotNull(claimedAt), isNull(recipientDeletedAt))).returning({ id })`.
- [x] 응답 `{ ok: true, deletedIds: number[] }`과 테스트 통과 확인.

## Task 2: Client and UI

- [x] `src/adventure/marketplace/api.inbox-delete.test.ts`에 일괄 POST, 잘못된 응답, 실패 응답 테스트 추가 후 실패 확인.
- [x] `src/adventure/marketplace/api.ts`에 `deleteCompletedInbox(): Promise<{ ok: true; deletedIds: number[] }>` 구현. 응답 검증 후 기존 삭제 오류 문구 사용.
- [x] `src/adventure/v2/V2InboxView.delete.test.tsx`에 확인 취소, 혼합 목록 성공/0건/실패, 중복 실행 방지, 보낸 탭 미노출 테스트 추가 후 실패 확인.
- [x] `src/adventure/v2/V2InboxView.tsx`에 일괄 버튼 및 핸들러 추가. 확인 전 busy 설정, finally에서 해제. 서버 반환 ID만 화면에서 제거하고 목록을 재조회한다.
- [x] 우편 관련 회귀 테스트, 변경 파일 ESLint, TypeScript, diff 검토 후 현재 브랜치에 커밋한다.

## Verification results

- 신규 기능 구현 전: API/버튼 부재로 신규 테스트 16개 실패 확인.
- 구현 후: 우편 관련 11개 파일, 테스트 110개 통과.
- 변경 TypeScript/TSX 파일 ESLint 통과.
- 직접 diff 검토: 수신자/읽음/완료/미삭제 AND 조건, 원자적 UPDATE, 보낸 우편 보존, 취소/실패/중복 실행과 불투명 라이트·다크 표면 확인.
- TypeScript: 기본 2GB 실행은 힙 부족으로 중단. CI와 동일한 `NODE_OPTIONS=--max-old-space-size=4096`으로 `npx tsc --noEmit --incremental false` 재실행하여 통과.
