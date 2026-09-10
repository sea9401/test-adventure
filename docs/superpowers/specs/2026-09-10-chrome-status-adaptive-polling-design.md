# 상단 상태 적응형 조회 설계

## 범위와 선택

4차 요청 최적화 완료 후 이어서 상시 마운트되는 `ChromeStatusProvider`의 요청을 줄인다. 현재 60초 고정 조회는 알림·우편·공지 상태가 같아도 계속 실행된다. 고정 주기를 일괄 늘리면 활동 중에도 반응이 느려지고, 새 전송 구조 도입은 범위가 크므로 기존 공통 visible polling scheduler를 재사용한다.

## 동작

- 최초 성공 상태 이후 같은 알림 수·우편 수·공지 여부가 두 번 연속이면 60초에서 120초로 늘린다.
- 상태가 바뀌면 다음 간격은 60초로 돌아간다. 실패는 마지막 성공 상태와 idle 단계를 유지한다.
- hidden에서는 최초 조회를 포함해 요청하지 않고 visible 복귀 시 즉시 갱신한다.
- 기존 `v2notif:read`, `v2inbox:refresh`, `bulletin:read` 이벤트는 visible에서 즉시 조회하고 scheduler를 재시작하여 60초 주기로 돌아간다. hidden 이벤트는 복귀 조회로 반영한다.
- 동시에 진행하는 fetch는 기존 guard로 한 건으로 제한한다. cleanup은 timer와 이벤트를 제거한다.
- 장시간 상태가 같은 화면에서 이 endpoint의 정상 주기 요청은 최대 50% 줄어든다. 새 원격 알림의 발견 지연은 최대 약 120초가 된다.

API·데이터·화면 구성·채팅·제재 조회는 변경하지 않는다. 기존 테스트 실패 11개 수정, AWS 설정, 배포, 푸시는 범위 밖이다. 사용자 `tsconfig.json` 변경은 보존한다.

## 검증

실제 Provider와 fake timer를 사용해 backoff, 변경 후 복구, 실패 후 회복, hidden 최초 마운트, 이벤트 즉시 갱신과 예약 초기화, 진행 중 중복 방지 및 unmount 정리를 검증한다. 관련 consumer·scheduler 테스트와 lint·TypeScript 검사를 수행한다.
