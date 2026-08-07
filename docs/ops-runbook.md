# 운영 런북 (msmsge.com)

이 게임을 **운영(배포·DB·장애대응)** 할 때 보는 단일 문서. 2026-06-27 베타 준비 중 실제 인프라를 확인해 정리했다.

> 🔒 **비밀값은 여기 두지 않는다** — 위치만 가리킨다. (DB 비밀번호·OAuth 키·`CRON_SECRET` = AWS SSM SecureString, SSH 키 = 로컬 `.pem`.)
> 🔁 사실이 바뀌면(서버 이전·리전 변경 등) 이 문서를 먼저 고친다.

---

## 1. 인프라 토폴로지

| 구성 | 값 |
|---|---|
| **호스트** | AWS EC2 · 퍼블릭 `54.180.28.29` (= `msmsge.com`) · 내부 `ip-172-31-48-56` · 리전 **ap-northeast-2(서울)** |
| **앱** | `~/adventure-rpg` · systemd 서비스 **`adventure-rpg`** · Next.js, 내부 포트 **3000** |
| **리버스 프록시** | **nginx** (80/443 → 3000). 포트 3000은 외부 미개방(보안그룹) |
| **TLS** | Let's Encrypt(certbot) · `certbot-renew.timer` 활성 = **자동갱신**(2026-06-27 dry-run 검증 OK) · 도메인 `msmsge.com`·`www`·`arena.`·`test.` |
| **DB** | **AWS RDS PostgreSQL 18.3** · `adventure-rpg-db.chicgseao1h2.ap-northeast-2.rds.amazonaws.com:5432` · DB명 **`test_adventurerpg`**(이름에 "test" 있지만 **이게 prod** — 옛 이름 잔재) |

⚠️ **prod DB는 Neon이 아니다.** 2026-05 중순 **Neon → RDS** 이전됨. 옛 Neon DB는 5-15에 동결된 좀비(쓰지 말 것). `.env.example`의 Neon URL도 stale. 이전 경위 = `docs/aws-ec2-migration.md`.

---

## 2. 접속

```bash
# EC2 SSH (키 = 로컬 ~/.ssh/msmsge-key.pem · GitHub 시크릿 EC2_SSH_KEY 와 동일 .pem)
ssh -i ~/.ssh/msmsge-key.pem ec2-user@54.180.28.29

# 키를 못 찾을 때 → AWS 콘솔 EC2 → 인스턴스 → Connect → EC2 Instance Connect(브라우저, 키 불필요)

# DB 접속 (EC2 안에서 — prod URL은 거기에만 있음)
cd ~/adventure-rpg
ENV=/run/adventure-rpg/production.env
DBURL=$(grep "^DATABASE_URL=" "$ENV" | cut -d= -f2- | tr -d '"')
CA=$(grep "^DATABASE_CA_CERT_PATH=" "$ENV" | cut -d= -f2- | tr -d '"')
PGSSLMODE=verify-full PGSSLROOTCERT="$CA" psql "$DBURL"
```
EC2엔 `psql`·`pg_dump` **18.3**(RDS와 일치)·`aws` CLI·`node`가 있다. AWS 장기 키 대신 인스턴스 역할 `MsmsgeProdDbBackupEc2Role`을 사용하며 S3 백업과 특정 SSM 파라미터 읽기만 허용한다.

---

## 3. 배포

**배포 = `main`의 CI 통과 SHA를 수동 승인**. 흐름: GitHub Action `deploy.yml`이 정확한 SHA를 EC2에서 체크아웃 → 운영 환경 사전 검사 → **nginx 점검 ON** → 운영·스테이징 Next.js 런타임 정지 → `install-deps.sh` → systemd 메모리·스왑·CPU 한도 안에서 `npm run build` → `migrate.mjs`(대기 마이그 적용) → `sudo systemctl start adventure-rpg` → **내부 스모크**(`/api/health`+`/sign-in`+`deploy-smoke` 200 재시도 검증) → 스테이징 런타임 복구 → **점검 OFF** → **외부 공개 표면 스모크**(실제 도메인·TLS·nginx 경유, 배포 SHA·정책 문서·숨김 경로 검증). 빌드나 배포가 실패하면 남은 빌드 프로세스를 종료하고 이전 빌드로 운영 서비스를 복구하며, 복구 health가 실패할 때만 점검 화면을 유지한다.

> ✅ **배포 후 스모크**: 재시작 뒤 라이브를 찔러보고 200 이 아니면 **배포 Action 을 빨간불**로 만든다(빌드 성공 ≠ 앱 정상 — 마이그 0-테이블 같은 사고도 잡음). 빨간불 뜨면 → `rollback.sh` 로 되돌린다.

```bash
# 머지 (CI 필수체크 'check' 통과 후라야 머지됨 — 브랜치 보호)
gh pr merge <PR> --squash --delete-branch
# 배포 지켜보기
gh run watch $(gh run list --workflow=deploy.yml --limit 1 --json databaseId -q '.[0].databaseId') --exit-status
# 라이브 확인
curl -s https://msmsge.com/api/health   # {"ok":true,"db":"ok",...}
```

### nginx rate limit / scanner block
느슨한 비용 보호용 앞단 제한. 정상 플레이를 거의 막지 않는 값으로 시작한다:
`/api/` = 20r/s + burst 100, `/api/auth/` = burst 200, 페이지 = 60r/s + burst 180.
`/.env`, `/.git`, WordPress/PHP 관리자 스캔 경로는 nginx 에서 즉시 차단한다.

```bash
cd ~/adventure-rpg
bash deploy/apply-nginx-rate-limit.sh
```

스크립트는 `/etc/nginx/conf.d/msmsge.conf` 를 백업하고 기존 certbot/SSL 설정을 보존한 채
rate limit / scanner block과 `www.msmsge.com` → `https://msmsge.com` 301 리디렉션을 삽입한다.
`nginx -t` 실패 시 백업을 복구하고 중단한다.

### 롤백 (나쁜 배포 되돌리기)
나쁜 배포(크래시·깨진 페이지)가 나갔을 때. **직전 정상 커밋 = 마지막으로 성공한 배포 Action 의 커밋**(`gh run list --workflow=deploy.yml` / GitHub Actions 히스토리).

**A. 정석(깨끗·~2분)** — `main` 을 고쳐 되돌리는 배포를 낸다(force-push 금지):
```bash
git revert <나쁜커밋sha> && git push    # → 자동 재배포로 되돌림
```

**B. 긴급(사이트 지금 죽음·즉시)** — EC2 에서 직전 정상 커밋으로 로컬 롤백:
```bash
# EC2 에서
bash deploy/rollback.sh                 # 인자 없이 = 현재/최근 커밋 목록
bash deploy/rollback.sh <좋은sha>        # reset→install→build→restart→health
```
→ `rollback.sh` 가 배포와 동일 단계로 그 커밋을 띄운다. **끝나면 반드시 A(main revert)도** — 안 그러면 다음 배포의 `git reset --hard origin/main` 이 나쁜 코드를 다시 당겨온다.

> 롤백 스크립트도 점검 화면을 자동으로 켜고, 복구된 앱의 health 200 확인 뒤 해제한다. 중간 실패 시 화면을 유지한다.
> ⚠️ **마이그레이션 포함 배포**면 코드 롤백만으론 부족(마이그는 전진 전용). 롤백한 코드가 새 스키마와 안 맞으면 → **백업 복원**(§4) 또는 교정 마이그. 스키마-코드 정합을 먼저 확인.

---

## 4. DB 운영

### 백업
- **자동(일일)**: `deploy/backup-db.sh` 가 매일 **17:00 UTC(02:00 KST)** RDS → `~/backups/auto_*.sql.gz` (TLS 호스트 검증·gzip·14일 로테이션·무결성 검증). `BACKUP_S3_URI`가 있으면 S3에 SSE-S3 암호화 복제한다. crontab 등록은 `deploy/crontab.txt` 참고. 로그 `~/backups/backup.log`.
- **수동(작업 직전 임시)**:
```bash
cd ~/adventure-rpg && bash deploy/backup-db.sh         # 자동백업 스크립트 그대로(검증 포함)
# 또는 직접: pg_dump "$DBURL" --no-owner --no-acl -f ~/backups/backup_$(date +%F_%H%M%S).sql
```
- **S3 오프사이트(구성 완료)**: EC2 역할 `MsmsgeProdDbBackupEc2Role`이
  `s3://msmsge-prod-db-backups-983903215138-ap-northeast-2-an/adventure-rpg/`에만
  암호화 쓰기·복구 읽기 권한을 가진다. 2026-07-23 실제 업로드 객체를 다시 읽어
  gzip·pg_dump 완결 마커·SSE-S3(AES256)·버전 ID를 검증했다. 버킷 수명 주기는
  `adventure-rpg/`의 현재 버전과 이전 버전을 각각 90일 기준으로 만료한다.
- **RDS 관리형 복구(구성 완료)**: 자동 백업 보존기간 7일이며 PITR 최근 복원 가능
  시간이 정상 갱신되는 것을 2026-07-24 확인했다.

### RDS 인증서 검증

```bash
cd ~/adventure-rpg
bash deploy/install-rds-ca.sh
# AWS SSM /adventure-rpg/production/env
DATABASE_CA_CERT_PATH=/etc/pki/rds/global-bundle.pem
# ops-retention의 DB 70%/85% 저장 공간 경고 기준. RDS 할당 용량과 같은 GiB 값.
DB_STORAGE_LIMIT_GB=<RDS 할당 용량>
```

`DATABASE_URL`에는 `sslmode`나 `sslrootcert`를 붙이지 않는다. 앱·마이그레이션은 위 CA로 인증서와 호스트명을 검증하고, `backup-db.sh`는 `verify-full`로 동일하게 검증한다.

### 복구
```bash
gunzip -c ~/backups/<백업>.sql.gz | psql "$DBURL"       # gzip 자동백업
psql "$DBURL" < ~/backups/<백업>.sql                     # 평문 수동백업
```

### 복구 테스트 (정기 권장 — 백업은 복원돼야 백업)
prod 무접촉으로 임시 DB 에 복원해 검증한다. 2026-07-23 최신 자동백업 실증 결과:
public 테이블 65개·마이그레이션 122개·사용자/세이브 조회 정상, 임시 DB 정리 완료.
```bash
BK=$(ls -t ~/backups/*.sql* | head -1)
RESTORE_DB="restore_verify_$(date -u +%Y%m%d_%H%M%S)_$$"
R=$(node -e 'const u=new URL(process.argv[1]); u.pathname=`/${process.argv[2]}`; process.stdout.write(u.toString())' "$DBURL" "$RESTORE_DB")
createdb --maintenance-db="$DBURL" "$RESTORE_DB"
trap 'dropdb --if-exists --force --maintenance-db="$DBURL" "$RESTORE_DB"' EXIT
case "$BK" in *.gz) gunzip -c "$BK";; *) cat "$BK";; esac | psql "$R" -v ON_ERROR_STOP=1 -q
psql "$R" -tAc "select count(*) from information_schema.tables where table_schema='public';"  # 0보다 커야 함
psql "$R" -tAc "select count(*) from drizzle.__drizzle_migrations;"                              # 0보다 커야 함
psql "$R" -tAc "select count(*) from saves_kv;"
dropdb --force --maintenance-db="$DBURL" "$RESTORE_DB"   # 정리
trap - EXIT
```

### 전체 초기화 (클린 슬레이트)
🚨 **비가역. 반드시 백업 먼저.**

> 재오픈 때 인증 계정·쿠폰을 보존하는 작업에는 아래 `DROP SCHEMA`를
> 사용하지 않는다. 그 경우는 [재오픈 게임 데이터 초기화](./reopen-game-reset.md)를 따른다.

```bash
bash deploy/maintenance.sh on    # 1) 점검 ON — nginx 정적 페이지(앱을 멈춰도 유지)
psql "$DBURL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
  WHERE datname=current_database() AND pid<>pg_backend_pid();"   # 2) 앱 DB 커넥션 종료(DROP 락 경합 방지)
psql "$DBURL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
psql "$DBURL" -c 'DROP SCHEMA drizzle CASCADE;'           # 🔑 3) 필수! (아래 함정 참고)
node --env-file=/run/adventure-rpg/production.env src/db/migrate.mjs  # 4) 현재 마이그레이션 전체 재적용
bash deploy/maintenance.sh off   # 5) 앱 health 200 확인 후 점검 OFF
# 검증: public 테이블·drizzle migration 수가 모두 0보다 커야 한다.
# 2026-07-23 운영 기준은 public 67개, migration log 124개(새 마이그 추가 시 증가).
# (DROP 이 락에 막히면 sudo systemctl stop adventure-rpg 후 진행해도 nginx 점검 화면은 유지됨)
```

> 🔑 **함정(2026-06-27 실제 사고)**: `DROP SCHEMA public CASCADE` 는 public만 지운다. 마이그 추적 테이블 **`__drizzle_migrations` 는 별도 `drizzle` 스키마**라 살아남아 → 다음 `migrate.mjs` 가 "전부 적용됨"으로 보고 **테이블을 0개** 만든다(게임 다운). 반드시 **`DROP SCHEMA drizzle CASCADE` 도** 같이 한다.

> ⚠️ `pg_dump` 버전 ≥ 서버 버전이어야 한다(16으로 18 못 뜸). EC2 pg_dump = 18 이라 OK. 로컬 개발 박스는 16이라 prod 덤프 불가.

---

## 4b. 점검(maintenance) 모드
DB 작업·마이그·복구 등으로 잠시 막을 때. **nginx가 앱보다 앞에서 사용자 요청을 차단**하고 정적 "점검 중" 페이지를 직접 반환한다. 앱을 build/stop/restart해도 화면이 유지되며 `/api/health`만 앱으로 통과한다.
```bash
# EC2 에서
bash deploy/maintenance.sh on       # 점검 시작
bash deploy/maintenance.sh off      # 앱 health 200 확인 후 점검 종료
bash deploy/maintenance.sh status   # 현재 상태
```
- 토글 = `/etc/nginx/msmsge-maintenance.on` 플래그. 파일 존재 여부를 요청마다 확인하므로 nginx reload나 앱 재시작 없이 즉시 반영되고 배포의 `git reset`에도 영향받지 않는다.
- 화면 = `/var/www/msmsge/maintenance.html`. 원본은 `deploy/maintenance.html`이며 `maintenance.sh on`이 nginx 설정·화면을 먼저 동기화한다.
- 구현 = `deploy/nginx-maintenance-*.conf`. 사용자 라우트는 플래그 ON일 때 nginx가 503을 직접 반환하고, `/api/health`는 앱 준비 확인을 위해 통과한다.
- `off`는 로컬 `/api/health`가 200이 될 때까지 최대 60초 기다린다. 준비되지 않으면 실패하고 점검 플래그를 그대로 둔다.
- 앱을 직접 `stop`한 상태에서 `off`를 실행하면 nginx 화면 아래에서 서비스를 먼저 시작한 뒤 health를 확인한다.
- 예전 앱 레벨 `MAINTENANCE_MODE`는 SSM 운영 환경에 넣지 않는다. 점검은 nginx 플래그만 사용한다.

### 다음 점검 대기 작업

- [ ] **비공개 숙소 도안 회수** (2026-08-08 운영 DB 읽기 전용 사전 조사 완료)
  - 배포 변경에는 `LIFE_HOUSING_ENABLED=false`와 숙소 페이지·API의 404 차단이 포함되어야 한다.
  - 대상: `혈향` 1명, `fishing_trophy_wall`(낚시 기념 벽장식) 도안 1종.
  - 조사 당시 해당 가구의 제작·보유·숙소 배치는 모두 0건이다.
  - `life-workshop.v1.crafting.learnedHiddenRecipeIds`에서 해당 도안 ID만 제거한다.
  - 이미 수령한 `life_blueprint1` 업적과 `life_blueprint_collector` 칭호는 회수하지 않는다.
  - 기존 `life_blueprint` 피드 1건은 화면·전광판에서 숨기되 DB 기록은 보존한다.
  - 작업 직전 DB 백업과 동일 조건 재조사를 하고, 점검 모드 안에서 트랜잭션으로 처리한 뒤 제작·보유·배치 0건 및 도안 제거를 재확인한다.
  - 배포 후 `/character/room`, `/character/{name}/room`, `/api/v2/me/housing`, `/api/v2/player/{name}/housing`이 모두 404인지 확인한다.

## 5. 헬스 / 모니터링
- `https://msmsge.com/api/health` → `{ok, db:"ok", ms}` (DB 핑 포함, 실패 시 503). 인증 불필요.
- `/api/version` = 빌드 정보.
- 관리자 `운영 현황` 탭 → 제한 초과, 경제 이벤트, 보상 실패, 대량 골드 이동, 핫타임 설정, 매크로 의심 점수 확인.
- 운영 현황의 매크로 의심 userId/IP는 `이상 행동`·`경제 로그` 필터로 바로 연결된다.
- `OPS_ALERT_WEBHOOK_URL`을 설정하면 임계치 알림·일일 운영 리포트·크론 실패가 개인정보 없는 사건 코드와 집계값만 담아 webhook으로 발송된다. 미설정 상태에서도 배포와 모니터링은 계속되며, 경고는 GitHub Actions와 서버 journal에 기록된다.
- 운영 알림 연결 확인은 `운영 현황`의 `알림 테스트` 버튼으로 한다.
- GitHub Actions `External uptime monitor`가 5분마다 서버 밖에서 헬스·빌드 식별자,
  로그인·정책·검색 메타 경로, 보안 헤더, 개발 화면·코인 상점 차단까지 배포 후와
  동일한 공개 표면을 검사한다. 계획된 배포 중 점검 화면으로 인한 오탐을 줄이기 위해
  정기 실행에서만 최대 8회·20초 간격으로 재시도한다. 계속 실패하면 Action이 실패하고
  `OPS_ALERT_WEBHOOK_URL`에도 실패 경로를 알린다.
- EC2의 `adventure-resource-monitor.timer`는 2분마다 5분 load(코어 대비 90%),
  가용 메모리(15% 이하), 루트 디스크(85% 이상)를 확인한다. 상태 변화 시 즉시,
  같은 경보가 계속되면 30분마다 webhook으로 알린다.

```bash
systemctl list-timers adventure-resource-monitor.timer
sudo systemctl start adventure-resource-monitor.service
journalctl -u adventure-resource-monitor.service -n 50 --no-pager
```

---

## 6. 크론 (EC2 `crontab -l`, UTC)
정기 작업이 EC2 crontab으로 돈다(각 라우트가 `CRON_SECRET` Bearer 검사). 배포 성공 시 `deploy/crontab.txt`를 자동 설치하고 ops-retention·ops-daily-report 등록 여부와 `crond` 상태를 확인한다. 종류:
- **매분**: 협동 보스 리스폰
- **4시간마다**: 종료된 복권·아레나 베팅 잔액 환불 확인(잔액이 없으면 no-op)
- **매시 00분**: NPC 공격
- **매시 05분**: 거래소 만료 매물 정리
- **일일 04:00 UTC**: 채팅 · 길드 정리
- **일일 04:20 UTC**: ops-retention(로그 보관 정책 적용·길드/거래소 압축 집계·DB 용량 측정·실패한 외부 파일 삭제 재처리)
- **일일 04:25 UTC**: ops-daily-report(최근 24시간 운영 지표 webhook 리포트)
- **일일 17:00 UTC**: DB 백업(선택적으로 `BACKUP_S3_URI`에도 암호화 업로드)
- **토요일 15:00 UTC**: PvP 토너먼트
- **일요일 15:0x UTC**: 탑 주간 초기화 · PvP 시즌 전환 · PvP/낚시 시즌 보상
- TLS: `certbot-renew.timer`(systemd, 하루 2회)

각 작업은 `deploy/run-cron.sh`를 통해 실행되며, HTTP 오류·타임아웃 시 `OPS_ALERT_WEBHOOK_URL`로 즉시 알린다. 점검: `ssh … 'crontab -l'`, 로그 `journalctl`.

---

## 7. 시크릿 · 설정 위치
| 항목 | 위치 |
|---|---|
| `DATABASE_URL`, OAuth(Kakao), CAPTCHA, R2, `CRON_SECRET` 등 | SSM SecureString `/adventure-rpg/production/env` |
| 실행 중 복호화 캐시 | EC2 `/run/adventure-rpg/production.env` · 디렉터리 `700`, 파일 `600`, 재부팅 시 소멸 |
| `BACKUP_S3_URI` | 위 SSM 파라미터 · 값은 S3 `adventure-rpg/` prefix |
| SSM 읽기·S3 백업 권한 | EC2 IAM 역할 `MsmsgeProdDbBackupEc2Role` · 장기 액세스 키 없음 · 특정 리소스만 허용 |
| 배포 SSH | GitHub 시크릿 `EC2_HOST` · `EC2_SSH_KEY` |
| SSH 키 .pem | 로컬 `~/.ssh/msmsge-key.pem` |
| 빌드타임 플래그 | tracked `.env.production` (예: `NEXT_PUBLIC_*` 운영 플래그) |

구조와 변경 절차는 `docs/production-secrets.md`를 따른다.

관리자 권한:
- `ADMIN_EMAILS`: 최고 관리자. 모든 관리자 작업 가능.
- `OPS_READONLY_EMAILS`: 관리자 조회만 가능.
- `OPS_REWARD_EMAILS`: 보상 보정 지급 가능.
- `OPS_SANCTION_EMAILS`: 제재 변경 가능.

장시간 생활 콘텐츠 사람 확인:
- Cloudflare Turnstile 위젯에 `msmsge.com`을 등록하고 `TURNSTILE_SITE_KEY`,
  `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAMES=msmsge.com,www.msmsge.com`을
  SSM 운영 환경 파라미터에 설정한다. 세 값 중 하나라도 비어 있으면 배포 사전 검사가 실패한다.
- 키를 설정하면 낚시·벌목·채광이 적응형 완료 횟수 또는 연속 60분에
  도달했을 때 다음 변경 요청에서 사람 확인을 요구한다. 토큰은 서버 Siteverify에서
  action과 hostname 일치를 검증한 뒤 즉시 소비한다.
- 강한 자동화 의심 신호에는 hCaptcha를 2단계로 붙일 수 있다. hCaptcha 대시보드에서
  운영 호스트를 등록한 별도 sitekey를 만들고 필요하면 `Always Challenge` 난이도를
  사용한다. GitHub 시크릿 `HCAPTCHA_SITE_KEY`,
  `HCAPTCHA_SECRET_KEY`를 함께 설정한다. 필요하면
  `HCAPTCHA_EXPECTED_HOSTNAMES`를 EC2 env에 별도로 두며, 생략하면 Turnstile 호스트
  목록을 재사용한다. 키가 없으면 기존 Turnstile 단독 확인으로 안전하게 폴백한다.
- 농장은 활동 위험도·사람 확인에서 제외한다. 요청 폭주를 막는 일반 429 제한만
  적용하며, 미리 수확을 눌러도 위험 점수나 강신호가 기록되지 않는다.

인증: **카카오 OAuth만**(구글은 베타 동안 제외 #1216). NextAuth/Auth.js + Drizzle 어댑터.

---

## 8. 알려진 함정 / 사고 이력
- **초기화 시 `drizzle` 스키마**: 위 §4 참고 — 반드시 같이 드롭.
- **pg_dump 버전**: ≥ 서버. 16<18.
- **옛 Neon URL**: stale 좀비. 진짜 prod = RDS.
- **main 머지 = 즉시 운영**: 스테이징 없음. CI(`check`) 통과는 런타임 정상을 보장 안 함 → 배포 후 `/api/health` 확인 습관.
- **점검 모드**: ✅ nginx 레벨 구현 — `deploy/maintenance.sh on|off` (§4b). 앱 완전 stop/build/restart 중에도 정적 503 화면 유지.

## 8b. 운영 문의 빠른 확인

### 보상이 안 들어왔다는 문의
1. 관리자 `유저` 탭에서 대상 유저 선택.
2. `운영 요약`에서 현재 재화, 최근 보상 수령, 숙련/증서 이벤트 확인.
3. `경제 로그`에서 `userId` 필터로 `reward.*`와 `reward.failure.*` 확인.
4. 낚시 코인은 `오늘 챔질 코인` 상한 도달 시 추가 챔질 코인이 미지급된다. 레벨업 보상은 별도 로그(`reward.fishing.level`)로 확인.
5. 운영 현황의 `보상 실패 보정 후보`에서 원본 event id를 확인한 뒤 보정 지급에 남긴다.

### 매크로/부하 의심
0. Turnstile 상태를 먼저 확인한다. 배포 스모크의 `turnstileConfigured: true`가
   아니면 활동 체크포인트가 강제되지 않는다. 2단계 CAPTCHA를 운영할 때는
   `hcaptchaConfigured: true`도 함께 확인한다.
1. `운영 현황` 알림 카드에서 요청 제한 급증 여부 확인.
2. `이상 행동` 탭에서 action/IP/userId/reason 필터 적용.
3. 동일 IP 다계정 반복이면 IP 제한 또는 제재 검토. 단일 유저 반복이면 유저 제재 또는 API limit/window 조정 검토.
4. 차단 중인 유저는 제재 패널에서 1일/3일 연장 또는 해제를 처리한다.
5. 정상 유저가 반복적으로 걸리면 해당 콘텐츠의 정상 클릭 속도를 다시 측정하고 제한값을 조정.

자동 방어 기준(낚시·벌목·채광):
- 다음 사람 확인은 정상 80~140회, 관찰 50~80회, 고위험 25~50회,
  임계 10~25회 사이에서 무작위로 잡힌다.
- 벌목·채광 조기 완료는 10분 안에 3회 반복됐을 때만 강신호 한 건으로 승격한다.
  낚시는 입질보다 300ms 이상 빠른 입력이 최근 30회 중 5회일 때 선입력 강신호로
  보며, 입질 후 60ms 미만 반응은 인간 불가능 반응으로 유지한다.
- 승격된 강신호는 공통 위험도 +18. 고위험은 30초, 임계 위험은 2분 대기 후
  Turnstile을 요구하며, hCaptcha가 설정된 경우 추가 CAPTCHA도 통과해야 한다.
- 하루 전체 생활 완료량만으로 보상이나 다음 행동 시간을 감쇠하지 않는다.
  정상 고활동 이용자는 사람 확인 주기만 짧아지며, 서버 시계로 확인된 조기 완료·
  인간 불가능 반응 같은 강신호가 있을 때만 30초~2분 대기를 적용한다.
- 10분 내 동일 IP에서 6번째 계정이 생활 API를 쓰면 429로 제한하고
  이상 행동 이벤트를 남긴다.
- nginx는 생활 API 전체를 IP당 5r/s, burst 30으로 제한한다.
- 경기장·그리드 던전·오프라인 정산·전초기지 공격·대련은 앱의 사용자/IP 제한에
  더해 nginx에서 IP당 3r/s, burst 10, 동시 8개로 제한한다. 전체 연결도 IP당
  30개를 넘기지 않는다.
- 오프라인 정산은 요청 한 번에 최대 50전만 처리하고, 클라이언트가 남은 분량을
  순차 요청한다. 한 요청이 수백~수천 전투를 한 트랜잭션에서 처리하지 않는다.

### 배포 후 점검
1. GitHub Actions `CI`와 `Deploy to EC2` 성공 확인.
2. `curl -fsS https://msmsge.com/api/health` 와 `/api/version` 확인.
3. 배포 Action 의 `deploy-smoke 200` 로그 확인. 낚시 상태, 사냥, 길드 훈련장, 관리자 ops API 모듈 로드도 같이 점검된다.
4. `Verify public release surface` 성공 확인. `/api/version`이 배포 SHA와 일치하고 정책·로그인·검색 메타 경로는 200, `/dev`와 코인 상점 화면·API 및 개발 API는 404여야 한다.
5. 관리자 `운영 현황`에서 webhook 설정, 알림 카드, 최근 경제 이벤트가 비정상적으로 튀지 않는지 확인.

---

## 9. 운영 성숙도 — 남은 TODO
- [x] **자동 백업 + 복구 테스트** — `deploy/backup-db.sh`(일일·14일 로테) + 임시 DB 복구 + S3 90일 오프사이트 업로드/읽기 + RDS 7일 PITR 검증 완료
- [x] 외부 업타임 + EC2 자원 모니터 — GitHub Actions 5분 외부 확인, systemd 2분 자원 확인, webhook 알림
- [x] 배포 후 자동 스모크 — health·sign-in·핵심 모듈 로드·운영 cron 인증 확인
- [x] 점검(maintenance) 모드 — `deploy/maintenance.sh` (§4b)
- [ ] CDN/WAF — Pro 정액제 CloudFront, apex/www DNS 전환, Nginx 실제 IP 복원·
  원본 헤더 보호까지 적용됨. CloudFront/WAF 로그는 민감 필드 제외·90일 보존으로
  구성됨. WAF 관리형 3개·rate 2개 규칙은 Count 관찰 중이며, 24~48시간 오탐·로그
  확인 후 Block 승격 필요. 절차와 롤백은
  `docs/cdn-waf-rollout.md` 참고
- [x] 시크릿을 SSM Parameter Store SecureString으로 이전 — EC2 역할은 단일 파라미터 읽기만 허용하고 `/run`에만 복호화
- [x] 노출 가능성이 기록된 자격증명 로테이션 — `AUTH_SECRET`·`CRON_SECRET`·
  `AUTH_KAKAO_SECRET`·RDS 비밀번호 교체, 사용하지 않는 Google 자격증명 제거,
  공급자 콘솔의 이전 값 폐기와 SSM 반영 완료. 값은 기록하지 않고
  `docs/credential-rotation.md`에 일자와 절차만 유지한다.
