# Google Play 심사용 앱 액세스 안내

기준일: 2026-08-08

자격 증명은 이 문서나 Git에 기록하지 않는다. 실제 아이디와 비밀번호는 Play Console의 `앱 액세스` 입력란에만 저장한다.

## Play Console 선택

- 앱의 전체 또는 일부 기능이 제한됨: `예`
- 제한 사유: 로그인 필요
- 별도 인증 수단: 운영자가 발급한 아이디·비밀번호
- OTP·2단계 인증·위치 제한: 없음
- 유료 구독·결제 장벽: 없음

## 영문 심사 안내문

아래 문구의 `<REVIEW_LOGIN_ID>`와 `<REVIEW_LOGIN_PASSWORD>`는 Play Console 안에서만 실제 값으로 바꾼다.

> This game requires sign-in to access gameplay.
>
> 1. Launch the app and wait for the sign-in page.
> 2. Under the yellow Kakao sign-in button, tap **아이디·비밀번호로 로그인** (Sign in with ID and password).
> 3. Enter `<REVIEW_LOGIN_ID>` in the **아이디** field and `<REVIEW_LOGIN_PASSWORD>` in the **비밀번호** field.
> 4. Tap **로그인** (Sign in).
> 5. The review account is preconfigured and does not require an OTP, SMS code, Kakao account, payment, subscription, or location-specific access.
>
> The account provides access to the game, community posts, chat, guild/association features, reporting, blocking, settings, and in-app account deletion. Please do not use the Kakao sign-in button for review.

## 제출 전 운영 점검

- 심사 전용 계정은 관리자 계정이 아닌 일반 이용자 계정으로 둔다.
- 캐릭터와 현재 커뮤니티 정책 동의를 미리 준비한다.
- 마을, 사냥, 생활 콘텐츠, 길드·협회, 거래소, 게시판과 채팅에 접근 가능한 진행 상태를 준비한다.
- 다른 이용자가 작성한 테스트 게시글·채팅·프로필을 준비해 신고와 차단을 확인할 수 있게 한다.
- `active_session_id`를 비우고 심사 기간 동안 운영자가 같은 계정으로 접속하지 않는다.
- 계정 정지, 길드 재가입 대기, 활동 제한과 미처리 CAPTCHA가 없는지 확인한다.
- 실제 자격 증명으로 Android 내부 테스트 설치본 로그인을 한 번 확인한다.
- Play Console에 입력한 안내문과 비밀번호가 만료되지 않는지 제출 직전에 재확인한다.

## 코드상의 로그인 위치

- 로그인 펼침 메뉴: `src/app/sign-in/SignInButtons.tsx`
- 환경변수 기반 심사 로그인: `src/lib/server/reviewLogin.ts`
- 운영자 발급 비밀번호 계정: `scripts/create-password-account.mjs`

환경변수 기반 심사 로그인은 지정된 기존 카카오 사용자를 찾는 호환 경로다. 장기간 재사용할 Play 심사 계정은 별도의 `password_credentials` 계정으로 발급하는 편이 운영상 안전하다.
