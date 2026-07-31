# 재오픈 게임 데이터 초기화

> 목표: 카카오·운영자 발급 아이디/비밀번호 계정과 쿠폰·운영 기록은 보존하고,
> 구글 전용 계정 및 베타 기간의 캐릭터·재화·소셜·시즌 진행은 지운다.
>
> 실행은 비가역적이다. 재오픈 직전 점검 모드와 복원 가능한 백업이 모두 확인된 뒤에만 실행한다.

## 보존 계약

- 카카오 연결 또는 `password_credentials`가 있는 `users` 행은 보존한다.
- `accounts.provider = 'kakao'`와 운영자 발급 아이디·비밀번호 계정은 보존한다.
- 구글 연결은 모두 삭제한다. 구글 외 인증수단이 없는 사용자는 `users` 행도 삭제하고,
  카카오·아이디/비밀번호가 함께 있는 사용자는 사용자 행만 보존한다.
- `coupon_campaigns`, `coupon_codes`: 카카오 계정 귀속과 이메일 쿠폰 모두 보존
- 구글 전용 계정에 발급된 양도 가능 쿠폰은 `issued_for_user_id` 감사 메타데이터만 남고
  실제 사용 제한은 생기지 않는다. 구글 전용 계정에 귀속 제한 쿠폰이 있으면 초기화를 중단한다.
- `marketplace_inbox`: 보존 계정에 운영자가 보낸 쿠폰 코드 안내만 보존
- 구글 전용 사용자의 건의사항은 계정과 함께 삭제하고 프로필·문의 첨부 이미지는 외부 파일
  삭제 큐에 넣는다. 이상 행동·경제 감사 로그는 행을 보존하되 삭제 사용자 ID가 `NULL`로 바뀐다.
- 보존 계정의 제재·건의사항과 오남용·경제·관리자 감사 로그, 운영 설정 보존
- `users.game_name`, 자동 사냥·활성 세션 필드는 초기화. `game_name`을 남기면 신규 캐릭터 경로가 시작 장비를 지급하지 않으므로 반드시 `NULL`로 돌린다.

`scripts/reset-game-progress.mjs`는 `public` 테이블 모두를 보존·초기화·부분 보존 중 하나로 명시적으로 분류한다. 마이그레이션으로 새 테이블이 추가됐는데 분류가 없으면 실행을 중단한다.

## 1. 일정 프리즈·점검·백업

1. `main` CI와 마지막 배포가 녹색인지 확인한다.
2. 자동 배포와 운영 크론이 초기화 사이에 들어오지 않게 작업 창을 확보한다.
3. EC2에서 `bash deploy/maintenance.sh on`을 실행하고 `status`가 ON인지 확인한다.
4. 수동 DB 백업을 만들고 gzip/`pg_restore` 검증과 S3 오프사이트 업로드까지 확인한다.

## 2. 미리보기

미리보기가 기본이며 DB를 변경하지 않는다. 운영 EC2의 현재 환경 파일을 사용한다.

```bash
cd ~/adventure-rpg
node --env-file=/run/adventure-rpg/production.env scripts/reset-game-progress.mjs \
  --expect-database test_adventurerpg
```

출력의 유저·OAuth·구글 삭제 대상·아이디/비밀번호 계정·쿠폰·쿠폰 안내 건수를 운영 메모에 옮긴다. 알지 못하는 테이블, 다른 DB명, 끊긴 계정 귀속 쿠폰이 하나라도 있으면 여기서 중단한다.

## 3. 실행

아래 숫자는 예시다. 반드시 2단계 미리보기에 방금 출력된 숫자를 사용한다.

```bash
node --env-file=/run/adventure-rpg/production.env scripts/reset-game-progress.mjs \
  --expect-database test_adventurerpg \
  --expect-users 56 \
  --expect-auth-accounts 51 \
  --expect-password-accounts 1 \
  --expect-google-accounts 15 \
  --expect-deleted-google-users 15 \
  --expect-coupon-codes 75 \
  --expect-coupon-notices 35 \
  --maintenance-flag /etc/nginx/msmsge-maintenance.on \
  --confirm RESET-GAME-PROGRESS \
  --execute
```

실행 가드:

- 예상 DB명이 실제 `current_database()`와 정확히 일치
- 점검 플래그가 실제 일반 파일로 존재
- 유저·OAuth·구글 삭제 대상·아이디/비밀번호 계정·쿠폰·쿠폰 안내 건수가 미리보기와 일치
- `drizzle.__drizzle_migrations`가 올바른 스키마에 존재
- 모든 `public` 테이블이 중복 없이 분류됨
- 실행 중 전체 테이블 잠금과 advisory lock 획득
- 카카오·아이디/비밀번호 계정과 핵심 내용 해시·쿠폰 안내가 전후로 동일함
- 구글 전용 사용자 수만큼 `users`가 줄고 구글 OAuth 연결이 0개가 됨
- 구글 전용 사용자의 프로필·문의 첨부가 외부 파일 삭제 큐에 기록됨

검증이 하나라도 실패하면 전체 트랜잭션을 롤백한다.

## 4. 재오픈 직전 검증

1. 카카오·아이디/비밀번호 계정·쿠폰 코드·보존 대상 쿠폰 안내가 전과 같다.
2. 구글 OAuth 연결이 0개이고 구글 전용 사용자 행이 모두 삭제되었다.
3. `saves_kv`, 길드, 거래소, 랭킹, PvP, 협동·전초기지 테이블이 비어 있다.
4. `users.game_name` 및 사냥 상태가 모두 초기화되었다.
5. 카카오 로그인과 아이디·비밀번호 로그인 후 각각 신규 캐릭터 생성·시작 장비 지급을 확인한다.
6. 카카오 계정 귀속 쿠폰 안내가 보이고 다른 계정에서는 등록되지 않는지 확인한다.
7. 외부 파일 삭제 큐를 처리하고 실패 건이 재시도 상태로 남았는지 확인한다.
8. `/api/health`, `/sign-in`, 운영 알림, 크론을 확인한 후에만 점검 모드를 끈다.

## 5. 복원 리허설 기록

2026-07-31 최신 운영 백업을 별도 RDS 임시 DB에 복원해 전체 절차를 실행했다.

- 구글 OAuth 15개와 구글 전용 사용자 15명 삭제
- 카카오 OAuth 36개, 아이디/비밀번호 계정 1개와 환경변수 기반 심사용 카카오 대상 보존
- 쿠폰 75개(양도 가능 40개)와 쿠폰 안내 35개 보존
- 구글 전용 사용자의 건의사항 17개 삭제, 프로필 삭제 대상 14개 큐 등록
- `saves_kv`, 길드, 거래소 매물·입찰 등 초기화 대상 0건 확인
- 운영 DB 건수는 리허설 전후 동일함을 재확인하고 임시 DB·작업 파일을 삭제

## 복구

실행 후 오류를 발견하면 점검 모드를 유지하고 직전 백업 전체를 복원한다. 부분 복구나 수동 재생성은 하지 않는다.
