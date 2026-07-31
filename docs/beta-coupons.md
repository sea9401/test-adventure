# 베타 테스터 쿠폰 운영

쿠폰은 참여자별 1회용이며, DB에는 평문 대신 SHA-256 해시만 저장한다. 등록 보상은 기존
우편함의 운영자 보상으로 도착하므로 유저가 우편함에서 직접 수령한다.

## 발급 전 확인

- 마이그레이션을 먼저 적용한다: `npm run db:migrate`
- 베타 참여자는 `users.created_at`이 `--before`보다 이르고 `character.v2` 세이브가 있는 계정이다.
- 카카오 계정은 `--audience kakao --deliver-inbox`로 계정 귀속 코드를 게임 내 쪽지로 보낸다.
- 구글 전용 계정은 `--audience google-only --transferable`로 새 카카오 계정에서 쓸 코드를
  CSV로 만든 뒤 등록된 구글 이메일로 전달한다. 이때 코드는 받은 사람
  누구나 먼저 사용할 수 있으므로 유출에 주의한다.
- `--ends-at`을 생략하면 만료 없이 캠페인이 유지된다. 운영 중지는 캠페인의 `active`로 처리한다.
- 날짜에는 오프셋을 포함한 ISO 형식을 사용한다. 예: `2026-08-15T10:00:00+09:00`.

## 발급 예시

```bash
node scripts/issue-beta-coupons.mjs \
  --slug beta-2026 \
  --name "베타 테스터 감사 선물" \
  --before 2026-08-01T13:00:00+09:00 \
  --starts-at 2026-08-01T13:00:00+09:00 \
  --title pre_open_regular \
  --stamina-potions 15 \
  --chroma-name-boxes 2 \
  --chat-badge-boxes 2 \
  --profile-border-boxes 1 \
  --audience kakao \
  --deliver-inbox \
  --message "베타 테스트에 함께해주셔서 감사합니다." \
  --output ./beta-coupons-kakao.csv
```

`--title`, `--gold`, `--museun-coins`, `--stamina-potions`, `--adventure-support-days`,
`--chroma-name-boxes`, `--chat-badge-boxes`, `--profile-border-boxes`를 함께 조합할 수 있다.
출력 CSV는 소유자만 읽을 수 있는 권한으로 새로 생성하며 기존 파일은 덮어쓰지 않는다.
같은 캠페인을 다시 실행하면 이미 발급된 계정은 건너뛰고 새 참여자만 발급한다.

구글 전용 계정용 코드는 같은 캠페인 설정으로 두 번째 실행한다. `--deliver-inbox`는 빼고
`--audience google-only --transferable --output ./beta-coupons-google.csv`를 사용한다.

유저는 게임 메뉴의 `설정 → 이벤트 → 쿠폰 등록`에서 코드를 입력한다. 등록 성공 후 보상은 우편함에
들어가며, 중복 요청은 DB 행 잠금과 사용 시각으로 차단한다.

## 이미 발급한 캠페인에 꾸미기 상자 추가

앱에 쿠폰 `cashItems` 지원 코드가 배포된 뒤 아래 명령을 실행한다. 기본은 읽기 전용 미리보기이며,
`--apply --operator`를 붙여야 실제 반영된다. 세 수량은 증분이 아니라 캠페인의 최종 수량이다.

```bash
npm run coupon:set-cosmetic-boxes -- \
  --slug beta-2026 \
  --chroma-name-boxes 2 \
  --chat-badge-boxes 2 \
  --profile-border-boxes 1
```

실제 반영은 캠페인 보상을 갱신하고 이미 등록된 코드마다 추가분 운영자 우편을 보내는 작업을 한
트랜잭션으로 처리한다. 이후 등록되는 코드는 갱신된 전체 보상을 받는다. 같은 최종 수량으로 재실행하면
추가 지급하지 않으며, 이미 지급된 보상은 회수할 수 없으므로 수량 감소는 거부한다.
