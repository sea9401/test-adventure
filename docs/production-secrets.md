# 운영 비밀값 — AWS SSM Parameter Store

운영 앱의 일반 환경변수 원본은 서울 리전의 단일 표준 `SecureString`
파라미터다. Web Push VAPID 키와 홍보 보상 중복 방지 HMAC 키는 GitHub의
`msmsge.com` 배포 환경 비밀값에 분리 보관하고, 배포 중 서버의 접근 제한
파일로 설치한다. 비밀값 자체를 이 문서·PR·채팅·쉘 명령 인자에 적지 않는다.

| 항목        | 값                                                                              |
| ----------- | ------------------------------------------------------------------------------- |
| 파라미터    | `/adventure-rpg/production/env`                                                 |
| 리전        | `ap-northeast-2`                                                                |
| 유형·티어   | `SecureString` · Standard                                                       |
| 암호화 키   | AWS 관리형 `alias/aws/ssm`                                                      |
| EC2 역할    | `MsmsgeProdDbBackupEc2Role`                                                     |
| EC2 권한    | 위 파라미터에 대한 `ssm:GetParameter`만                                         |
| 런타임 캐시 | `/run/adventure-rpg/production.env` · 디렉터리 `700`, 파일 `600`                |
| 배포 비밀값 | GitHub 환경 비밀값 → `/etc/adventure-rpg/web-push.env` · `root:ec2-user`, `640` |

표준 파라미터 한도는 4KB다. 현재 운영 env는 이보다 작으며, 동기화 도구도
1~4096바이트·env 문법·중복 키를 검사한 뒤에만 원자적으로 런타임 캐시를
교체한다. 값이나 일부 문자는 로그에 출력하지 않는다.

## 동작 방식

1. 배포가 `scripts/sync-production-env-from-ssm.mjs`로 파라미터를 복호화해
   `/run`에 동기화한다.
2. 생산 환경 사전 검사·빌드·DB 마이그레이션이 그 런타임 파일을 사용한다.
3. systemd도 매 시작마다 다시 동기화하고 사전 검사를 통과한 뒤 `next start`를
   실행한다. EC2에는 AWS 장기 액세스 키를 두지 않고 인스턴스 역할을 쓴다.
4. 크론·DB 백업·자원 모니터도 같은 `/run` 파일을 읽는다.
5. 프로젝트 디렉터리에는 `.env.production.local`을 남기지 않는다.

Web Push 키 3개(`WEB_PUSH_VAPID_PUBLIC_KEY`,
`WEB_PUSH_VAPID_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`)와 홍보 보상 중복 방지 키
`REFERRAL_IDENTITY_SECRET`은 배포 워크플로가 값을 출력하지 않은 채
`/etc/adventure-rpg/web-push.env`에 설치한다. systemd는 SSM 런타임 파일과
이 파일을 함께 읽는다.

## OIDC·Systems Manager 배포 전환 조건

2026-08-13 기준 EC2의 SSM Agent 프로세스는 실행 중이지만 인스턴스 역할에 관리 노드
권한이 없어 `ssm:UpdateInstanceInformation` 단계에서 등록이 거부된다. 따라서 현재 배포를
SSM Run Command로 바꾸지 않는다. AWS 관리자 자격으로
`infra/operations/enable-ssm-managed-instance.sh`를 적용하고 Fleet Manager에서 인스턴스가
`Online`인지 확인해야 한다.

그 뒤 GitHub OIDC 역할은 `repo:sea9401/test-adventure:environment:msmsge.com` subject와 운영
인스턴스 하나로 제한한다. Web Push 세 값과 `REFERRAL_IDENTITY_SECRET`을 명령 인자에
실어 SSM으로 보내지 않는다. 먼저 이 네 값을 기존 SecureString 원본으로 옮기고 4KB 한도와
사전 검사를 통과시킨 다음, 두 번의 정상 배포와 break-glass 접속 검증이 끝났을 때만
`EC2_SSH_KEY`를 폐기한다.

## 최초 구성

IAM 역할에 `deploy/aws/production-env-reader-policy.json`을 인라인 정책으로
붙인다. 정책은 계정·리전·파라미터 하나에만 한정되어 있으며
`DescribeParameters`, 경로 전체 조회, 쓰기 권한은 주지 않는다.

최초 값 등록은 AWS 관리자 자격으로 수행한다. 현재 운영 파일을 명령 인자나
표준 출력에 싣지 말고 AWS CLI의 `file://` 입력 또는 Systems Manager 콘솔의
SecureString 입력을 사용한다. EC2 역할에 일시적으로 쓰기 권한을 부여해
부트스트랩했다면 등록 직후 반드시 제거하고 위 읽기 전용 정책만 남긴다.

등록 뒤 값 비노출 검증:

```bash
aws ssm get-parameter \
  --region ap-northeast-2 \
  --name /adventure-rpg/production/env \
  --query 'Parameter.{Name:Name,Type:Type,Version:Version}'
```

## 변경·회전

1. 신뢰할 수 있는 관리자 환경에서 현재 버전을 복호화해 권한 `600`의 임시
   파일로 받는다. 값은 터미널에 출력하지 않는다.
2. 임시 파일의 필요한 키만 바꾸고 `scripts/check-production-env.mjs`로 검사한다.
3. `put-parameter --overwrite --type SecureString --tier Standard`로 새 버전을
   올린다.
4. 점검 모드에서 앱을 재시작하고 health·로그인·크론 인증을 검사한다.
5. 검증 후 임시 파일을 안전하게 폐기한다. 문제가 있으면 Parameter Store의
   직전 버전 값을 새 버전으로 다시 올려 롤백한다.

`AUTH_SECRET` 회전은 모든 세션을 로그아웃시키며, `CRON_SECRET`은 앱 재시작과
동시에 반영해야 한다. `REFERRAL_IDENTITY_SECRET`은 GitHub `msmsge.com` 환경
비밀값에서 관리하며, 홍보 보상 중복 방지 원장을 보유하는 동안 임의로 회전하지
않는다. 회전이 필요하면 기존 키로 만든 원장의 안전한 재키잉 절차를 먼저 마련한다.
Kakao·RDS 비밀번호는 공급자에서 먼저/같이 바꾸는 별도 순서를
`docs/credential-rotation.md`에서 따른다.
