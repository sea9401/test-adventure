# Activity verification recovery implementation plan

> Execute inline using superpowers:executing-plans; no subagents per AGENTS.md.

**Goal:** 멈춘 사람 확인에 재시도와 문제 해결 안내를 제공한다.

**Architecture:** 기존 공용 게이트의 오류 상태와 위젯 재생성을 재사용한다. 대기 타이머는 스크립트/Turnstile 구간에만 적용한다.

**Tech Stack:** React, Next Script, Vitest, Testing Library, jsdom.

**Constraints:** 서버 인증 유지, 추가 CAPTCHA 풀이 시간 보존, 불투명 표면, 무배포. 관련 없는 현재 작업 변경은 커밋하지 않는다.

### Task 1: 대기 복구와 회귀 검증

**Files:** `src/adventure/v2/ActivityVerificationGate.tsx`, 새 `src/adventure/v2/ActivityVerificationGate.test.tsx`.

- [x] 가짜 SDK에서 콜백 없이 30초 대기한 뒤 복구 버튼을 조회하는 회귀 테스트와 스크립트 실패·정상 완료·2단계 인증 테스트를 작성한다.
- [x] `npm test -- src/adventure/v2/ActivityVerificationGate.test.tsx`로 누락된 복구 동작 때문에 실패하는지 확인한다. 변경 전 7개 실패를 확인했다.
- [x] 게이트에 정리 가능한 30초 타이머, timeout/unsupported 콜백, 수동 SDK 갱신 설정, 스크립트 미로드 시 새로고침 버튼을 추가한다. 오류 안내와 표면 토큰을 적용한다.
- [x] 같은 테스트와 기존 인증/낚시 화면 테스트를 실행한다. 변경 파일 ESLint와 타입 검사를 실행한다.
- [x] diff를 자체 검토하고 위 파일 및 이 작업 문서만 현재 브랜치에 커밋한다.

검증 결과: 관련 10개 파일의 84개 테스트 통과(신규 11개 포함), 변경 파일 ESLint 및 `git diff --check` 통과. 기본 Node 힙 한도에서는 타입 검사 메모리가 부족했으며, `node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit --incremental false`로 전체 타입 검사 통과. 실제 이용자 기기의 Cloudflare 통과는 미검증이며 배포하지 않았다.
