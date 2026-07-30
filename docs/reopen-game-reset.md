# 재오픈 게임 데이터 초기화

> 목표: 인증 계정 ID·OAuth·쿠폰·운영 기록은 보존하고, 베타 기간의 캐릭터·재화·소셜·시즌 진행만 지운다.
>
> 실행은 비가역적이다. 재오픈 직전 점검 모드와 복원 가능한 백업이 모두 확인된 뒤에만 실행한다.

## 보존 계약

- `users` 행과 `accounts`, `password_credentials`: 유저 ID·이메일·OAuth 연결·심사용 계정 보존
- `coupon_campaigns`, `coupon_codes`: 카카오 계정 귀속과 이메일 쿠폰 모두 보존
- `marketplace_inbox`: 운영자가 보낸 쿠폰 코드 안내만 보존
- 제재·오남용·경제·관리자 감사 로그, 건의사항, 운영 설정 보존
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

출력의 유저·쿠폰·쿠폰 안내 건수를 운영 메모에 옮긴다. 알지 못하는 테이블, 다른 DB명, 끊긴 계정 귀속 쿠폰이 하나라도 있으면 여기서 중단한다.

## 3. 실행

아래 숫자는 예시다. 반드시 2단계 미리보기에 방금 출력된 숫자를 사용한다.

```bash
node --env-file=/run/adventure-rpg/production.env scripts/reset-game-progress.mjs \
  --expect-database test_adventurerpg \
  --expect-users 56 \
  --expect-coupon-codes 50 \
  --expect-coupon-notices 35 \
  --maintenance-flag /etc/nginx/msmsge-maintenance.on \
  --confirm RESET-GAME-PROGRESS \
  --execute
```

실행 가드:

- 예상 DB명이 실제 `current_database()`와 정확히 일치
- 점검 플래그가 실제 일반 파일로 존재
- 유저·쿠폰·쿠폰 안내 건수가 미리보기와 일치
- `drizzle.__drizzle_migrations`가 올바른 스키마에 존재
- 모든 `public` 테이블이 중복 없이 분류됨
- 실행 중 전체 테이블 잠금과 advisory lock 획득
- 보존 테이블 건수·핵심 내용 해시와 쿠폰 안내가 전후로 동일함

검증이 하나라도 실패하면 전체 트랜잭션을 롤백한다.

## 4. 재오픈 직전 검증

1. 유저·OAuth 계정·쿠폰 코드·쿠폰 안내 건수가 전과 같다.
2. `saves_kv`, 길드, 거래소, 랭킹, PvP, 협동·전초기지 테이블이 비어 있다.
3. `users.game_name` 및 사냥 상태가 모두 초기화되었다.
4. 카카오 로그인 후 신규 캐릭터 생성·시작 장비 지급을 확인한다.
5. 카카오 계정 귀속 쿠폰 안내가 보이고 다른 계정에서는 등록되지 않는지 확인한다.
6. `/api/health`, `/sign-in`, 운영 알림, 크론을 확인한 후에만 점검 모드를 끄다.

## 복구

실행 후 오류를 발견하면 점검 모드를 유지하고 직전 백업 전체를 복원한다. 부분 복구나 수동 재생성은 하지 않는다.
