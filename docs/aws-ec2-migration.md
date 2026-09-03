# Vercel → AWS EC2 운영 기록

> 상태: 📌 **운영 기록 (살아있는 문서)** — Vercel→AWS EC2 이전·배포 운영 메모. 지속 갱신.

2026-05에 Vercel에서 AWS EC2로 이전했다. 이 문서는 **현재 운영 구성**과
**재현/복구 절차**를 기록한다. 초기 이전 뒤 운영 DB도 Neon에서 서울 리전의
AWS RDS PostgreSQL 18.3으로 옮겼으며, 옛 Neon DB는 운영에 사용하지 않는다.

## 현재 구성

| 요소 | 값 / 위치 |
|---|---|
| 클라우드 | AWS, 리전 `ap-northeast-2` (서울) |
| 인스턴스 | EC2 `t4g.medium` (Arm/Graviton, 2 vCPU / 4 GiB), Amazon Linux 2023 |
| 고정 IP | Elastic IP `54.180.28.29` |
| 디스크 | EBS gp3 20 GiB |
| 스왑 | `/swapfile` 2 GiB (빌드 OOM 방지) |
| 도메인 | `msmsge.com` (Route 53 등록 + 호스팅 영역) — A 레코드 `msmsge.com`, `www` → `54.180.28.29` |
| 런타임 | Node.js 22 (NodeSource), `next start`, 포트 3000 |
| 프로세스 관리 | systemd 유닛 `adventure-rpg.service` (`Restart=always`, `enable`) |
| 리버스 프록시 | nginx, `/etc/nginx/conf.d/msmsge.conf` → `127.0.0.1:3000` |
| HTTPS | Let's Encrypt (`certbot --nginx`), 자동갱신 `certbot-renew.timer` |
| 크론 | `ec2-user` crontab (vercel.json crons 대체) — `crond`(cronie) |
| DB | AWS RDS PostgreSQL 18.3 · 서울 리전 · DB명 `test_adventurerpg`(옛 이름이지만 운영 DB) |
| 코드 위치 | `/home/ec2-user/adventure-rpg` (GitHub `sea9401/test-adventure`; 정규 배포는 workflow의 임시 읽기 토큰으로 정확한 SHA fetch) |
| 환경변수 원본 | SSM SecureString `/adventure-rpg/production/env` |
| 환경변수 런타임 캐시 | `/run/adventure-rpg/production.env` (디렉터리 `700`, 파일 `600`) |
| 배포 | `main` push CI → `production-next-<SHA>` 생성 → 운영자가 `deploy.yml`에 정확한 SHA 입력 → 아티팩트 검증·전송 → 점검 ON → 빌드 교체·마이그레이션·스모크 → 점검 유지 |

`deploy/` 폴더의 파일들: `adventure-rpg.service`, `nginx-adventure-rpg.conf`, `crontab.txt` (참조용), `deploy.sh` (수동 배포용).

### 환경변수 (AWS SSM Parameter Store)
앱이 실제로 쓰는 것: `AUTH_SECRET`, `AUTH_KAKAO_ID/SECRET`, `DATABASE_URL`(RDS), `ADMIN_EMAILS`, `CRON_SECRET`. EC2 추가분: `AUTH_URL=https://msmsge.com`, `AUTH_TRUST_HOST=true`, `NODE_ENV=production`. Google 로그인은 정식 출시 설정에서 제외되어 `AUTH_GOOGLE_ID/SECRET`을 읽지 않는다. (Vercel pull 파일의 `CLERK_*`, `TURBO_*`, `VERCEL_*` 등은 미사용 — 옮길 필요 없음.)
systemd와 배포는 SSM 값을 `/run/adventure-rpg/production.env`로 동기화한다. `db:migrate`(`node src/db/migrate.mjs`)는 `.env`를 자동 로드하지 않으므로 항상 `node --env-file=/run/adventure-rpg/production.env src/db/migrate.mjs`로 실행한다. 상세 구조는 `docs/production-secrets.md` 참고.

## 배포 (일상)

일상 개발은 기능 브랜치 → `staging` PR → CI → 테스트 서버 자동 배포로 검증한다.
운영 출시는 `staging → main` PR을 머지한 뒤, 정확한 `main` SHA의 전체 CI와
`production-next-<SHA>` 아티팩트가 준비됐을 때 GitHub Actions의 **Deploy to EC2**를
수동 실행한다. `deploy_sha`에는 전체 40자리 SHA를 입력한다. `main` push만으로 운영
서버는 바뀌지 않는다. 자세한 절차는
[`staging-release-flow.md`](./staging-release-flow.md)를 따른다.

배포는 전송과 사전 검증이 끝난 뒤 런타임 교체 직전에 점검 모드를 켜며, 스모크가
성공해도 점검을 유지한다. 사용자가 결과 확인 후 별도로 해제를 지시해야
`bash deploy/maintenance.sh off`를 실행한다.
**서버에서 코드 직접 수정 금지** — 운영 배포가 요청된 정확한 `main` SHA를 강제로
체크아웃하므로 로컬 수정은 보존되지 않는다.

수동 배포가 필요하면 서버에서: `cd ~/adventure-rpg && bash deploy/deploy.sh`

필요한 GitHub Secrets: `EC2_HOST` (=`54.180.28.29`), `EC2_SSH_KEY` (=EC2 접속 private key 내용).

## 운영 치트시트 (서버에서)

| 작업 | 명령 |
|---|---|
| SSH 접속 | (로컬) `ssh -i ~/.ssh/msmsge-key.pem ec2-user@54.180.28.29` |
| 앱 상태 | `sudo systemctl status adventure-rpg` |
| 앱 재시작 | `sudo systemctl restart adventure-rpg` |
| 앱 로그 | `journalctl -u adventure-rpg -f` |
| nginx 재적용 | `sudo nginx -t && sudo systemctl reload nginx` |
| 인증서 갱신 테스트 | `sudo certbot renew --dry-run` |
| 크론 목록 | `crontab -l` |
| 크론 실행 로그 | `sudo journalctl --since '5 min ago' \| grep CROND` |
| DB 마이그레이션만 | `cd ~/adventure-rpg && node --env-file=/run/adventure-rpg/production.env src/db/migrate.mjs` |
| 헬스체크 | `curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:3000/api/health` |

## 처음부터 다시 세팅해야 한다면 (요약)

1. **EC2**: 서울 리전, Amazon Linux 2023 (Arm), `t4g.small`, 20 GiB gp3, 키페어, 보안 그룹 인바운드 22(SSH; GitHub Actions 배포 쓰면 `0.0.0.0/0`)·80·443. Elastic IP 할당+연결.
2. **Route 53**: 도메인 등록(또는 외부 도메인의 NS 를 Route 53 으로) → 호스팅 영역에 A 레코드 `@`, `www` → EIP.
3. **인스턴스 셋업**: 스왑 2 GiB → `dnf install -y git nginx cronie` + Node 22(NodeSource) → `useradd` 불필요(ec2-user 사용).
4. **코드**: `git clone https://github.com/sea9401/test-adventure.git ~/adventure-rpg`. 비공개
   저장소의 정규 배포 fetch는 `deploy.yml`이 전달하는 임시 `GITHUB_TOKEN`을 사용한다.
5. **env**: SSM SecureString과 EC2 읽기 전용 IAM 정책 구성. 동기화 후 `node --env-file=/run/adventure-rpg/production.env src/db/migrate.mjs` → 배포 스크립트로 빌드.
6. **systemd**: `deploy/adventure-rpg.service` → `/etc/systemd/system/` → `daemon-reload; enable --now adventure-rpg`.
7. **nginx + HTTPS**: `deploy/nginx-adventure-rpg.conf` → `/etc/nginx/conf.d/msmsge.conf` (server_name 교체) → `systemctl enable --now nginx` → `dnf install -y certbot python3-certbot-nginx` → `certbot --nginx -d msmsge.com -d www.msmsge.com` → `systemctl enable --now certbot-renew.timer`.
8. **크론**: `systemctl enable --now crond` → `deploy/crontab.txt` 상단 주석의 등록 스크립트 실행.
9. **OAuth 콜백**: Kakao Developers 에 `https://msmsge.com/api/auth/callback/kakao` (+ 카카오 사이트 도메인) 추가.
10. **CI**: GitHub Secrets `EC2_HOST`, `EC2_SSH_KEY` 등록.

## 이전 마무리 상태와 선택 후속

- 비밀값 감사·재유출 방지, 내부·Kakao·RDS 자격증명 회전과 Google 잔존 키
  제거를 완료했다. 현재 크론은 각 실행 때 `/run/adventure-rpg/production.env`를
  읽으므로 crontab에 비밀값을 중복하지 않는다.
- 전환 안정화 확인 뒤 옛 Vercel 프로젝트를 삭제했다.
- 운영 DB는 EC2와 같은 서울 리전의 RDS로 이전했다. 일일 로컬 백업·S3 90일
  보관과 RDS 7일 PITR을 구성하고 실제 복구를 검증했다.
- EC2 AMI 스냅샷은 인스턴스 전체 복구 시간을 더 줄이고 싶을 때 추가하는 선택
  작업이다. 애플리케이션과 DB 복구의 선행 조건은 아니다.
