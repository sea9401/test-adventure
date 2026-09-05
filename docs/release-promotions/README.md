# 테스트 서버 → 운영 승격 이력

`staging-production.json`은 운영 후보를 계산할 때 사용하는 기준점이다. 각 항목은 테스트한
staging SHA와 그 상태를 포함해 실제 운영에 반영한 main SHA를 한 쌍으로 보관한다. main
SHA에는 staging에 없던 운영 전용 수정이 더 포함될 수 있다.

- 운영 배포와 공개 버전 확인이 끝난 항목만 추가한다.
- 기존 항목을 덮어쓰지 않고 시간순으로 추가한다.
- SHA는 모두 40자리 전체 값을 기록한다.
- 내용수정 기록은 필수이며, 별도 패치 노트가 있으면 그 경로도 기록한다.
- 이 파일을 바꾸는 것만으로 배포나 점검 모드 변경이 실행되지는 않는다.

새 기록은 직접 JSON을 편집하기보다 검증 명령을 사용한다.

```bash
npm run toolkit -- release record-promotion \
  --staging-sha <staging SHA> \
  --main-sha <main SHA> \
  --promoted-at <ISO-8601 시각> \
  --pr <PR 번호> \
  --content-record docs/content-modification-records/<기록>.md
```
