# 운영 런북 (msmsge.com)

이 게임을 **운영(배포·DB·장애대응)** 할 때 보는 단일 문서. 2026-06-27 베타 준비 중 실제 인프라를 확인해 정리했다.

> 🔒 **비밀값은 여기 두지 않는다** — 위치만 가리킨다. (DB 비밀번호·OAuth 키 = EC2 `.env.production.local`, SSH 키 = 로컬 `.pem`, CRON_SECRET = EC2 crontab.)
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
DBURL=$(grep "^DATABASE_URL=" .env.production.local | cut -d= -f2- | tr -d '"')
psql "$DBURL"
```
EC2엔 `psql`·`pg_dump` **18.3**(RDS와 일치)·`aws` CLI·`node` 있음. 단 **aws CLI 자격증명 없음**(IAM 역할/키 미부착) → AWS 리소스 조작은 콘솔 또는 역할 부착 후.

---

## 3. 배포

**배포 = `main` 에 머지** (push:main → 자동). 흐름: GitHub Action `deploy.yml`(appleboy/ssh-action, 시크릿 `EC2_HOST`/`EC2_SSH_KEY`) → EC2에서 `git reset --hard origin/main` → `install-deps.sh` → `migrate.mjs`(대기 마이그 적용) → `npm run build` → `sudo systemctl restart adventure-rpg` → **스모크**(`/api/health`+`/sign-in`+`deploy-smoke` 200 재시도 검증).

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
rate limit / scanner block 만 삽입한다. `nginx -t` 실패 시 백업을 복구하고 중단한다.

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

> 💡 롤백 동안 유저에게 점검 페이지: 먼저 `bash deploy/maintenance.sh on` → 롤백 → `off`.
> ⚠️ **마이그레이션 포함 배포**면 코드 롤백만으론 부족(마이그는 전진 전용). 롤백한 코드가 새 스키마와 안 맞으면 → **백업 복원**(§4) 또는 교정 마이그. 스키마-코드 정합을 먼저 확인.

---

## 4. DB 운영

### 백업
- **자동(일일)**: `deploy/backup-db.sh` 가 매일 **17:00 UTC(02:00 KST)** RDS → `~/backups/auto_*.sql.gz` (gzip·14일 로테이션·무결성 검증). crontab 등록은 `deploy/crontab.txt` 참고. 로그 `~/backups/backup.log`.
- **수동(작업 직전 임시)**:
```bash
cd ~/adventure-rpg && bash deploy/backup-db.sh         # 자동백업 스크립트 그대로(검증 포함)
# 또는 직접: pg_dump "$DBURL" --no-owner --no-acl -f ~/backups/backup_$(date +%F_%H%M%S).sql
```
- **2중 안전(권장)**: AWS 콘솔에서 **RDS 자동 스냅샷/PITR 보존기간 > 0** 확인(관리형·시점복원). + 추후 IAM 역할 붙이면 `backup-db.sh` 에 S3 업로드 한 줄 추가.

### 복구
```bash
gunzip -c ~/backups/<백업>.sql.gz | psql "$DBURL"       # gzip 자동백업
psql "$DBURL" < ~/backups/<백업>.sql                     # 평문 수동백업
```

### 복구 테스트 (정기 권장 — 백업은 복원돼야 백업)
prod 무접촉으로 임시 DB 에 복원해 검증(2026-06-27 실증 통과):
```bash
BK=$(ls -t ~/backups/*.sql* | head -1)
psql "$DBURL" -c 'DROP DATABASE IF EXISTS restore_test;' && psql "$DBURL" -c 'CREATE DATABASE restore_test;'
R=$(echo "$DBURL" | sed 's#/test_adventurerpg#/restore_test#')
case "$BK" in *.gz) gunzip -c "$BK";; *) cat "$BK";; esac | psql "$R" -v ON_ERROR_STOP=1 -q
psql "$R" -tAc "select count(*) from information_schema.tables where table_schema='public';"  # 46
psql "$R" -tAc "select count(*) from saves_kv;"
psql "$DBURL" -c 'DROP DATABASE restore_test;'   # 정리
```

### 전체 초기화 (클린 슬레이트)
🚨 **비가역. 반드시 백업 먼저.**
```bash
bash deploy/maintenance.sh on    # 1) 점검 ON — 유저에게 점검 페이지(앱은 떠 있고 라우트만 차단)
psql "$DBURL" -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
  WHERE datname=current_database() AND pid<>pg_backend_pid();"   # 2) 앱 DB 커넥션 종료(DROP 락 경합 방지)
psql "$DBURL" -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
psql "$DBURL" -c 'DROP SCHEMA drizzle CASCADE;'           # 🔑 3) 필수! (아래 함정 참고)
node --env-file=.env.production.local src/db/migrate.mjs  # 4) 89개 재적용 → 46 테이블
bash deploy/maintenance.sh off   # 5) 점검 OFF — 재시작되며 새 DB 재연결
# 검증: psql "$DBURL" -tAc "select count(*) from information_schema.tables where table_schema='public';"  → 46
# (DROP 이 락에 막히면 sudo systemctl stop adventure-rpg 후 진행 — 단 이땐 유저가 잠깐 502)
```

> 🔑 **함정(2026-06-27 실제 사고)**: `DROP SCHEMA public CASCADE` 는 public만 지운다. 마이그 추적 테이블 **`__drizzle_migrations` 는 별도 `drizzle` 스키마**라 살아남아 → 다음 `migrate.mjs` 가 "전부 적용됨"으로 보고 **테이블을 0개** 만든다(게임 다운). 반드시 **`DROP SCHEMA drizzle CASCADE` 도** 같이 한다.

> ⚠️ `pg_dump` 버전 ≥ 서버 버전이어야 한다(16으로 18 못 뜸). EC2 pg_dump = 18 이라 OK. 로컬 개발 박스는 16이라 prod 덤프 불가.

---

## 4b. 점검(maintenance) 모드
DB 작업·마이그·복구 등으로 잠시 막을 때. 앱은 떠 있고 **사용자 라우트만 차단** → 유저는 깔끔한 "점검 중" 페이지, `/api/health` 만 통과(모니터 유지·업타임 알림 오발 방지).
```bash
# EC2 에서
bash deploy/maintenance.sh on       # 점검 시작
bash deploy/maintenance.sh off      # 점검 종료(재시작 포함)
bash deploy/maintenance.sh status   # 현재 상태
```
- 토글 = `.env.production.local` 의 `MAINTENANCE_MODE` + 재시작. **배포(git reset)에 안 씻김**(`.env*.local` gitignore) → 켠 채 배포해도 유지.
- 구현 = `src/middleware.ts` (`MAINTENANCE_MODE==="true"` → 503 점검 페이지). staging 게이트(`IS_STAGING`)와 독립.
- ⚠️ 앱-레벨이라 **앱을 완전히 stop 하면 페이지도 안 뜸**(nginx 502). 그래서 위 초기화 절차는 stop 대신 점검 ON + 커넥션 종료를 쓴다.

## 5. 헬스 / 모니터링
- `https://msmsge.com/api/health` → `{ok, db:"ok", ms}` (DB 핑 포함, 실패 시 503). 인증 불필요.
- `/api/version` = 빌드 정보.
- 관리자 `운영 현황` 탭 → 제한 초과, 경제 이벤트, 보상 실패, 대량 골드 이동, 핫타임 설정, 매크로 의심 점수 확인.
- 운영 현황의 매크로 의심 userId/IP는 `이상 행동`·`경제 로그` 필터로 바로 연결된다.
- `OPS_ALERT_WEBHOOK_URL` 이 설정되어 있으면 임계치 알림과 일일 운영 리포트가 webhook으로 발송된다.
- 운영 알림 연결 확인은 `운영 현황`의 `알림 테스트` 버튼으로 한다.
- ⬜ 외부 업타임 모니터(Route53 헬스체크/CloudWatch/UptimeRobot)는 미설정 — 추후.

---

## 6. 크론 (EC2 `crontab -l`, UTC)
정기 작업이 EC2 crontab으로 돈다(각 라우트가 `CRON_SECRET` Bearer 검사). 종류:
- **일일 04:00 UTC**: chat/bulletin/guilds cleanup
- **일일 04:20 UTC**: ops-retention(이상 행동/경제 로그 보관 기간 초과분 정리)
- **일일 04:25 UTC**: ops-daily-report(최근 24시간 운영 지표 webhook 리포트)
- **일요일 15:0x UTC**: tower-weekly-cycle · pvp-season-rollover · pvp/fishing/treasure **season-rewards** · war-season-rollover(제거 대상이면 해제)
- TLS: `certbot-renew.timer`(systemd, 하루 2회)

크론 실패는 현재 **알림 없음**(추후 모니터링 대상). 점검: `ssh … 'crontab -l'`, 로그 `journalctl`.

---

## 7. 시크릿 · 설정 위치
| 항목 | 위치 |
|---|---|
| `DATABASE_URL`, OAuth(Kakao) 키, `CRON_SECRET` 등 | EC2 `~/adventure-rpg/.env.production.local` (레포·개발박스엔 없음) |
| 배포 SSH | GitHub 시크릿 `EC2_HOST` · `EC2_SSH_KEY` |
| SSH 키 .pem | 로컬 `~/.ssh/msmsge-key.pem` |
| 빌드타임 플래그 | tracked `.env.production` (예: `NEXT_PUBLIC_*` 운영 플래그) |

관리자 권한:
- `ADMIN_EMAILS`: 최고 관리자. 모든 관리자 작업 가능.
- `OPS_READONLY_EMAILS`: 관리자 조회만 가능.
- `OPS_REWARD_EMAILS`: 보상 보정 지급 가능.
- `OPS_SANCTION_EMAILS`: 제재 변경 가능.

인증: **카카오 OAuth만**(구글은 베타 동안 제외 #1216). NextAuth/Auth.js + Drizzle 어댑터.

---

## 8. 알려진 함정 / 사고 이력
- **초기화 시 `drizzle` 스키마**: 위 §4 참고 — 반드시 같이 드롭.
- **pg_dump 버전**: ≥ 서버. 16<18.
- **옛 Neon URL**: stale 좀비. 진짜 prod = RDS.
- **main 머지 = 즉시 운영**: 스테이징 없음. CI(`check`) 통과는 런타임 정상을 보장 안 함 → 배포 후 `/api/health` 확인 습관.
- **점검 모드**: ✅ 구현됨 — `deploy/maintenance.sh on|off` (§4b). 단 앱-레벨이라 완전 stop 시엔 nginx 502(추후 nginx-레벨 점검 페이지 고려).

## 8b. 운영 문의 빠른 확인

### 보상이 안 들어왔다는 문의
1. 관리자 `유저` 탭에서 대상 유저 선택.
2. `운영 요약`에서 현재 재화, 최근 보상 수령, 숙련/증서 이벤트 확인.
3. `경제 로그`에서 `userId` 필터로 `reward.*`와 `reward.failure.*` 확인.
4. 낚시 코인은 `오늘 챔질 코인` 상한 도달 시 추가 챔질 코인이 미지급된다. 레벨업 보상은 별도 로그(`reward.fishing.level`)로 확인.
5. 운영 현황의 `보상 실패 보정 후보`에서 원본 event id를 확인한 뒤 보정 지급에 남긴다.

### 매크로/부하 의심
1. `운영 현황` 알림 카드에서 요청 제한 급증 여부 확인.
2. `이상 행동` 탭에서 action/IP/userId/reason 필터 적용.
3. 동일 IP 다계정 반복이면 IP 제한 또는 제재 검토. 단일 유저 반복이면 유저 제재 또는 API limit/window 조정 검토.
4. 차단 중인 유저는 제재 패널에서 1일/3일 연장 또는 해제를 처리한다.
5. 정상 유저가 반복적으로 걸리면 해당 콘텐츠의 정상 클릭 속도를 다시 측정하고 제한값을 조정.

### 배포 후 점검
1. GitHub Actions `CI`와 `Deploy to EC2` 성공 확인.
2. `curl -fsS https://msmsge.com/api/health` 와 `/api/version` 확인.
3. 배포 Action 의 `deploy-smoke 200` 로그 확인. 낚시 상태, 사냥, 길드 훈련장, 관리자 ops API 모듈 로드도 같이 점검된다.
4. 관리자 `운영 현황`에서 webhook 설정, 알림 카드, 최근 경제 이벤트가 비정상적으로 튀지 않는지 확인.

---

## 9. 운영 성숙도 — 남은 TODO
- [x] **자동 백업 + 복구 테스트** — `deploy/backup-db.sh`(일일·14일 로테) + 복구테스트 절차(§4 검증완료). ⬜ S3 오프사이트(IAM 역할 후)
- [ ] 외부 업타임 모니터 + 알림 (Route53/CloudWatch/SNS)
- [ ] 배포 후 자동 스모크
- [x] 점검(maintenance) 모드 — `deploy/maintenance.sh` (§4b)
- [ ] 시크릿을 SSM/Secrets Manager로
- [ ] 노출 자격증명 로테이션(베타 준비 중 채팅 노출분)
