# 추석 이벤트 구현 계획

**Goal:** 기존 출석·토벌전·우편 시스템을 재사용하는 10일 추석 이벤트를 추가한다.

**Architecture:** 순수 이벤트 규칙, 전역 진행/참여/멱등 기록 DB, 서버 트랜잭션, 인증 API, 이벤트 탭 UI로 분리한다.

**Tech Stack:** Next.js 16 App Router, React, Drizzle/PostgreSQL, Vitest.

저장소 지침에 따라 현재 브랜치에서 직접 실행하고 별도 승인·서브에이전트·배포는 생략한다.

## 작업

- [x] `src/adventure/data/v2/chuseokEvent.test.ts`에 시작/종료, KST 출석, 초과 피해 테스트를 먼저 작성하고 실패를 확인한다. `chuseokEvent.ts`에 기간·출석·체력 규칙과 공개 타입을 구현한다.
- [x] `src/lib/server/guildRaidBattle.test.ts`에 복주머니 전투를 추가한 뒤 기존 계산기를 공용 함수로 추출한다. 기존 길드 전투 결과를 보존한다.
- [x] `src/db/chuseokSchema.ts`, `drizzle.config.ts`, 생성 마이그레이션에 전역 진행, 사용자별 출석/공격 수, 요청별 결과를 저장한다.
- [x] `src/lib/server/chuseokEvent.ts`와 API 테스트를 먼저 작성한다. 출석 중복 차단, 인증, 일일 공격 제한, 멱등성, 공동 처치 우편을 구현한다.
- [x] `src/adventure/v2/V2ChuseokEventView.tsx` 및 전용 hook을 작성하고 `V2EventsView.tsx`, 이벤트 page에 탭을 연결한다. 렌더링·버튼·오류 테스트를 실행한다.
- [x] 관련 Vitest, TypeScript, ESLint, 마이그레이션 및 이미지 검사를 실행한다. 배포 시 시작 환경변수 설정 절차를 문서화하고 변경을 커밋한다.

## 검증 결과

- 관련 Vitest 10개 파일, 72개 테스트 통과(실제 PostgreSQL 통합 테스트 9개 포함).
- TypeScript(`NODE_OPTIONS=--max-old-space-size=6144`) 및 변경 파일 ESLint 통과. 기본 2GB 힙의 TypeScript 검사는 메모리 부족으로 재실행했다.
- 로컬 DB에 신규 마이그레이션 적용, migration journal, 이미지 참조, 모듈 크기 검사 통과.
- 로컬 Chromium에서 출석 수령·공격·리플레이 표시와 모바일 가로 넘침 없음 확인. 라이트·다크 카드의 불투명 표면 확인.
- 운영 설정/배포/푸시 없이 현재 브랜치에 커밋한다.

## 후속 UI 개선

- [x] 출석 기본 선택, 복주머니 전환, 결과 영역 분리를 검증하는 회귀 테스트를 먼저 작성한다.
- [x] 기존 TabBar로 하위 탭을 추가하고, 복주머니 탭 안에 공격 결과·리플레이를 배치한다.
- [x] 산군 참고 복주머니 이미지를 생성·검수하고 기존 monster 프로필로 WebP 변환한다. Monster.image와 화면 이미지를 동일 경로로 연결하고 출처 기록을 갱신한다.
- [x] 관련 테스트·타입·린트·이미지 검사와 브라우저 검증 후 커밋한다. 생성한 PNG 미리보기는 사용자 바탕화면에도 복사한다.

후속 검증: 관련 4개 파일 14개 테스트, TypeScript, ESLint, 이미지 참조·출처 검사 통과. Chromium에서 두 탭의 상호 배타적 표시, 복주머니 이미지 로드, 모바일 가로 넘침 없음과 라이트·다크 화면을 확인했다. PNG 원본과 세 가지 화면 캡처를 사용자 바탕화면으로 복사하고 해시 일치를 확인했다.

## 복주머니 이미지 수정 마무리

- 산군은 수채화 질감과 색감만 참고하도록 정정했다. 호랑이 얼굴과 동물 문양을 제거한 구름·꽃 자수 복주머니를 사용한다.
- 이미지 대체 텍스트, 화면 테스트, 설계 문서, 이미지 출처와 해시 기록을 수정본에 맞췄다.
- 최종 파일은 512×512 WebP이며 알파 채널을 유지한다. 이미지 직접 검수, 관련 4개 파일 14개 테스트, TypeScript(`node --max-old-space-size=6144 node_modules/typescript/bin/tsc --noEmit`), 변경 파일 ESLint, 이미지 참조·출처 검사 통과.
- 임시 미리보기 서버가 `tsconfig.json`에 추가한 `.next-chuseok` 타입 경로는 정리했다.
- 이번 재개 작업에서는 브라우저 검증을 다시 실행하지 않았다. 이전 브라우저 검증 이후 화면 구조 변경은 없으며, 이미지와 대체 텍스트 수정만 검증했다.
