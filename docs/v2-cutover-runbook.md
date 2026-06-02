# v2 운영 컷오버 런북 (방식 A — 코드 스왑)

v2(스테이징 `test-adventure` / `test.msmsge.com`)를 운영 `msmsge.com` 으로 통째 승격.
**방식 A**: 운영 디렉터리 `~/adventure-rpg` 의 git origin 을 test-adventure repo 로 리포인트해
**같은 prod 도메인/포트/서비스/nginx 를 유지한 채 코드+DB+env 만 교체**. staging 환경은 보존.

> 나(Claude)는 EC2/RDS 직접 접근 불가 → 아래는 **유저가 EC2 박스에서 실행**하는 절차다.
> Claude Code 세션에서 `! <명령>` 으로 돌리면 출력이 대화에 들어와 함께 확인 가능.

---

## 인프라 매트릭스 (현재)

| | 운영(prod) | 스테이징(staging) |
|---|---|---|
| EC2 디렉터리 | `~/adventure-rpg` | `~/adventure-rpg-test` |
| git origin | `sea9401/adventure` (v1, **→ 컷오버 시 test-adventure 로**) | `sea9401/test-adventure` (v2) |
| systemd | `adventure-rpg.service` | `adventure-rpg-test.service` |
| 포트 | 3000 | 3002 |
| nginx | `msmsge.com → :3000` (변경 없음) | `test.msmsge.com → :3002` |
| RDS DB | `adventurerpg` (v1, **→ `test_adventurerpg` 로**) | `test_adventurerpg` (v2) |

**선결 완료**: PR #356 머지로 코드측 블로커#1(루트=v2 승격) 해소됨. 운영(IS_STAGING 미설정)에서도 루트 `/`가 네이티브 v2.

---

## 0. 사전 준비 (컷오버 전, 비파괴)

- [ ] **OAuth 콜백** (유저/콘솔) — Google/Kakao 콘솔에 `https://msmsge.com/api/auth/callback/google`,
      `.../callback/kakao` 등록 확인. v1 앱 재사용이면 이미 있을 가능성 큼. 코드엔 콜백 하드코딩 없음
      (상대 `callbackUrl:"/"`), 링크 쿠키 host-scoped → 도메인 충돌 없음.
- [x] **XP 배율 결정 (확정: 2.2)** — `IS_STAGING` 제거 시 기본이 2.2→1.0 으로 떨어지므로
      (`src/lib/leveling.ts`), `.env.production.local` 에 **`NEXT_PUBLIC_XP_RATE_MULT=2.2`** 를
      명시해 현 staging 과 동일한 페이스를 유지한다 (3b env 표 참조).
- [ ] **(선택, 권장) PR-2 v1 잔존 표면 정리** — `/create`,`/profile`,`/manual`,`/sign-in`,`/admin` +
      v1 전용 api(`battle`,`hunt`,`shop`,`tower`,`craft`,`quests` …)가 도달 가능. v2-루트로도 무해하지만
      깔끔하게 리다이렉트/404 처리 권장 (별도 PR). 컷오버 자체의 블로커는 아님.

---

## 런북 1 — 마이그레이션 무결성 검증 (블로커#3)

목적: `test_adventurerpg` 가 실제 최신 마이그(현재 **0044**)까지 **물리적으로** 적용됐는지 확인.
과거 사고([[incident-test-db-missing-column]])는 해시만 등록되고 ALTER 가 누락돼 런칭 후 500 — 그래서
마이그레이션 카운트가 아니라 **물리 스키마**를 직접 확인한다.

```bash
cd ~/adventure-rpg-test   # (아직 v2 코드가 있는 곳; drizzle/ 폴더 기준)

# 1) 미적용 마이그 있으면 적용 (idempotent — 다 돼있으면 "완료"만 출력)
node --env-file=.env.production.local src/db/migrate.mjs

# 연결 문자열을 변수로 (이후 단계에서 재사용)
PGURL=$(grep '^DATABASE_URL=' .env.production.local | cut -d= -f2- | tr -d '"')

# 2) 물리 스키마 spot-check: 0044 가 드롭한 컬럼들이 실제로 없어야 한다 (기대값 0)
psql "$PGURL" <<'SQL'
SELECT 'v2_guild_resources stale cols' AS chk, count(*) AS leftover
  FROM information_schema.columns
 WHERE table_name='v2_guild_resources'
   AND column_name IN ('stone','soldiers','scrolls','active_scroll_expires_at')
UNION ALL
SELECT 'outpost_occupations.last_harvested_at', count(*)
  FROM information_schema.columns
 WHERE table_name='outpost_occupations' AND column_name='last_harvested_at';
SQL
# 둘 다 leftover=0 이어야 통과. >0 이면 0044 ALTER 누락 → 수동 적용 필요.

# 3) 마이그 로그 최신 확인 (참고용) — journal idx 0..44 → 45 건 기대
psql "$PGURL" -c "SELECT count(*) AS applied FROM drizzle.__drizzle_migrations;"
```

**게이트: 위 검증 통과 전 다음 단계 진행 금지.**

---

## 런북 2 — 백업 + DB wipe (블로커#4)

### 2a. 백업 (되돌릴 수 없는 작업 직전 필수)

```bash
# v1 운영 DB 박제 (첫 작품 보존)
pg_dump "$(grep '^DATABASE_URL=' ~/adventure-rpg/.env.production.local | cut -d= -f2- | tr -d '\"')" \
  -Fc -f ~/backup-adventurerpg-v1-$(date -u +%Y%m%d).dump

# wipe 대상 DB 도 안전망으로 한 부 (복사된 옛 라이브 + 스테이징 테스트 계정)
pg_dump "$(grep '^DATABASE_URL=' ~/adventure-rpg-test/.env.production.local | cut -d= -f2- | tr -d '\"')" \
  -Fc -f ~/backup-test_adventurerpg-prewipe-$(date -u +%Y%m%d).dump

# (필수 게이트) 두 덤프가 유효한지 검증 — 둘 다 OK 떠야 wipe 진행. 하나라도 INVALID 면 중단.
for f in ~/backup-adventurerpg-v1-*.dump ~/backup-test_adventurerpg-prewipe-*.dump; do
  if pg_restore -l "$f" >/dev/null 2>&1; then echo "OK   $f"; else echo "INVALID $f — 중단, wipe 금지"; fi
done
```
> v1 repo 코드도 `adventure` repo 에 final 태그 1개 찍어두기 (유저, GitHub).
> **위 루프가 두 줄 다 `OK` 를 찍어야 2b 로 진행.** 하나라도 `INVALID` 면 백업부터 다시.

### 2b. wipe — `test_adventurerpg` 의 모든 앱 테이블 비우기

스키마 + `drizzle.__drizzle_migrations`(drizzle 스키마) 는 **보존**, `public` 스키마의 모든 테이블만 비운다.
`TRUNCATE users CASCADE` 로는 시즌/세션/treasury 등 user-FK 없는 테이블이 안 지워지므로(=codex 지적)
**public 전체를 동적 TRUNCATE**:

```bash
PGURL=$(grep '^DATABASE_URL=' ~/adventure-rpg-test/.env.production.local | cut -d= -f2- | tr -d '"')

# (안전) 연결된 DB 가 진짜 test_adventurerpg 인지 눈으로 먼저 확인
psql "$PGURL" -c "SELECT current_database();"   # → test_adventurerpg 이어야 함

# (확인) 지워질 테이블 목록 미리보기
psql "$PGURL" -c "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1;"

# (실행) 가드 내장 TRUNCATE — DB명이 test_adventurerpg 가 아니거나, 마이그 로그가
#         'drizzle' 스키마 밖에 있으면 RAISE EXCEPTION 으로 즉시 중단(=운영 DB adventurerpg
#         오삭제 차단). ON_ERROR_STOP=1 로 가드 발동 시 비0 종료.
#         quoted heredoc(<<'SQL') 이라 $$ / 변수가 bash 에 안 먹힘.
psql "$PGURL" -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE stmt text;
BEGIN
  -- 가드 1: 반드시 test_adventurerpg 여야 한다
  IF current_database() <> 'test_adventurerpg' THEN
    RAISE EXCEPTION 'ABORT: connected to %, not test_adventurerpg', current_database();
  END IF;
  -- 가드 2: __drizzle_migrations 가 'drizzle' 스키마에만 있어야 한다 (public 에 있으면 wipe 에 휩쓸림)
  IF (SELECT count(*) FROM information_schema.tables
        WHERE table_name='__drizzle_migrations' AND table_schema='drizzle') <> 1
     OR EXISTS (SELECT 1 FROM information_schema.tables
        WHERE table_name='__drizzle_migrations' AND table_schema='public') THEN
    RAISE EXCEPTION 'ABORT: __drizzle_migrations not isolated in drizzle schema';
  END IF;
  -- 가드 통과 → public 전체 비우기
  SELECT 'TRUNCATE TABLE '
       || string_agg(format('%I.%I', schemaname, tablename), ', ')
       || ' RESTART IDENTITY CASCADE'
    INTO stmt
    FROM pg_tables WHERE schemaname='public';
  EXECUTE stmt;
END $$;
SQL

# (검증) 마이그 로그는 살아있어야 한다 — 45 유지
psql "$PGURL" -c "SELECT count(*) AS migrations_still_here FROM drizzle.__drizzle_migrations;"
```

> `savesKv` 도 비워진다 = v1·v2 공유 테이블이라 v2 상태(`character.v2` 등)도 함께 초기화 — **신규 시작이라 의도된 것**.

---

## 런북 3 — prod 코드 스왑 + env + 크론 (블로커#2, 방식 A)

### 3a. 운영 디렉터리 코드를 v2(test-adventure)로 교체

`reset --hard` 가 도는 디렉터리를 헷갈리면 치명적 → `cd` 대신 `git -C` 절대경로로 박는다.

```bash
PROD=/home/ec2-user/adventure-rpg
git -C "$PROD" remote -v                                  # 현재 origin = sea9401/adventure 확인
git -C "$PROD" remote set-url origin https://github.com/sea9401/test-adventure.git
git -C "$PROD" fetch origin --prune
git -C "$PROD" checkout main
git -C "$PROD" reset --hard origin/main                   # 이제 v2 코드
git -C "$PROD" log --oneline -1                           # test-adventure main HEAD 인지 확인
```
> deploy.yml prod step 은 `git reset --hard origin/main` 을 generic 하게 돈다 → **origin 만 바꾸면**
> 이후 push 마다 prod 가 test-adventure main 을 따라간다(=새 운영 CD). deploy.yml 자체 수정 불필요.

### 3b. 운영 env 갱신 (`~/adventure-rpg/.env.production.local`)

| 키 | 값 | 비고 |
|---|---|---|
| `DATABASE_URL` | `…/test_adventurerpg` 로 변경 | 같은 RDS 호스트, db명만 `adventurerpg`→`test_adventurerpg` |
| `AUTH_URL` | `https://msmsge.com` | |
| `AUTH_TRUST_HOST` | `true` | nginx 뒤 |
| `NEXT_PUBLIC_XP_RATE_MULT` | **`2.2`** (확정) | staging 과 동일 빠른 페이스. 미설정 시 1.0 으로 떨어짐 |
| `IS_STAGING` | **제거** | 게이트/`/dev` 노출 해제 |
| `STAGING_OPEN` | **제거** | |
| `V2_AS_ROOT` | **제거** | PR#356 이후 no-op |

> **반드시 그대로 유지(건드리면 로그인/관리자 락아웃)**: `AUTH_SECRET`, `CRON_SECRET`,
> `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_KAKAO_ID`, `AUTH_KAKAO_SECRET`(Auth.js v5 자동인식),
> `ADMIN_EMAILS`(`src/lib/server/isAdmin.ts`). env 는 **덮어쓰기 말고 위 표의 키만 수정/제거**.
> `metadataBase` 는 코드에 `https://msmsge.com` 하드코딩이라 손댈 것 없음.

### 3c. 배포 프리즈 (컷오버 중 자동배포 차단)

컷오버 도중 누가 push 하거나 워크플로가 돌면 `~/adventure-rpg` 가 중간 상태에서 빌드/재시작돼
꼬인다. 컷오버 시작 전 **양쪽 repo 의 GitHub Actions 를 일시 disable**:
- `sea9401/adventure`(v1) — 영구 disable (옛 repo, 더 이상 배포 안 함).
- `sea9401/test-adventure`(v2) — 컷오버 동안만 disable, **3f 검증 통과 후 재활성**(이게 새 운영 CD).

(유저/GitHub → 각 repo Settings → Actions, 또는 Actions 탭에서 워크플로 disable.)

### 3d. 크론 통합 (`crontab -l` 갱신)

현재 crontab 은 v1 경로 기준. v2 기준으로 정리:
- **유지**(공유/ v2 사용): `chat/cleanup`, `bulletin/cleanup`, `cron/guilds-cleanup`,
  `cron/guilds-quests-deadline`, `cron/guilds-quests-cycle`, `cron/pvp-season-rollover`,
  `cron/pvp-season-rewards`, `cron/fishing-season-rewards`, `cron/treasure-season-rewards`,
  `cron/coop-respawn`.
- **추가**(v2 신규): `POST /api/v2/cron/npc-attacks` — 거점 NPC 토벌, **매시간**. (GET 아님, `-X POST`)
- **유지**(드롭 보류): `cron/tower-weekly-cycle` — v1 무한탑 칭호 cron. ⚠️ HEAD 에 tower weekly
  코드가 아직 살아있음 (`src/adventure/tower/weeklyTypes.ts`, `rankings` route 가 `towerWeek` 서빙).
  v2 에서 tower weekly 가 실제 노출되는지 불명 → **컷오버 땐 그냥 유지**. 제품적으로 폐기 확정되면
  그때 코드까지 함께 정리(별건).

추가 라인 예:
```cron
0 * * * * curl -fsS -X POST -H "Authorization: Bearer $SECRET" http://127.0.0.1:3000/api/v2/cron/npc-attacks
```
(나머지 라인은 `deploy/crontab.txt` 의 기존 포맷 유지, 포트 3000.)

### 3e. 빌드 + 재시작 + 헬스

```bash
cd ~/adventure-rpg
bash deploy/install-deps.sh
node --env-file=.env.production.local src/db/migrate.mjs   # idempotent (런북1에서 이미 최신)
npm run build
sudo systemctl restart adventure-rpg
sleep 2
sudo systemctl --no-pager status adventure-rpg | head -n 4
curl -fsS -o /dev/null -w 'prod=%{http_code}\n' http://127.0.0.1:3000/api/health
```

### 3f. 검증 (브라우저)

- [ ] `https://msmsge.com` → **v2 게임** 이 뜬다 (루트). 503/게이트 없음.
- [ ] Google/Kakao 로그인 → 콜백 정상, 세션 생성.
- [ ] 신규 캐릭터 생성 → 빈 DB 에 정상 저장.
- [ ] `https://msmsge.com/dev/v2-game` → **404** (운영에서 /dev 차단 확인).

---

## 롤백

- **코드만 문제** → `~/adventure-rpg` origin 을 다시 `sea9401/adventure` 로, `reset --hard`, env 원복, restart.
- **데이터** → wipe 는 비가역. `~/backup-*.dump` 를 `pg_restore` 로 복원해야 함. **그래서 2a 백업이 필수.**
- v1 으로 완전 회귀 시: DATABASE_URL 을 `adventurerpg` 로 되돌리면 v1 데이터 그대로 살아있음(박제만 했지 안 지움).

---

## 컷오버 당일 순서 (요약 체크리스트)

순서가 중요하다 — **자동배포·크론이 중간 상태에 끼어들지 않게** 프리즈를 먼저, wipe 는 코드/env
교체 후·재시작 전에, 크론은 검증 통과 후 마지막에.

1. [ ] 0번 사전 준비 완료 (OAuth 콜백, XP 결정)
2. [ ] 런북1 마이그 무결성 통과 (게이트)
3. [ ] 런북3c **배포 프리즈** — 양쪽 repo Actions disable
4. [ ] 점검 공지 / 접근 차단
5. [ ] 런북2a 백업 2부 + `pg_restore -l` 검증 둘 다 OK (게이트)
6. [ ] 런북3a 코드 스왑(origin 리포인트+reset) + 3b env (아직 restart 안 함)
7. [ ] 런북2b wipe (current_database 가드 통과)
8. [ ] 런북3e 빌드 + 재시작 + 헬스
9. [ ] 런북3f 검증 (msmsge.com=v2, 로그인, 신규캐릭, /dev 404)
10. [ ] 런북3d 크론 갱신 (서비스 정상 확인 후)
11. [ ] 배포 프리즈 해제 — `test-adventure` Actions 재활성 (새 운영 CD)

---

## 사후 (post-cutover) 정리 — 별건

- **staging DB 격리** ⚠️ — 컷오버 후 `test_adventurerpg` = 운영. staging(`~/adventure-rpg-test`)이 같은 DB 를
  가리키므로, staging 을 다시 열기 전 **새 staging DB** 를 만들어 분리할 것. 그 전까진 staging `STAGING_OPEN=false` 유지.
- **PR-2 v1 표면 정리** (0번에서 안 했으면).
- **서버 영속 개인 활동로그** — 이연 기능 (빈 DB 일 때 베이크하면 무위험). 착수 시 [[project-v2-promotion-cutover]] 참고.
