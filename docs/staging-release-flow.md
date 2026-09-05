# 개발·스테이징·운영 출시 흐름

> 최종 확인: 2026-09-06
>
> 일상 작업과 출시 절차의 요약 문서다. 권한·안전 원칙은 루트 `AGENTS.md`, 실제 실행
> 동작은 `.github/workflows/`와 `deploy/`의 현재 코드가 우선한다. 기능별
> `docs/superpowers/specs/`와 `docs/superpowers/plans/`는 해당 작업의 설계·이력이며
> 현재 공통 절차를 대체하지 않는다.

## 공통 원칙

- 사용자가 변경을 명확히 요청하면 조사, 로컬 구현, 비파괴 검증과 커밋까지 진행한다.
- 사용자가 통합·푸시·PR 생성을 요청하지 않았다면 현재 브랜치의 로컬 커밋으로 남긴다.
- 사용자가 배포를 명시적으로 요청하기 전에는 테스트와 운영 어느 환경에도 배포하지 않는다.
- 로직 변경과 버그 수정은 가능한 경우 회귀 테스트를 먼저 추가한다. 밸런스 수치, 문구,
  정적 데이터와 설정 변경은 실익이 없으면 TDD를 생략하고 관련 검증만 수행한다.
- 배포 대상이 명확하지 않으면 운영으로 확대하지 않는다. “테스트 서버에만” 요청은
  `staging`까지만 반영하고 `main`이나 운영 배포를 변경하지 않는다는 뜻이다.

## 로컬 작업

1. 현재 브랜치와 작업 트리를 확인하고 사용자 변경을 보존한다.
2. 관련 코드, 테스트, 문서와 실제 자동화 설정을 함께 확인한다.
3. 요청 범위 안에서 구현하고 변경 위험에 맞는 테스트·정적 검사를 실행한다.
4. diff와 검증 결과를 확인한 뒤 현재 브랜치에 커밋한다.
5. 배포 요청이 없으면 여기서 끝낸다.

## 테스트 서버 출시

1. `staging`에서 기능 브랜치를 만든다.
2. 기능 PR의 대상 브랜치를 `staging`으로 지정한다.
3. CI의 필수 `check`가 통과하면 **Squash and merge**한다. 기능 하나가 `staging`
   커밋 하나가 된다.
4. `staging` push CI가 모두 통과하면 `deploy-staging.yml`이 그 실행의 정확한
   `head_sha`를 `test.msmsge.com`에 자동 배포한다.
5. 배포 작업이 외부 `/api/health`의 정상 상태와 `/api/version`의 정확한 SHA를 확인한다.
6. 테스트 서버에서 실제 플레이를 확인한다. 수정은 새 기능 PR로 같은 흐름을 반복한다.
7. 테스트 전용 요청이면 운영의 `/api/version`이 바뀌지 않았는지 확인하고 종료한다.

스테이징은 운영과 별도 DB(`staging_coreloop`)·별도 DB 역할
(`adventure_staging`)·별도 인증/cron 비밀값을 사용한다. 운영 Discord 웹훅과 운영 백업,
운영 R2 버킷은 연결하지 않는다. staging 전용 R2 버킷이 준비되기 전까지 이미지 업로드
기능은 테스트 서버에서 비활성 상태다.

## 정기 운영 출시

1. 사용자의 명시적인 운영 배포 요청과 출시할 `staging` 상태를 확인한다.
2. 마지막 성공 승격 이후의 staging 변경과 그동안의 main 전용 변경을 감사하고, 최신
   `origin/main`에서 격리된 운영 후보를 준비한다. 아래 명령은 작업 트리와 staged diff만
   만들며 커밋, 푸시, PR 또는 배포를 실행하지 않는다.

   ```bash
   npm run toolkit -- release promote-staging \
     --worktree /tmp/adventure-production-candidate-YYYYMMDD \
     --branch release/staging-YYYYMMDD \
     --dry-run

   npm run toolkit -- release promote-staging \
     --worktree /tmp/adventure-production-candidate-YYYYMMDD \
     --branch release/staging-YYYYMMDD
   ```

3. 출력된 staging·main 기준 SHA, 겹친 파일, 마이그레이션, 배포·환경 설정, 이미지와
   테스트 전용 후보를 확인한다. 생성된 작업 트리에서 staged diff를 검토하고 패치 노트와
   내용수정 기록을 완성한 뒤 하나의 커밋으로 만들어 `main` PR을 연다.
4. PR CI의 필수 `check`가 통과한 뒤 squash merge한다.
5. 정확한 `main` SHA의 push CI가 모두 통과하고
   `production-next-<40자리 SHA>` 아티팩트가 준비될 때까지 기존 서비스를 유지한다.
6. GitHub Actions의 **Deploy to EC2**를 수동 실행하고 `deploy_sha`에 위 `main`의
   전체 40자리 SHA를 입력한다. 내용수정 검토 상태를 `not-applicable`,
   `technical-only`, `recorded`, `reported` 중 하나로 선택하고 변경 요약과 판단 근거를
   적는다. 게임 내용 변경을 내부 기록으로 남기고 신고 판단을 운영자 후속으로 둘 때는
   `recorded`와 `docs/content-modification-records/` 아래의 실제 문서 경로를 입력한다.
   실제 신고를 접수한 `reported` 상태만 접수번호 또는 신고 기록 위치를 입력한다.
   `main` push만으로 운영 배포는 시작되지 않는다.
7. 워크플로가 SHA·CI·아티팩트를 검증하고 아티팩트 전송을 마친 뒤, 실제 런타임 교체
   직전에 점검 모드를 켠다. 일반 배포 요청만으로 점검 모드를 미리 켜지 않는다.
8. 마이그레이션, 서비스 시작, 내부 health·로그인·운영 스모크가 통과해도 점검 모드는
   유지된다. 배포 작업은 외부에서 health 200, 정확한 build ID와 점검 503을 확인한다.
9. 결과를 운영자가 확인하고 사용자가 점검 해제를 별도로 지시한 경우에만 EC2에서
   `bash deploy/maintenance.sh off`를 실행한다.
10. 해제 뒤 실제 도메인의 health, version, 로그인·정책 화면과 숨김 경로를 다시 확인한다.
   저장소 또는 EC2에서 다음 공개 표면 검사를 실행할 수 있다.

   ```bash
   PUBLIC_RELEASE_EXPECTED_BUILD_ID=<40자리 SHA> \
     PUBLIC_RELEASE_MAINTENANCE_POLICY=forbid \
   npm run check-public-release
   ```

11. 운영 배포와 공개 검증이 끝나면 다음 승격의 기준점이 되도록 정확한 SHA를 기록한다.
    `--patch-notes`는 별도 패치 노트 파일이 있을 때만 넣는다. 이 명령도 파일만 수정하며
    커밋하거나 배포하지 않는다.

    ```bash
    npm run toolkit -- release record-promotion \
      --staging-sha <테스트한 staging SHA> \
      --main-sha <배포한 main SHA> \
      --promoted-at <ISO-8601 시각> \
      --pr <PR 번호> \
      --content-record docs/content-modification-records/<기록>.md \
      --patch-notes docs/patch-notes/<패치노트>.md
    ```

승격 이력은 `docs/release-promotions/staging-production.json`에 누적된다. 운영 후보의 감사
결과와 아직 값이 정해지지 않은 다음 이력 초안은 후보 작업 트리의
`.toolkit/work/production-promotion/state.json`에만 저장된다.

## 실패와 롤백

- 운영 배포가 점검 모드를 켜기 전에 실패하면 기존 서비스와 기존 점검 상태를 유지한다.
- 런타임 교체 뒤 실패하면 배포 스크립트가 이전 빌드와 서비스를 복구하지만 점검 모드는
  유지한다. 복구 결과 확인과 별도 승인 전에는 해제하지 않는다.
- 긴급 로컬 롤백도 health 확인 뒤 점검 모드를 유지한다. 이후 `main`을 revert하고,
  되돌린 `main` SHA의 CI·아티팩트를 확인한 뒤 **Deploy to EC2**를 다시 수동 실행해
  저장소와 런타임을 일치시킨다.
- DB 마이그레이션이 포함된 실패는 코드 롤백만으로 해결하지 말고 스키마 호환성과 백업
  복구 필요 여부를 먼저 확인한다.

## 긴급 중단

테스트 서버를 외부에서 즉시 닫아야 하면 EC2에서 아래 명령을 실행한다.

```bash
cd ~/adventure-rpg-test
bash deploy/apply-test-site-closed.sh
```

앱과 staging DB는 유지되고 nginx만 정적 503 안내로 전환된다.

운영은 사용자가 점검 모드를 “지금 바로” 켜라고 명시하거나 서비스 지속이 위험한 장애
상황일 때만 준비 전에 `bash deploy/maintenance.sh on`을 직접 실행한다.

## 프로젝트 툴킷으로 테스트 서버에 릴리스

프로젝트 툴킷은 기능 브랜치에서 `staging` PR을 만들고 테스트 서버의 정확한 빌드까지
확인하는 흐름만 제공한다. 운영 배포 기능은 툴킷에 포함하지 않는다. 변경을 빠르게
검증하고 로컬 체크포인트에 커밋한 다음, 현재 커밋에서 전체 검증을 통과시킨 뒤 사용한다.

```bash
npm run toolkit -- verify fast <task-id>
npm run toolkit -- task checkpoint <task-id> --message "feat: 작업 체크포인트"
npm run toolkit -- verify full <task-id>
```

먼저 PR 범위만 승인하고 계획을 확인한 다음 실행한다.

```bash
npm run toolkit -- task approve <task-id> --action pr --target staging --reason "스테이징 PR 승인"
npm run toolkit -- release pr <task-id> --dry-run
npm run toolkit -- release pr <task-id>
```

PR 검증 이후 테스트 서버 배포까지 진행할 때는 같은 작업에 별도의 테스트 배포 승인을
기록한다. 이 승인은 해당 작업의 브랜치 푸시, staging PR, squash merge, 테스트 배포에만
적용된다.

```bash
npm run toolkit -- task approve <task-id> --action deploy-test --target staging --reason "테스트 서버 배포 승인"
npm run toolkit -- release deploy-test <task-id> --dry-run
npm run toolkit -- release deploy-test <task-id>
```

진행 상태와 외부 ID는 `.toolkit/work/<task-id>/state.json`에 단계별로 저장된다. 명령이
중단되면 같은 명령을 다시 실행해 기존 PR·머지·워크플로를 조회하며 이어갈 수 있다. 성공
판정은 배포 워크플로 완료뿐 아니라 `test.msmsge.com`의 상태 응답과 버전 `buildId`가
머지된 `origin/staging` 전체 SHA와 정확히 일치해야 한다.

```bash
jq .stagingRelease .toolkit/work/<task-id>/state.json
npm run toolkit -- release deploy-test <task-id>
```

## 관련 문서와 실행 기준

- 작업·배포 권한: [`AGENTS.md`](../AGENTS.md)
- CI 게이트: [`.github/workflows/ci.yml`](../.github/workflows/ci.yml)
- 테스트 서버 자동 배포:
  [`.github/workflows/deploy-staging.yml`](../.github/workflows/deploy-staging.yml)
- 운영 수동 배포: [`.github/workflows/deploy.yml`](../.github/workflows/deploy.yml)
- 운영 장애·DB 절차: [`docs/ops-runbook.md`](./ops-runbook.md)
- 운영 변경 체크:
  [`docs/templates/operations-change-checklist.md`](./templates/operations-change-checklist.md)
