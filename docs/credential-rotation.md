# 운영 자격증명 감사·교체 런북

이 문서에는 비밀값을 적지 않는다. 새 값은 GitHub 이슈·PR·채팅·쉘 명령인자에
넣지 말고 제공자 콘솔과 AWS SSM SecureString에서만 다룬다. 운영 원본과
런타임 복호화 구조는 `docs/production-secrets.md`를 따른다.

## 2026-07-28~29 감사·최초 교체 결과

- 공개 Git 전체 이력 4,839개 커밋의 18,188개 blob(약 464MB)을 값 비노출
  규칙으로 검사했다.
- 실제 자격증명 노출은 발견되지 않았다. 후보는 `.env.example` 예제,
  비밀번호가 없는 문서 URL, 테스트용 가짜 Discord URL이었다.
- GitHub secret scanning과 push protection이 활성화되어 있고 secret-scanning
  경고는 0건이다. CI의 `npm run check-secrets`는 제공자 토큰 외에 연결
  문자열·내부 비밀의 literal 대입도 차단한다.
- 운영 환경 파일은 SSM SecureString으로 이전하며 실행 중에는 `/run`의 `600`
  파일만 사용한다. `CRON_SECRET`은 crontab에 박혀 있지 않다.
- 2026-07-28 `AUTH_SECRET`·`CRON_SECRET` 교체와 사용하지 않는
  `AUTH_GOOGLE_ID`·`AUTH_GOOGLE_SECRET` 제거를 완료했다.
- 2026-07-29 `AUTH_KAKAO_SECRET`과 RDS 비밀번호를 교체하고 SSM 운영 환경에
  반영했으며 공급자 콘솔의 이전 값을 폐기했다. 값·해시·일부 문자는 기록하지 않았다.

저장소에서 발견되지 않았더라도 과거 채팅에 노출됐다고 기록된
`AUTH_SECRET`, `AUTH_KAKAO_SECRET`, DB 비밀번호, `CRON_SECRET`은 유출된 것으로
간주해 모두 교체했다. 아래 절차는 정기 회전이나 사고 대응 때 다시 사용한다.

## 재교체 시 영향과 순서

| 대상 | 영향 | 교체 방식 |
| --- | --- | --- |
| `AUTH_SECRET` | JWT 세션과 서명된 계정 연결/가장 의도가 무효화되어 모든 이용자가 다시 로그인해야 함 | 내부 자동 교체 도구 |
| `CRON_SECRET` | 재시작 전의 짧은 구간에 크론 401 가능 | `AUTH_SECRET`과 같이 교체; crontab 수정 불필요 |
| `AUTH_KAKAO_SECRET` | 교체 중 신규 카카오 로그인 토큰 발급이 일시 실패할 수 있음 | Kakao Developers에서 재발급 후 EC2 반영 |
| `DATABASE_URL` 비밀번호 | 공급자 변경과 앱 반영 사이에 DB 접속 실패 가능 | 점검 모드에서 RDS와 EC2를 연속 변경 |

여러 키를 다시 회전해야 할 때는 내부 키 → Kakao → DB 순서로 한 번에 하나씩
교체하고 각 단계에서 로그인·헬스를 확인한다.

## 1. `AUTH_SECRET` + `CRON_SECRET`

2026-07-28 최초 교체는 완료했다. 다시 회전할 때는 로그인 이용자가 적은 시간을
잡고 전체 재로그인을 감수할 때만 실행한다. SSM 현재 값을 `600` 임시 파일로
받아 아래 도구를 적용한 뒤, 검사된 파일 전체를 SSM의 새 버전으로 올린다.

```bash
cd ~/adventure-rpg
node scripts/rotate-internal-secrets.mjs /secure/admin/production.env
bash deploy/maintenance.sh on
node scripts/rotate-internal-secrets.mjs /secure/admin/production.env \
  --apply --confirm-session-invalidation
node --env-file=/secure/admin/production.env scripts/check-production-env.mjs
# AWS 관리자 자격으로 /adventure-rpg/production/env 새 버전 업로드
sudo systemctl restart adventure-rpg
curl -fsS http://127.0.0.1:3000/api/health
# 여기서 결과를 확인하고 사용자에게 별도 점검 해제 승인을 받는다.
bash deploy/maintenance.sh off
PUBLIC_RELEASE_EXPECTED_BUILD_ID="$(git rev-parse --short HEAD)" \
  npm run check-public-release
```

도구는 새 값을 출력하지 않고 원자적으로 두 행을 교체한다. 기존 파일은
`600` 권한의 `.rotation-backup-<timestamp>`로 남긴다. 실패하면 이 백업을
SSM에 새 버전으로 다시 올린 뒤 재시작한다. 검증이 끝나면 임시 파일과 백업을
안전하게 폐기한다.

## 2. Kakao Client secret

2026-07-29 최초 교체와 이전 값 폐기를 완료했다. 다시 회전할 때는 아래 순서를 따른다.

[Kakao 공식 안내](https://developers.kakao.com/docs/en/app-setting/app)의 운영 중 변경
순서를 따른다.

1. 점검 모드를 켠다.
2. Kakao Developers → 앱 → 플랫폼 키 → REST API 키 → Client secret에서
   활성을 `OFF`로 저장한다.
3. 코드를 재발급하고 저장한다. 예전 코드는 복구할 수 없다.
4. 권한 `600`의 관리자 임시 파일에서 `AUTH_KAKAO_SECRET`만 바꾸고 생산 환경
   사전 검사를 통과한 파일을 SSM 새 버전으로 올린다.
5. 생산 환경 사전 검사 후 앱을 재시작한다.
6. Kakao Client secret 활성을 `ON`으로 저장한다.
7. 점검 모드를 끄고 실제 Kakao 로그인 1회를 확인한다.

새 코드를 잘못 반영하면 Kakao가 `KOE010`/잘못된 client credentials를
반환한다. 기존 앱 JWT 세션은 `AUTH_SECRET`을 바꾸지 않는 한 이 단계만으로
일괄 만료되지 않는다.

## 3. RDS 비밀번호

2026-07-29 최초 교체와 SSM 반영을 완료했다. 다시 회전할 때는 아래 순서를 따른다.

먼저 `bash deploy/backup-db.sh`로 백업을 만들고 점검 모드를 켠다. RDS의 비밀번호
변경 또는 Secrets Manager 즉시 회전을 실행한 직후, SSM 운영 환경의
`DATABASE_URL`에 새 비밀번호를 반영하고 앱을 재시작한다. AWS가 관리하는 master secret은
[공식 RDS 절차](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/rds-secrets-manager.html)로
즉시 회전할 수 있다.

`DATABASE_URL`의 비밀번호에 URL 예약 문자가 있으면 percent-encoding이 필요하다.
사전 검사, 로컬 `/api/health`, 백업 스크립 1회를 모두 통과한 뒤 점검 모드를
해제한다. 현재 앱이 master user를 사용 중이라면 후속으로 앱 전용 최소 권한
DB user를 분리한다.

## 4. 회전 작업 마무리

- `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` 두 행이 SSM 운영 환경에 없는지 확인한다.
- `/run/adventure-rpg/production.env` 권한이 `600`인지 다시 확인한다.
- 로그인, `/api/health`, 배포 스모크, 크론 인증을 확인한다.
- 백업파일과 클립보드에 예전 비밀이 남지 않게 정리한다.
- 교체 일자와 검증 결과만 기록하고 값·해시·일부 문자는 기록하지 않는다.
