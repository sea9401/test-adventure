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

> 롤백 스크립트도 점검 화면을 자동으로 켜고, 복구된 앱의 health 200을 확인한 뒤에도 유지한다. 운영자가 결과를 확인하고 별도로 승인한 경우에만 `bash deploy/maintenance.sh off`를 실행한다.
> ⚠️ **마이그레이션 포함 배포**면 코드 롤백만으론 부족(마이그는 전진 전용). 롤백한 코드가 새 스키마와 안 맞으면 → **백업 복원**(§4) 또는 교정 마이그. 스키마-코드 정합을 먼저 확인.

### 파괴적 마이그레이션 규칙

- `0164_ambiguous_barracuda` 이후 새 마이그레이션의 `DROP TABLE`, `DROP COLUMN`,
  `TRUNCATE`는 CI가 기본 차단한다.
- expand-contract 전환과 데이터 이관이 끝나 실제 삭제가 필요하면 SQL 첫 부분에
  `-- ops: allow-destructive reason=<12자 이상 구체적 사유>`를 남긴다. 이 표시는 자동
  면제가 아니라 리뷰어가 파괴 작업을 식별하는 승인 표식이다.
- 해당 배포 전에는 최신 자동백업의 성공·S3 복제 여부를 확인하고, 필요하면
  `bash deploy/run-backup.sh`로 새 백업을 만든다. 복구 방법과 롤백 코드의 새 스키마
  호환성까지 확인한 뒤 배포한다.
- 로컬과 CI에서 `npm run check-migrations`로 journal 순서, SQL 파일 대응, 파괴 SQL
  승인 사유를 한 번에 검사한다.

---

## 4. DB 운영

### 백업
- **자동(일일)**: `deploy/run-backup.sh`가 매일 **17:00 UTC(02:00 KST)** `deploy/backup-db.sh`를 실행해 RDS → `~/backups/auto_*.sql.gz`로 백업한다(TLS 호스트 검증·gzip·14일 로테이션·무결성 검증). `BACKUP_S3_URI`가 있으면 S3에 SSE-S3 암호화 복제한다. 실패하면 원래 종료 코드를 유지하면서 운영 webhook으로 알리고, 성공·실패 로그는 모두 `~/backups/backup.log`에 남긴다. crontab 등록은 `deploy/crontab.txt` 참고.
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

수동 검증은 다음 한 줄로 실행한다. 최신 `auto_*.sql(.gz)`를 임시 DB에 복원하고
public 테이블, `users`, Drizzle 마이그레이션 테이블을 검사한 뒤 성공·실패와 무관하게
임시 DB를 제거한다.

```bash
cd ~/adventure-rpg
bash deploy/verify-backup-restore.sh
```

주 1회 자동 실행용 `adventure-backup-restore-test.service/.timer`도 저장소에 있지만
**배포만으로 설치·활성화되지 않는다.** RDS 부하·DB 생성 권한·실행 시간을 확인하고 운영
승인을 받은 뒤에만 다음처럼 설치한다.

```bash
sudo cp deploy/adventure-backup-restore-test.service /etc/systemd/system/
sudo cp deploy/adventure-backup-restore-test.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now adventure-backup-restore-test.timer
systemctl list-timers adventure-backup-restore-test.timer
```

실패는 `~/backups/restore-test.log`와 운영 webhook에 남는다. 원리를 직접 확인해야 할 때의
수동 절차는 다음과 같다.

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

### 최근 점검 완료 작업

- [x] **비공개 숙소 도안 회수** (2026-08-08 완료)
  - `LIFE_HOUSING_ENABLED=false`와 Proxy 이중 게이트로 숙소 페이지·API를 실제 HTTP 404로 차단했다.
  - 대상: `혈향` 1명, `fishing_trophy_wall`(낚시 기념 벽장식) 도안 1종.
  - 조사 당시 해당 가구의 제작·보유·숙소 배치는 모두 0건이다.
  - `life-workshop.v1.crafting.learnedHiddenRecipeIds`에서 해당 도안 ID만 제거한다.
  - 이미 수령한 `life_blueprint1` 업적과 `life_blueprint_collector` 칭호는 회수하지 않는다.
  - 기존 `life_blueprint` 피드 1건은 화면·전광판에서 숨기되 DB 기록은 보존한다.
  - 작업 직전 DB 백업과 동일 조건 재조사 후 점검 모드 안에서 트랜잭션으로 회수했으며, 제작·보유·배치 0건과 도안 제거를 재확인했다.
  - `life_blueprint1` 업적과 `life_blueprint_collector` 칭호 보존을 재확인했다.
  - `/character/room`, `/character/{name}/room`, `/api/v2/me/housing`, `/api/v2/player/{name}/housing`은 공개 표면 검사에서 모두 실제 HTTP 404를 요구한다.

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
  가용 메모리(15% 이하), 루트 디스크(85% 이상)를 확인한다. 같은 실행에서
  `deploy/ops-heartbeats.json`에 정의된 중요 cron과 DB 백업의 마지막 성공 시각도
  검사한다.
- `adventure-rds-memory-monitor.timer`는 별도 5분 주기로 RDS `FreeableMemory`를
  확인한다. 기본 192 MiB 미만, CloudWatch 조회 실패·데이터 누락, 정상화 상태를
  journal과 webhook에 기록하며 지속되는 경보는 30분마다 다시 알린다. RDS 지표 조회에는
  EC2 역할의 `cloudwatch:GetMetricStatistics` 권한이 필요하다.
- heartbeat는 성공한 작업만 `/var/lib/adventure-resource-monitor/heartbeats` 아래에
  기록하므로 `crond` 자체가 멈춘 경우에도 독립된 systemd 경로에서 감지한다.

### 기능별 런타임 프로파일러

운영 Node 프로세스는 기본적으로 1분마다 `[runtime-profiler]` 구조화 로그를 남긴다.
DB에 원시 요청을 저장하지 않으며 URL·query string·IP·userId·요청 본문도 수집하지
않는다. 최근 60개 완료 구간과 현재 구간은 관리자 전용
`GET /api/admin/runtime-profiler`에서 조회할 수 있다.

```bash
# 최근 기능별 집계
journalctl -u adventure-rpg --since "30 minutes ago" --no-pager \
  | grep -F '[runtime-profiler]'

# 필요할 때만 SSM 운영 환경에 추가. 기본값은 production 활성/60초다.
RUNTIME_PROFILER_ENABLED=0
RUNTIME_PROFILER_INTERVAL_MS=60000
```

- `features.*.requests/errors/durationMs`: 기능별 요청량, 5xx/중단 수, 지연 분포.
- `features.*.database`: 해당 기능 요청에서 실행한 쿼리 수와 처리 시간.
- `operations.*`: query string과 동적 ID를 제거한 안전한 작업명별 동일 집계. 전투·저장·생활은
  `POST /api/v2/dungeon/hunt`, `GET /api/v2/coop/:sessionId`처럼 라우트 단위로
  요청·바이트·DB 쿼리를 비교한다. 예를 들어 생활 부하는 `POST /api/v2/farm/harvest`와
  `POST /api/v2/fishing/reel`로 분리된다. 허용 목록 밖 경로는 `combat:other`나 `POST life`
  등 기능명으로만
  남아 원본 경로나 사용자 입력이 기록되지 않는다.
- `runtime.cpuPercent/eventLoopDelayMs`: Node 연산 또는 이벤트 루프 포화 판단 기준.
- `runtime.databasePool.waiting`: DB 커넥션 풀 대기 요청 수. 여러 기능에서 동시에
  상승하면 DB 포화나 풀 고착을 우선 확인한다.
- `responseBytes`는 nginx 앞의 Node 소켓 `bytesWritten` 차이이므로 네트워크 크기의
  근삿값이다. 정확한 전송량·압축률 확인에는 nginx access log를 함께 본다.
- `slowRequests`에는 기능명·정규화 작업명·HTTP method·상태·시간/바이트/DB 합계만
  들어가며 원본 경로와 사용자 식별자는 없다.

판단 예: `combat` 지연과 DB 시간이 같이 상승하면 전투 DB/락을, DB 시간은 낮지만
CPU·event loop 지연이 상승하면 전투 연산을 본다. `chat` 요청 수와 바이트가 대부분이면
폴링 주기·응답 페이로드·캐시를 먼저 확인한다.

DB 지연은 다음 순서로 판단한다.

1. `operations.*.database.queries / requests`로 요청당 쿼리 수가 큰 라우트를 찾는다.
2. 같은 라우트의 DB 처리 시간과 전체 요청 시간을 비교해 DB 왕복 비중을 확인한다.
3. `runtime.databasePool.waiting`이 함께 상승할 때만 풀 대기를 의심한다. waiting 없이
   쿼리 수만 많으면 쿼리 배치·중복 조회 제거를 먼저 한다.
4. 여러 라우트의 DB 시간과 RDS CPU·I/O 지연이 함께 포화될 때 인덱스·실행 계획과
   인스턴스 용량을 조사한다. 작은 RDS에서 근거 없이 풀 크기부터 올리면 커넥션 메모리와
   동시 쿼리 경합이 늘 수 있다.

`pg_stat_statements` 활성화나 RDS Performance/Database Insights 변경은 이 프로파일러보다
상세한 SQL별 분석이 필요할 때 수행한다. 파라미터 그룹 재부팅 또는 과금·보존기간 변경이
수반될 수 있으므로 운영 승인 없이 적용하지 않는다. 승인 후에는 변경 전 파라미터 그룹,
예상 재부팅 여부, 비용과 롤백 절차를 기록하고 점검 시간에 적용한다.

```bash
systemctl list-timers \
  adventure-resource-monitor.timer \
  adventure-rds-memory-monitor.timer
sudo systemctl start adventure-resource-monitor.service
journalctl -u adventure-resource-monitor.service -n 50 --no-pager

# 최초 1회: EC2 역할에 RDS CloudWatch 지표 읽기 권한 추가(관리자 AWS CLI/CloudShell)
aws iam put-role-policy \
  --role-name MsmsgeProdDbBackupEc2Role \
  --policy-name AdventureRdsMetricsRead \
  --policy-document file://infra/iam/adventure-rds-metrics-policy.json

# RDS 재시작·장애조치 이벤트 확인(입력 시각은 UTC)
aws rds describe-events \
  --region ap-northeast-2 \
  --source-type db-instance \
  --source-identifier adventure-rpg-db \
  --start-time 2026-08-20T14:40:00Z \
  --end-time 2026-08-20T15:15:00Z \
  --query 'Events[].{Date:Date,Message:Message}' \
  --output table

# 현재 DB 클래스·Multi-AZ·유지보수 창 확인
aws rds describe-db-instances \
  --region ap-northeast-2 \
  --db-instance-identifier adventure-rpg-db \
  --query 'DBInstances[0].{Class:DBInstanceClass,MultiAZ:MultiAZ,Maintenance:PreferredMaintenanceWindow,Status:DBInstanceStatus}' \
  --output table

# 수동 검증: journal에 RDS MEMORY OK/WARN과 현재 MiB가 출력돼야 한다.
sudo systemctl start adventure-rds-memory-monitor.service
journalctl -u adventure-rds-memory-monitor.service -n 30 --no-pager
```

운영 배포는 `deploy/configure-log-retention.sh`로 journald drop-in을 설치해
persistent journal을 최대 512MB·최대 14일로 제한하고 루트 볼륨에 최소 3GB를
남긴다. 적용 상태와 현재 사용량은 다음처럼 확인한다.

```bash
systemd-analyze cat-config systemd/journald.conf
journalctl --disk-usage
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

각 작업은 `deploy/run-cron.sh`를 통해 실행되며, HTTP 오류·타임아웃 시
`OPS_ALERT_WEBHOOK_URL`로 즉시 알린다. 성공 시 작업별 heartbeat를 갱신하며 실패 시에는
갱신하지 않는다. 점검: `ssh … 'crontab -l'`, 로그 `journalctl`, heartbeat 상태는
`sudo systemctl start adventure-resource-monitor.service` 실행 결과로 확인한다.

## 6b. 운영 인프라 코드

`infra/operations/template.yaml`은 기존 EC2·RDS를 변경하지 않고 SNS 알림 토픽과 EC2
상태/CPU, RDS CPU/가용 메모리/가용 저장 공간 CloudWatch 경보를 만든다. 선택적으로
CloudWatch Synthetics가 `https://msmsge.com/api/health`를 5분마다 AWS에서 호출해 HTTP 200과
`ok=true`, `db=ok`를 함께 검증한다. 이 검사는 GitHub Actions 업타임 검사와 실행 주체가
달라 한쪽 장애를 다른 쪽이 보완한다.

외부 canary는 S3 결과 저장, Lambda 실행과 Synthetics 실행 비용이 생기므로
`EnableExternalHealthCanary` 기본값은 `false`다. 활성화하면 결과 버킷은 공개 접근을 모두
차단하고 서버 측 암호화를 사용하며, 산출물은 14일 뒤 만료된다. 버킷은 스택 삭제 시에도
증거 보존을 위해 남으므로 최종 폐기는 별도 확인 후 수행한다. 실제 리소스 ID, 알림 이메일과
비용 승인이 필요하므로 자동 배포하지 않는다. 적용 전에는 다음으로 검증한다.

```bash
uvx cfn-lint infra/operations/template.yaml
```

적용할 때는 변경 세트로 생성 리소스를 먼저 확인하고 이메일 구독 확인까지 마친다. 사건 등급,
역할, 복구 완료 조건은 [장애 대응 절차](./incident-response.md), 목표 수치는
[서비스 목표](./service-level-objectives.md), 변경 전후 확인은
[운영 변경 체크리스트](./templates/operations-change-checklist.md)를 따른다.

2026-08-13에는 `adventure-rpg-production-operations` 스택을 외부 canary 없이 적용했다.
EC2 상태/CPU와 RDS CPU/가용 메모리/가용 저장 공간 경보 5개가 SNS
`adventure-rpg-production-operations` 토픽으로 장애와 복구를 알린다. 이메일 endpoint는
AWS 구독 확인 링크를 승인한 뒤 `PendingConfirmation`이 아닌 구독 ARN으로 표시되는지
확인하고 테스트 메시지 수신까지 검증한다. `sea9401@gmail.com` 구독은 2026-08-13에
활성 ARN 전환과 테스트 메시지 수신을 확인했다.

2026-08-21 01:12~01:14 KST에는 `adventure-rpg-db`의 20 GiB 스토리지만 gp2에서
gp3로 즉시 전환했다. 클래스(`db.t4g.micro`), Single-AZ, 최대 자동 확장 100 GiB,
백업·암호화·삭제 보호 설정은 변경하지 않았다. 적용 결과는 gp3 기본 성능
3,000 IOPS/125 MiB/s, 미결 변경 없음, `storage-optimization`이었고 내부·외부 health와
DB 응답은 정상이었다. 변경 구간의 애플리케이션 DB 연결 오류는 0건, CloudWatch 최신값은
읽기 1.06 ms·쓰기 0.67 ms·디스크 큐 0.017이었다. 이 변경은 앱 배포를 동반하지 않았다.

스택 생성 직후 RDS 가용 메모리와 저장 공간 경보가 실제로 발생했다. 같은 날 확인한
`FreeableMemory`는 약 86–160 MB, `FreeStorageSpace`는 약 6 GB였고, 후자는 7일 전 약
18 GB에서 감소한 값이다. 원인은 약 10.9 GB의 `battle_replays` 물리 파일이었다. 운영 SHA
`c3ca0ac9`의 매분 보존 정리는 만료 행을 수십 건 수준으로 유지하고 autovacuum도 동작한다.
다만 일반 vacuum은 삭제 공간을 테이블 내부에서 재사용할 뿐 RDS 볼륨에 즉시 반환하지
않으므로 경보를 임의로 끄지 말고 추세를 관찰한다. 다시 감소하면 테이블 증가 원인을 먼저
확인하고, 스토리지 증설이나 테이블 재작성은 비용·잠금·추가 여유 공간을 검토해 별도 승인한다.

2026-08-13 확인 기준 운영 EC2 `i-093253c4b87d0164a`의
`MsmsgeProdDbBackupEc2Role`은 `rds:DescribeDBInstances`와
`cloudformation:DescribeStacks`도 허용하지 않는 런타임 최소 권한 역할이다. 이 역할에 관리
권한을 덧붙여 스택이나 RDS를 변경하지 않는다. 별도 AWS 관리자/배포 역할로 현재 RDS 설정과
기존 스택을 읽고 변경 세트를 검토한 뒤 적용한다.

2026-08-13 AWS 관리형 `AmazonSSMManagedInstanceCore`를 기존 EC2 역할에 연결하고
에이전트를 재시작했다. 인스턴스 `i-093253c4b87d0164a`는 Systems Manager managed node
`Online`으로 확인됐고 읽기 전용 Run Command도 성공했다. 이후에도 프로세스 `active`만 보지
말고 Fleet Manager/`describe-instance-information`의 `Online` 상태와 실제 명령 결과까지
확인한다. 재점검과 복구에는 다음 도구를 사용한다.

```bash
bash infra/operations/enable-ssm-managed-instance.sh check
bash infra/operations/enable-ssm-managed-instance.sh apply
```

도구는 AWS 관리형 `AmazonSSMManagedInstanceCore`를 기존 EC2 역할에 붙이는 작업만 하며,
RDS·CloudFormation 관리 권한은 추가하지 않는다. SSM 전환 전까지 현재 SSH 배포와 로컬
break-glass 키를 제거하지 않는다.

GitHub Actions용 `MsmsgeGitHubProductionSsmRole`은 OIDC subject를
`repo:sea9401/test-adventure:environment:msmsge.com`으로 제한하고 운영 인스턴스에 대한
SSM 명령 전송/상태 조회만 허용한다. 환경 변수 `AWS_PRODUCTION_ROLE_ARN`에 역할 ARN을
등록했다. workflow 전환, 아티팩트 전달, 롤백 검증과 두 차례 성공 배포 전에는 기존 SSH
시크릿을 제거하지 않는다.

같은 날 GitHub `msmsge.com` 환경은 custom deployment branch policy를 켜고 `main` 브랜치
하나만 허용하도록 적용했다. 저장소의 `main-ci-gate` ruleset과 배포 workflow의 정확한 SHA
검증을 함께 유지한다.

RDS 보호 상태는 관리자 자격으로 다음 도구를 먼저 `check`한다. 출력에는 자격증명이나
endpoint를 포함하지 않고 Multi-AZ, 삭제 보호, 백업 보존, 암호화, 공개 접근, 성능/향상된
모니터링, 스토리지 자동 확장, 유지보수 창과 pending modification만 표시한다.

```bash
bash infra/operations/harden-rds.sh check
bash infra/operations/harden-rds.sh apply-safe
```

`apply-safe`는 DB가 `available`이고 pending modification이 비어 있을 때만 삭제 보호와 최소
7일 자동 백업 보존을 `--no-apply-immediately`로 제출한다. Multi-AZ, 인스턴스 클래스,
스토리지와 성능 모니터링은 바꾸지 않는다. Multi-AZ는 별도 비용 검토와 일정 승인을 거친다.

---

## 7. 시크릿 · 설정 위치
| 항목 | 위치 |
|---|---|
| `DATABASE_URL`, OAuth(Kakao), CAPTCHA, R2, `CRON_SECRET` 등 | SSM SecureString `/adventure-rpg/production/env` |
| 실행 중 복호화 캐시 | EC2 `/run/adventure-rpg/production.env` · 디렉터리 `700`, 파일 `600`, 재부팅 시 소멸 |
| `BACKUP_S3_URI` | 위 SSM 파라미터 · 값은 S3 `adventure-rpg/` prefix |
| SSM 읽기·S3 백업 권한 | EC2 IAM 역할 `MsmsgeProdDbBackupEc2Role` · 장기 액세스 키 없음 · 특정 리소스만 허용 |
| 배포 SSH | GitHub 저장소 시크릿 `EC2_HOST` · `EC2_SSH_KEY` (OIDC/SSM 전환 완료 전까지 유지) |
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
