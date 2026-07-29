# 브라우저 E2E·접근성 출시 게이트

Playwright가 로컬 프로덕션 빌드를 실제 브라우저로 열어 공개 출시 표면을 검사한다.

## 검사 범위

- 데스크톱 Chromium과 모바일 WebKit(iPhone 13 에뮬레이션)
- 로그인 대문, 정책 4종, 안내서 첫 화면
- 동일 출처 4xx/5xx 응답, 브라우저 콘솔 오류, 처리되지 않은 페이지 오류
- 모바일을 포함한 문서 가로 넘침
- WCAG 2.0·2.1·2.2 A/AA 중 axe가 자동 탐지할 수 있는 규칙
- 키보드 정책 링크 이동
- 비로그인 루트 307, 개발 화면·코인 상점·개발 API 404
- 제3자 고지, OFL, PWA manifest, robots, sitemap
- 주요 보안 응답 헤더

공개 화면 검사는 운영 계정이나 데이터베이스를 사용하지 않는다. 브라우저 안의
`/api/auth/session` 요청만 익명 세션(`null`)으로 응답하게 한다. CI에서는 잡마다
빈 `adventure_e2e` PostgreSQL 컨테이너를 만들고 전체 마이그레이션과 고정 테스트
계정 준비를 먼저 검증한다. 현재 공개 화면 시나리오는 이 계정으로 로그인하지 않으며,
인증·게임 플레이 시나리오는 다음 E2E 단계에서 추가한다.

테스트 계정 준비 스크립트는 loopback 호스트의 `adventure_e2e` DB에서만 실행된다.
평문 DB 연결 예외도 별도 테스트 플래그가 설정된 loopback 주소에서만 허용되므로
운영 DB 주소나 실제 계정에는 사용할 수 없다. CI의 DB와 계정은 잡 종료와 함께
폐기되며 워크플로에 적힌 자격 증명은 이 컨테이너에서만 쓰는 공개 테스트 값이다.

운영 CSP의 `upgrade-insecure-requests`는 별도의 원본 응답 검사에서 존재를 강제한다.
실제 브라우저가 로컬 HTTP 서버를 검사할 때만 이 지시어를 응답에서 제거한다. 그렇지
않으면 WebKit이 로컬 CSS·JS 주소를 존재하지 않는 HTTPS 서버로 바꿔 요청하기 때문이다.

자동 검사는 키보드 사용성, 화면 확대, 스크린 리더의 실제 사용 경험과 콘텐츠 이해도를 모두 판정하지 못한다. 큰 UI 변경이나 출시 전에는 수동 확인을 함께 한다.

## 로컬 실행

```bash
npm run build
npx playwright install chromium webkit
npm run test:e2e
```

로컬에서 인증 E2E용 DB 기반만 준비하려면 PostgreSQL에 `adventure_e2e` DB를 만든 뒤
다음처럼 실행한다. 이 명령은 마이그레이션을 반복 적용하고 같은 계정을 다시 준비해도
성공한다.

```bash
DATABASE_URL=postgresql://browser_e2e:browser_e2e@127.0.0.1:5432/adventure_e2e \
DATABASE_TLS_DISABLED_FOR_LOCAL_TESTS=true \
E2E_TEST_LOGIN_ID=browser-e2e \
E2E_TEST_PASSWORD=browser-e2e-only-password \
npm run test:e2e:db:setup
```

실패 보고서는 `playwright-report/`에 생성된다. CI에서는 실패 여부와 관계없이 14일간 보고서를 보관한다.
