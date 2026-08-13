# 로컬 개발 자동 로그인 설계

## 목표

로컬에서 `npm run dev`로 게임을 실행할 때 카카오 로그인 과정을 거치지 않고, 개발 DB에 이미 존재하는 지정 계정으로 자동 로그인한다. 화면 가드만 우회하지 않고 Auth.js의 정상 JWT와 기존 단일 기기 세션 인계 절차를 그대로 사용한다.

## 선택한 방식

Auth.js에 개발 전용 Credentials 공급자 `local-dev`를 조건부로 추가한다. 비로그인 사용자가 `/sign-in`에 도착하면 서버가 로컬 전용 Route Handler로 이동시키고, Route Handler가 이 공급자로 한 번 로그인한 뒤 게임 홈으로 돌려보낸다.

다른 대안은 다음 이유로 채택하지 않는다.

- 기존 `REVIEW_LOGIN_*` 사용: 안전하지만 매번 아이디와 비밀번호를 입력해야 한다.
- `auth()` 또는 페이지 가드에서 가짜 사용자를 반환: JWT 쿠키와 API 인증, 단일 기기 세션 검사를 통과하지 못해 실제 게임 상태를 검증할 수 없다.

## 활성화 조건과 보안 경계

- `NODE_ENV`가 정확히 `development`여야 한다.
- `.env.development.local`의 `LOCAL_DEV_AUTO_LOGIN_USER_EMAIL`이 유효한 이메일이어야 한다.
- 자동 로그인 요청의 호스트와 Origin이 있다면 모두 loopback(`localhost`, `127.0.0.1`, `::1`)이어야 한다.
- 운영 또는 테스트 환경에서는 환경변수가 실수로 존재해도 공급자와 자동 로그인 UI를 활성화하지 않는다.
- 공급자는 새 사용자를 만들지 않고 개발 DB의 기존 `users.email`과 정확히 일치하는 계정만 반환한다.
- 로컬 서버를 외부 네트워크에 공개하는 용도로 사용하지 않는다.

## 구성 요소와 흐름

1. `localDevAutoLogin` 서버 모듈이 환경변수와 요청 출처를 검증하고 기존 사용자를 조회한다.
2. `auth.ts`는 유효한 개발 설정이 있을 때만 `local-dev` Credentials 공급자를 등록한다.
3. `/sign-in`은 세션과 로그인 오류가 없고 개발 자동 로그인이 활성화된 loopback 요청일 때 `/api/auth/local-dev`로 이동한다.
4. 로컬 전용 Route Handler는 `signIn("local-dev", { redirect: false, redirectTo: "/" })`를 호출하고 반환 URL로 303 응답한다.
5. 성공하면 `/`로 이동한다. 기존 Credentials callback이 takeover 쿠키를 발급하고 `SaveProvider`가 기기 세션을 claim한다.
6. 계정이 없으면 Auth.js 오류가 포함된 `/sign-in`으로 돌아온다. 로그인 오류가 존재하는 요청에서는 자동 로그인을 다시 시작하지 않으므로 반복 리다이렉트 없이 기존 카카오·비밀번호 로그인 화면과 오류 안내를 사용할 수 있다.

## 설정 방법

`.env.development.local`에 다음 값을 추가하고 개발 서버를 다시 시작한다.

```dotenv
LOCAL_DEV_AUTO_LOGIN_USER_EMAIL=owner@example.com
```

지정 계정과 캐릭터 데이터는 현재 `DATABASE_URL`이 가리키는 개발 DB에 존재해야 한다. 운영 DB 직접 연결은 이 기능의 사용 방법으로 간주하지 않는다.

## 테스트

- 개발 환경과 유효한 이메일이 모두 있어야 설정이 활성화되는지 검증한다.
- production/test/빈 값/잘못된 이메일에서는 비활성화되는지 검증한다.
- loopback Host와 Origin만 허용하고 원격 호스트를 거부하는지 검증한다.
- 기존 계정 조회 성공, 계정 없음, 잘못된 요청에서 올바른 인증 결과를 반환하는지 검증한다.
- 로컬 전용 Route Handler가 성공 URL로 이동하고 원격 요청을 404로 거부하는지 검증한다.
- 로그인 오류가 있는 대문 요청에서는 자동 로그인을 다시 시작하지 않는지 검증한다.
- 전체 테스트, 타입 검사, 린트와 프로덕션 빌드로 운영 빌드에서 기능이 빠지는지 확인한다.
