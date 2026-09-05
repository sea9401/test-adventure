# 스테이징 운영 승격 도구 설계

## 목적

즉흥적으로 여러 차례 수정한 테스트 서버의 현재 상태를 하나의 운영 출시 후보로 묶는다.
운영 전용 핫픽스는 보존하고, 마지막 승격 이후 테스트 서버에서 바뀐 내용만 정확히
식별한다. 이 도구는 출시 후보를 준비할 뿐 커밋, 푸시, PR 병합, 운영 배포 또는 점검
모드 변경을 실행하지 않는다.

## 기준점

저장소에는 `docs/release-promotions/staging-production.json`을 두고 성공한 승격마다 다음을
기록한다.

- 테스트한 정확한 `staging` SHA
- 그 내용을 포함해 운영에 배포된 정확한 `main` SHA
- 승격 시각과 PR 번호
- 패치 노트 및 내용수정 기록 경로

도구는 마지막 기록의 staging SHA와 현재 `origin/staging` SHA 사이를 테스트 서버 변경으로,
마지막 기록의 main SHA와 현재 `origin/main` SHA 사이를 운영 전용 변경으로 간주한다.

## 명령과 안전 경계

### 출시 후보 준비

```bash
npm run toolkit -- release promote-staging \
  --worktree /tmp/adventure-production-candidate-YYYYMMDD \
  --branch release/staging-YYYYMMDD \
  --dry-run
```

`--dry-run`은 기준 SHA, 변경 파일, 양쪽에서 함께 바뀐 파일과 주의 항목만 출력한다. 실제
실행은 최신 `origin/main`에서 `/tmp` 작업 트리와 `release/` 브랜치를 만들고, 마지막 승격
이후 staging의 전체 diff를 3-way 방식으로 인덱스에 적용한다. 결과는 커밋하지 않은 staged
변경으로 남겨 사람이 diff, 패치 노트, 내용수정 기록을 검토할 수 있게 한다. 충돌이 나면
작업 트리를 보존하고 실패로 종료한다.

다음 안전 조건을 강제한다.

- 작업 트리는 `/tmp` 바로 아래 또는 그 하위의 새 경로만 허용한다.
- 브랜치는 `release/` 접두사만 허용한다.
- 원격 `main`과 `staging`을 갱신한 뒤 정확한 40자리 SHA를 사용한다.
- 기록된 이전 SHA가 현재 각 브랜치의 조상이 아니면 중단한다.
- 기존 경로 또는 기존 브랜치를 덮어쓰지 않는다.
- 운영 전용 변경과 겹친 파일, 마이그레이션, 배포·환경 설정, 테스트 전용 후보를 자동으로
  제외하지 않고 주의 항목으로 표시한다.

### 승격 이력 기록

운영 배포와 공개 검증이 실제로 끝난 다음 아래 명령으로 이력을 추가한다.

```bash
npm run toolkit -- release record-promotion \
  --staging-sha <테스트한 40자리 SHA> \
  --main-sha <배포한 40자리 SHA> \
  --promoted-at <ISO-8601 시각> \
  --pr <PR 번호> \
  --content-record <저장소 상대 경로> \
  --patch-notes <저장소 상대 경로>
```

이 명령은 SHA 존재·조상 관계, 시간, PR 번호, 문서 경로를 검증하고 JSON을 원자적으로
갱신한다. 파일 변경만 수행하며 커밋하거나 배포하지 않는다. `--patch-notes`는 실제 패치
노트 파일이 별도로 없을 때 생략할 수 있다.

## 생성되는 로컬 자료

출시 후보 작업 트리의 `.toolkit/work/production-promotion/`에 감사 결과와 다음 승격 이력
초안을 저장한다. 이 디렉터리는 Git 추적 대상이 아니며 운영 배포 성공 전 이력 파일이
성공한 것처럼 갱신되는 일을 막는다.
