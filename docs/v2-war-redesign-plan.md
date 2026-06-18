# v2 전쟁 리디자인 PR 구현 스펙

> ⚠️ **정정 (2026-06-14, 본문 작성 후 검증)**: 이 스펙은 **origin/main보다 28커밋 뒤처진 로컬 트리**에서 작성됐다.
> - **마이그레이션 다음 번호 = `0055`** (Codex가 읽은 0053은 stale. 실제 origin/main 최신 = `0054_coop-multi-summon.sql`). 아래 본문의 `0054/0055/0056`을 각각 **`0055/0056/0057`**로 읽을 것.
> - 구현 착수 전 **origin/main 기준으로 war 파일(claim/eject/war.overview/outposts/siege) 재검증** 필수. 구현은 origin/main에서 분기한 **별도 워크트리**에서(본 트리 HEAD는 28커밋 stale + 다른 세션과 공유).
> - 28커밋 안에 weather(#732~737, PvE 전투 속성)·coop-boss(#712~714)·rare-maps·plaza 이관 포함 — war 라우트 직접 변경은 낮지만 `resolveBattle`/`resolveBattlePvP` 시그니처 변화 여부만 확인.

전제:

- 목표 규모는 현재 약 18명, 상한 설계는 약 100명이다.
- 설계 문구의 "92거점"은 현재 코드와 불일치한다. `src/adventure/data/v2/outposts.ts` 주석과 데이터는 96개(5 왕국 + 10 도시 + 26 tier2 + 51 마을 + 4 절대 중립)로 보인다. 구현은 정적 거점 목록을 줄이거나 이름을 바꾸지 않고, 현 `OUTPOSTS` 전체를 그대로 둔 뒤 쟁탈 가능/활성 플래그만 얹는다.
- 현재 마이그레이션은 `drizzle/meta/_journal.json` 기준 `0053_intruder_json_index`가 마지막이다. 다음 스키마 PR은 `0054`부터 시작한다. 문서/구현 PR에서 "0054 이후"라고 쓰지 말고 실제로는 "0054가 다음 번호"임을 확인해야 한다.
- 기존 점령 모델은 `outpost_occupations`에 행이 있으면 점령, 행이 없으면 NPC 운영이다. `src/app/api/v2/cron/npc-attacks/route.ts`도 방어 실패 시 행 삭제로 중립화한다. 주간 중립 리셋은 이 의미론과 충돌하지 않게 삭제를 기본으로 한다.
- 기존 이동/발견 모델은 `character.v2.lastVisitedOutpost`와 `character.v2.discoveredOutpostIds`이며, `src/app/api/v2/me/visit-outpost/route.ts`가 인접 이동과 발견 확장을 서버 권위로 처리한다.
- 길드 정원은 `src/adventure/data/guild.ts`의 `GUILD_MAX_MEMBERS = 3`이 주요 상수지만, UI와 주석에 `/3`, "정원 3" 하드코딩이 남아 있다. 전투 라인업은 `v2_guild_lineups.memberUserIds`와 `src/lib/server/v2RunTournament.ts`의 `MAX_LINEUP = 3`이므로 길드 정원과 분리한다.

## PR-1 쟁탈거점 다이얼

### 목표

- 모든 정적 거점은 그대로 유지한다.
- 이 중 일부만 "쟁탈 가능(contestable)"으로 플래그 처리하고, 주간 시즌마다 그중 N개만 "활성(active)"으로 연다.
- 현재 인구 약 18명에서는 활성 1~2개, 100명에서는 약 10개가 되도록 운영 다이얼을 둔다.
- 왕국/도시/마을이 지도에 남아 있어도 점수 시즌에 들어가는 전쟁 표면은 작게 유지한다.

### 스키마 변경

- `0054` 마이그레이션 후보:
  - `war_config`
    - `key text primary key`
    - `value jsonb not null`
    - `updated_at timestamp not null default now()`
  - `war_active_outposts`
    - `season_id text not null`
    - `outpost_id text not null`
    - `slot integer not null`
    - `activated_at timestamp not null default now()`
    - PK `(season_id, outpost_id)`
    - unique `(season_id, slot)`
    - index `(season_id)`
- `war_config`에 저장할 기본 키:
  - `active_outpost_policy`: `{ "mode": "auto", "manualCount": null, "min": 1, "max": 10, "playersPerOutpost": 10 }`
  - `contestable_outpost_ids`: 정적 ID 배열. 최초값은 코드 상수에서 seed하거나 런타임 상수만 쓰고 DB에는 운영 override만 둔다.
- 정적 데이터에 새 필드를 직접 추가하는 대신 `src/adventure/data/v2/warOutposts.ts` 같은 파일을 만들어 `CONTESTABLE_OUTPOST_IDS`, `isContestableOutpost(id)`, `activeOutpostCountDial(activePlayers)`를 제공한다. 기존 `Outpost` 타입 변경은 UI 파급이 커서 PR-1에서는 피한다.

### 라우트/크론 변경

- `src/app/api/v2/outpost/claim/route.ts`
  - 점령 시도 초기에 `outpost.neutral` 이후 `isContestableOutpost(outpost.id)`와 현재 시즌 활성 여부를 검사한다.
  - 비쟁탈 거점은 `not_contestable`, 쟁탈 가능하지만 이번 주 비활성은 `war_outpost_inactive`로 거부한다.
  - NPC 운영/금고/사냥 세금은 기존대로 유지하되, 전쟁 점수와 점령권 변경은 활성 거점에만 허용한다.
- `src/app/api/v2/outpost/occupations/route.ts`
  - 응답에 `contestable`, `warActive`, `seasonId`를 추가한다. 기존 클라이언트가 무시할 수 있게 additive 변경으로 한다.
- `src/app/api/v2/war/overview/route.ts`
  - `activeOutposts` 배열을 내려 전황 UI가 이번 주 전장만 강조할 수 있게 한다.
- 새 헬퍼:
  - `src/lib/server/warSeason.ts`
    - KST 월요일 00:00 기준 `seasonId` 계산.
    - 현재 시즌 활성 거점 조회.
    - 없으면 결정적 seed로 생성하는 함수. PR-2의 시즌 롤오버 전까지 PR-1에서 lazy 생성해도 된다.

### 신규 상수/공식

- 기본 쟁탈 후보:
  - 처음에는 중앙 분쟁지대와 그 주변 tier2 위주로 12~16개 후보를 잡는다.
  - `CONFLICT_ZONE_IDS`는 현재 시작 거점 2홉 기반이라 너무 넓거나 시작점 의존적일 수 있다. PR-1에서는 명시 ID 배열을 우선한다.
- 활성 개수:
  - `WAR_ACTIVE_MIN = 1`
  - `WAR_ACTIVE_MAX = 10`
  - `WAR_PLAYERS_PER_ACTIVE_OUTPOST = 10`
  - `activeCount = clamp(round(activeWarPlayers / WAR_PLAYERS_PER_ACTIVE_OUTPOST), WAR_ACTIVE_MIN, WAR_ACTIVE_MAX)`
  - 활성 전쟁 참여자 집계가 없으면 최근 7일 로그인/사냥/점령 시도 유저 수를 임시로 사용한다.
  - 현재 18명 가정: `round(18 / 10) = 2`
  - 100명 가정: `round(100 / 10) = 10`
- 수동 override:
  - `war_config.active_outpost_policy.manualCount`가 있으면 자동 공식보다 우선한다.
  - 라이브 시작 기본값은 `manualCount = 2` 또는 자동 2다.

### 리스크/기존 충돌

- 현재 `claim`은 모든 비중립 거점 점령을 허용하고 보급선/인접 공격/성벽까지 처리한다. 활성 게이트를 잘못 걸면 기존 거점 소유권이 남아 있어도 더 이상 공격/탈환이 안 되는 잠금이 생긴다. PR-1 배포 시점에는 비활성 쟁탈 거점의 기존 occupation을 어떻게 처리할지 PR-2 리셋과 같이 결정해야 한다.
- 기존 `war/overview`는 모든 점령 거점을 전황으로 본다. 활성 거점만 점수 전장이고 전체 점령은 지도 장식으로 남기는지, 아니면 비활성 점령 자체를 금지할지 UX 문구가 필요하다.
- `outposts.ts`의 실제 개수 불일치(설계 92 vs 코드 96)는 테스트로 고정하지 말고 문서에 기록한 뒤 후보 ID를 명시 배열로 관리한다.

## PR-2 주간 시즌 + 점수 + 결산 크론

### 목표

- 매주 월요일 00:00 KST에 쟁탈 활성 거점만 중립 리셋한다.
- 유지시간 점수는 금지한다.
- 점수는 점령 횟수와 실제 전투 기여에 가중치를 둔다.
- 자동 단판 환경에서 독점 길드가 단순 반복으로 점수를 무한 증식하지 못하게 시즌/거점/길드별 감쇠와 캡을 둔다.
- 시즌 종료 보상은 멱등 크론으로 지급한다.

### 스키마 변경

- `0055` 마이그레이션 후보:
  - `war_seasons`
    - `season_id text primary key`
    - `starts_at timestamp not null`
    - `ends_at timestamp not null`
    - `status text not null default 'active'`
    - `settled_at timestamp`
    - `reset_at timestamp`
    - check `status in ('active','settling','settled')`
  - `war_score_events`
    - `id serial primary key`
    - `season_id text not null`
    - `outpost_id text not null`
    - `guild_id integer references guilds(id) on delete set null`
    - `user_id text references users(id) on delete set null`
    - `event_type text not null`
    - `points integer not null`
    - `payload jsonb not null default '{}'::jsonb`
    - `created_at timestamp not null default now()`
    - indexes `(season_id, guild_id)`, `(season_id, user_id)`, `(season_id, outpost_id)`, `(created_at)`
  - `war_season_scores`
    - `season_id text not null`
    - `guild_id integer not null references guilds(id) on delete cascade`
    - `points integer not null default 0`
    - `captures integer not null default 0`
    - `siege_wins integer not null default 0`
    - `eject_wins integer not null default 0`
    - `updated_at timestamp not null default now()`
    - PK `(season_id, guild_id)`
  - `war_season_user_scores`
    - `season_id text not null`
    - `user_id text not null references users(id) on delete cascade`
    - `guild_id integer references guilds(id) on delete set null`
    - `points integer not null default 0`
    - `captures integer not null default 0`
    - `siege_wins integer not null default 0`
    - `eject_wins integer not null default 0`
    - PK `(season_id, user_id)`
  - `war_season_rewards`
    - `season_id text not null`
    - `guild_id integer not null references guilds(id) on delete cascade`
    - `rank integer not null`
    - `reward jsonb not null`
    - `claimed_at timestamp`
    - `created_at timestamp not null default now()`
    - PK `(season_id, guild_id)`
- 기존 `outpost_claim_attempts`는 감사/리플레이 로그로 유지하고 점수 원장은 새 `war_score_events`로 분리한다. 기존 로그만으로 점수를 재계산하면 NPC 공격의 `won` 의미(수비자 승리)와 플레이어 공격의 `won` 의미가 달라 위험하다.

### 라우트/크론 변경

- `src/app/api/v2/outpost/claim/route.ts`
  - 승리한 공성 타격: `siege_win` 점수 이벤트.
  - 실제 소유권 이전: `capture` 점수 이벤트.
  - `captured=false`인 성벽 타격은 기여점만 주고 점령 횟수에는 넣지 않는다.
  - 토너먼트의 경우 `runTournamentForGuilds`가 반환한 출전자 ID에 개인 기여점을 분배한다.
- `src/app/api/v2/outpost/eject/route.ts`
  - PR-3의 현상금 처리와 별개로 토벌 승리 시 `eject_win` 소량 점수 이벤트를 줄 수 있다. 단, 토벌만으로 시즌 우승이 가능하지 않게 낮은 가중치와 주간 캡을 둔다.
- 새 크론:
  - `src/app/api/v2/cron/war-season-rollover/route.ts`
  - `CRON_SECRET` 검증.
  - 매주 일요일 15:00 UTC = 월요일 00:00 KST에 실행.
  - 이전 시즌 `settling` 전환, 보상 산정, 활성 쟁탈 거점 occupation 삭제, 다음 시즌 생성, 다음 활성 거점 선정.
  - 멱등 조건: `war_seasons.status`, `settled_at`, `war_season_rewards` PK로 중복 지급 방지.
- `deploy/crontab.txt`
  - 기존 주간 크론은 일요일 15:00 UTC 전후에 몰려 있다. 전쟁 리셋은 점령 상태를 바꾸므로 `pvp-season-rollover`와 별개지만 같은 시각대에 둔다.
  - 권장 순서:
    - `3 15 * * 0 ... /api/v2/cron/war-season-rollover`
    - 기존 `pvp-season-rewards`는 `5 15 * * 0`, 낚시/보물은 7~8분이라 직접 충돌은 낮다.
  - `npc-attacks`가 매시 정각에 실행 중이다. 월요일 00:00 KST는 UTC 일요일 15:00이고 `npc-attacks`도 `0 * * * *`라 같은 분에 겹친다. 전쟁 리셋을 `3 15 * * 0`으로 두면 `npc-attacks`와 분 단위 충돌을 피한다.

### 신규 상수/공식

- 시즌 시간:
  - `WAR_SEASON_TZ = "Asia/Seoul"`
  - `WAR_SEASON_START_WEEKDAY = 1`
  - `WAR_SEASON_START_HOUR = 0`
  - `seasonId = YYYY-Www-KST` 또는 기존 낚시/보물의 ISO 주차 계산 방식과 동일한 문자열.
- 점수:
  - `WAR_POINTS_SIEGE_WIN = 12`
  - `WAR_POINTS_CAPTURE = 100`
  - `WAR_POINTS_EJECT_WIN = 6`
  - `tierFactor = { 1: 0.8, 2: 1.0, 3: 1.2, 4: 1.5 }`
  - `capturePoints = round(WAR_POINTS_CAPTURE * tierFactor)`
  - `siegePoints = round(WAR_POINTS_SIEGE_WIN * tierFactor)`
- 독점 방지:
  - 같은 길드가 같은 거점에서 시즌 중 얻는 capture 점수는 `1회 100%`, `2회 40%`, `3회 이후 0%`.
  - 같은 길드가 같은 거점에서 얻는 siege_win 점수는 주간 최대 `WAR_SIEGE_POINTS_PER_GUILD_OUTPOST_CAP = 60`.
  - 같은 유저의 eject 점수는 주간 최대 `WAR_EJECT_POINTS_PER_USER_CAP = 60`.
  - 활성 거점당 시즌 총점 상한을 둔다: `WAR_POINTS_PER_OUTPOST_GUILD_CAP = 180`.
  - 이 구조에서는 한 길드가 모든 활성 거점을 독점해도 총점이 `activeCount * 180` 근처에서 멈춘다. 뒤처진 길드는 재점령 1회와 도전자 보너스(PR-4)로 의미 있는 점수를 따라잡을 여지가 있다.
- 개인 기여:
  - 1v1 공격자: 해당 이벤트 개인점수 100%.
  - 3:3 토너먼트: 출전한 공격 라인업에게 70%를 균등 분배, 실제 마지막 capture를 발생시킨 요청자에게 30%.
  - 수비 성공은 현재 명시 설계에 없으므로 PR-2 MVP에서는 점수화하지 않는다. 넣으면 유지시간의 우회가 될 수 있다.

### 압박 검증

- 자동 단판 환경에서 단순 점령 횟수만 점수화하면 가장 강한 길드가 활성 N개를 계속 순회하면서 점수를 독식한다. 따라서 PR-2 점수식은 "점령했다"보다 "처음 빼앗았다"와 "다른 길드가 다시 뺏을 수 있다"에 가깝게 설계해야 한다.
- 위 감쇠/캡을 적용하면 독점 길드는 거점을 계속 지켜도 유지시간 점수를 못 받는다. 같은 거점 반복 점령도 3회 이후 capture 점수가 0이므로 고의 양보/재점령 파밍 가치가 줄어든다.
- 그래도 강한 길드가 모든 활성 거점의 첫 capture를 가져가면 초반 리드가 생긴다. 이 리드는 PR-4 도전자 보너스와 PR-1 활성 개수 다이얼로 조정한다. 현재 18명에서 활성 2개면 한 길드 독식 위험이 크므로 시즌 초반 관측 후 `manualCount = 1` 또는 `2`를 운영 다이얼로 바꿀 수 있어야 한다.
- 점수 원장은 append-only(`war_score_events`)로 남기고 집계 테이블은 캐시로 취급한다. 버그가 있으면 특정 시즌을 재집계할 수 있어야 한다.

### 주간 중립 리셋 엣지케이스

- `npc-attacks`와 동시 실행:
  - `npc-attacks`는 `outpost_occupations`를 `FOR UPDATE`로 잠근 뒤 패배 시 삭제한다.
  - 전쟁 리셋도 대상 active outpost의 occupation을 `FOR UPDATE`로 잠근 뒤 삭제한다.
  - 크론 시간을 `3 15 * * 0`으로 미뤄 분 단위 충돌을 줄이고, 같은 행은 DB row lock으로 직렬화한다.
- `claim`과 동시 실행:
  - `claim`은 먼저 해당 occupation을 `FOR UPDATE`로 잠근다.
  - 리셋은 시즌 종료 기준시각 이후 요청을 새 시즌으로 보아야 한다. `claim` 시작 시 계산한 `seasonId`가 닫힌 시즌이면 `season_closed`를 반환한다.
  - 리셋 트랜잭션에서 active outpost 행을 삭제한 뒤 다음 시즌 active를 만든다. 이후 claim은 새 시즌 active 여부를 다시 확인한다.
- `eject`와 동시 실행:
  - `eject`는 occupation이 없으면 `not_occupied`로 실패한다.
  - 리셋이 먼저 삭제하면 토벌은 실패해야 맞다. 토벌 보상/벌금은 occupation lock 이후 진행되므로 중복 지급되지 않는다.
- `war/overview`와 동시 실행:
  - 표시용 read는 잠금 없음이라 순간적으로 이전 시즌 점령이 보일 수 있다. 응답에 `seasonId`를 포함하고 클라가 새로고침하면 해결된다.
- 보상 중복:
  - `war_season_rewards` PK와 `war_seasons.settled_at is null` 조건으로 보상 행 중복 생성을 막는다.
- occupation row 삭제 vs null 업데이트:
  - 현재 의미론은 "row 없음 = NPC 운영"이다. 리셋은 `occupied_by_user_id = null`, `occupied_by_guild_id = null` 업데이트가 아니라 row 삭제를 사용한다.
  - null 업데이트를 쓰면 `outpost_occupations`에 행이 남아 `war/overview`, `occupations`, `claim`의 `stillHasOccRow` 분기에서 "점령된 적 있는 빈 row"가 점령 상태처럼 취급될 수 있다. 특히 `claim`의 공성 분기는 `stillHasOccRow` 기준으로 움직이므로 빈 row가 있으면 NPC 단판 점령이 아니라 성벽 타격으로 오작동할 수 있다.

### 리스크/기존 충돌

- 기존 `outpostClaimAttempts.won`은 플레이어 공격과 NPC 공격에서 의미가 다르다. 점수 산정에 직접 쓰지 않는다.
- 기존 `recentCaptures`는 `occupiedAt` 기준이라 리셋 삭제 후 사라진 거점은 표시되지 않는다. 시즌 결과 화면은 새 테이블에서 읽어야 한다.
- 기존 금고(`outpost_treasury`)는 리셋해도 0으로 만들지 않는다. 금고는 NPC 운영 거점의 전쟁 유인으로 유지한다. 단, 리셋 직전 점령자가 있던 활성 거점은 점령 중 세금이 금고에 쌓이지 않아 보통 영향이 작다.
- 기존 보호막(`protectedUntil`)은 row 삭제와 함께 사라진다. 새 시즌 중립 리셋 직후에는 보호막 없이 첫 점령이 가능해야 한다.

## PR-3 eject 현상금/벌금

### 목표

- 점령 길드원이 침입자 토벌에 승리하면 침입자의 개인 골드에서 벌금을 차감하고 토벌자에게 현상금으로 지급한다.
- 대상은 골드만이다. 재료, 장비, 길드 골드는 건드리지 않는다.
- 침입자 골드가 부족하면 가능한 만큼만 이전한다.

### 스키마 변경

- 새 테이블은 필수 아님. MVP는 `character.v2.gold` 원자 업데이트와 기존 피드/알림만으로 처리한다.
- 추적/감사를 강화하려면 `0056` 후보:
  - `outpost_eject_bounties`
    - `id serial primary key`
    - `outpost_id text not null`
    - `hunter_user_id text references users(id) on delete set null`
    - `target_user_id text references users(id) on delete set null`
    - `target_gold_before integer not null`
    - `penalty_gold integer not null`
    - `created_at timestamp not null default now()`
    - indexes `(target_user_id, created_at)`, `(hunter_user_id, created_at)`
- 감사 테이블은 점수/보상 원장과 별개다. PR-3 MVP에서는 생략 가능하다.

### 라우트/크론 변경

- `src/app/api/v2/outpost/eject/route.ts`
  - 이미 `ids = [userId, targetUserId].sort()`로 양쪽 `character.v2`를 잠근다. 이 잠금 안에서 양쪽 골드를 같이 수정한다.
  - `won`일 때만:
    - `targetGold = max(0, defenderSave.gold ?? 0)`
    - `penalty = min(targetGold, bountyFormula(targetGold, outpostTier))`
    - 침입자 저장에서 `gold: targetGold - penalty`
    - 토벌자 저장에서 `gold: hunterGold + penalty`
  - 패배 시 골드 변동 없음.
  - 응답에 `bountyGold`, `targetPenaltyGold`를 추가한다.
  - 알림 payload에도 `bountyGold`를 추가할 수 있다.

### 신규 상수/공식

- `EJECT_BOUNTY_BASE_GOLD = 50`
- `EJECT_BOUNTY_TIER_MULT = { 1: 1, 2: 1.4, 3: 1.8, 4: 2.5 }`
- `EJECT_BOUNTY_TARGET_GOLD_PCT = 0.05`
- `EJECT_BOUNTY_MAX_GOLD = 500`
- `raw = round(EJECT_BOUNTY_BASE_GOLD * tierMult + targetGold * EJECT_BOUNTY_TARGET_GOLD_PCT)`
- `penalty = clamp(raw, 0, min(targetGold, EJECT_BOUNTY_MAX_GOLD))`
- 침입자가 가진 골드보다 더 벌금을 부과하지 않는다. 음수 골드 금지.

### 리스크/기존 충돌

- `eject`는 현재 `lastHuntedOutpost` 제거와 `ejectedFrom` 기록을 같은 저장에서 한다. 골드 변경도 같은 객체에 넣어야 하며, destructure로 `lastHuntedOutpost` 제거할 때 `gold`를 실수로 누락하지 않게 테스트가 필요하다.
- 토벌자가 승리했지만 침입자 골드가 0이면 현상금도 0이다. 서버 피드 문구가 "현상금 획득"을 무조건 말하면 안 된다.
- 침입자 골드 벌금은 PvP 패배 페널티라 체감이 크다. 시작값은 낮게 두고 `EJECT_BOUNTY_MAX_GOLD`로 상한을 강하게 둔다.
- 같은 침입자를 동시에 토벌하는 레이스는 양쪽 캐릭터 저장 row lock 때문에 직렬화된다. 첫 토벌이 `lastHuntedOutpost`를 제거하면 두 번째는 `intruder_inactive`가 되어 중복 벌금이 나가지 않는다.

## PR-4 도전자 보너스

### 목표

- 거점이 적은 길드가 거점이 많은 길드를 공격할 때 전투력 보너스 +10~15%를 받는다.
- 보너스는 공격 성공 가능성을 조금 올리는 장치이지, 점수 자체를 직접 올리는 장치가 아니다.
- 자동 단판/토너먼트 환경에서 독점 길드의 방어 안정성을 낮춘다.

### 스키마 변경

- 없음.

### 라우트/크론 변경

- `src/app/api/v2/outpost/claim/route.ts`
  - PvP 공격일 때 `attackerGuildId`와 `defenderGuildId`의 현재 점령 수를 계산한다.
  - NPC 미점령 거점 점령에는 보너스를 적용하지 않는다.
  - `useTournament` 분기 전후 모두 동일 보너스를 적용해야 한다.
- `src/lib/server/v2RunTournament.ts`
  - `runTournamentForGuilds(tx, attackerIds, defenderIds, opts?)` 형태로 확장하고, attacker 쪽 멤버 player stat에 보너스를 적용한다.
  - 1v1 분기는 `claim` 내부에서 `playerForBattle` 또는 `attackerStanced`에 적용한다.
- 적용 위치:
  - `derivePowerScore` 기반 수비 전투력 게이트에는 적용하지 않는다. 그 게이트는 왕국/NPC 난이도 제한이고, 도전자 보너스는 길드 간 PvP 보정이다.
  - 실제 `resolveBattlePvP`에 들어가는 `atk`, `magicAtk`, `def`, `maxHp` 중 공격 측 체감이 큰 값을 제한적으로 올린다.

### 신규 상수/공식

- `CHALLENGER_BONUS_MIN = 0`
- `CHALLENGER_BONUS_MAX = 0.15`
- `CHALLENGER_BONUS_STEP = 0.025`
- `CHALLENGER_BONUS_START_DIFF = 1`
- `diff = defenderOwnedCount - attackerOwnedCount`
- `bonusPct = diff >= 1 ? min(CHALLENGER_BONUS_MAX, 0.10 + (diff - 1) * CHALLENGER_BONUS_STEP) : 0`
  - 차이 1개: 10%
  - 차이 2개: 12.5%
  - 차이 3개 이상: 15%
- stat 적용:
  - `atk`, `magicAtk`: `round(value * (1 + bonusPct))`
  - `maxHp`와 현재 `hp`: `round(value * (1 + bonusPct * 0.5))`
  - `def`, `spd`는 그대로 둔다. 전투가 지나치게 길어지거나 선턴 메타가 뒤집히는 것을 피한다.
- 응답:
  - `challengerBonusPct`
  - `attackerOwnedCount`
  - `defenderOwnedCount`

### 리스크/기존 충돌

- `claim`은 이미 수비 길드 금고 자동 수리와 성벽 HP를 가진다. 보너스가 너무 크면 성벽 시스템을 우회해 연속 함락이 쉬워진다. 최대 15%를 넘기지 않는다.
- 토너먼트에서는 멤버 2명 이상일 때만 `runTournamentForGuilds`를 쓴다. 1인 길드 vs 다인 길드, 다인 길드 vs 1인 길드에서는 기존 1v1 분기라 보너스 적용 경로가 둘로 갈라진다.
- 점령 수 계산은 시즌 활성 거점만 볼지 전체 occupation을 볼지 결정해야 한다. PR-4는 "전쟁 독점" 완화를 목표로 하므로 활성 쟁탈 거점 occupation만 카운트한다. 전체 96개 점령 상태를 세면 비전쟁 장식 점령이 보너스에 끼어든다.

## PR-5 워프

### 목표

- 발견한 거점만 워프 허용한다.
- 서버 권위는 `character.v2.discoveredOutpostIds`다.
- 기존 인접 이동은 유지하고, 워프는 별도 의도(`travelMode: "warp"`)로만 처리한다.

### 스키마 변경

- 없음. 기존 `character.v2.discoveredOutpostIds` 사용.

### 라우트/크론 변경

- `src/app/api/v2/me/visit-outpost/route.ts`
  - body를 `{ outpostId, mode?: "adjacent" | "warp" }`로 확장한다. 미지정은 기존 호환을 위해 `"adjacent"`.
  - `"adjacent"`는 현재처럼 `canMoveToOutpost(savedId, outpostId)`와 `OUTPOST_MOVE_COST`.
  - `"warp"`는 다음 조건:
    - `outpostId`가 `discoveredOutpostIds`에 있어야 한다.
    - 미발견이면 `not_discovered` 400.
    - 스태미너 비용은 인접 이동보다 높게 책정하거나 무료 정책을 명시한다.
    - 워프 후에도 `expandDiscovery`를 호출해 방문 거점 주변을 갱신한다.
- `src/adventure/v2/ContinentMap.tsx`
  - 발견된 비인접 거점 클릭 시 "워프" 액션을 노출한다.
  - 미발견 거점은 기존처럼 비활성/흐림.
  - 전쟁 모드의 공격 버튼은 워프와 분리한다. 공격 가능성은 여전히 현재 위치/인접 기준이다.
- `src/adventure/v2/V2AdventureHome.tsx`
  - `onTravelTo`가 경로 자동 이동인지 워프인지 구분할 수 있게 호출부를 분리한다.

### 신규 상수/공식

- `OUTPOST_WARP_COST = 3 * OUTPOST_MOVE_COST`
- 같은 거점 재진입은 mode와 무관하게 무료.
- 절대 중립 시작 거점은 신규 캐릭터 시드 발견(`seededDiscovery`)에 포함되어야 한다. 기존 `seededDiscovery()`가 시작 거점과 인접을 반환하므로 유지한다.

### 리스크/기존 충돌

- 현재 `visit-outpost`는 비인접 이동을 무조건 `not_adjacent`로 막는다. 워프를 같은 라우트에 넣으면 `mode` 분기 순서가 중요하다. `mode === "warp"`일 때는 `canMoveToOutpost`보다 발견 게이트를 먼저 검사해야 한다.
- `claim`의 공격 게이트는 `lastVisitedOutpost` 기준 현재/인접만 허용한다. 워프가 생기면 공격자가 전장 근처로 즉시 이동할 수 있지만, 공격 자체는 여전히 인접 제한을 받는다.
- `discoveredOutpostIds`가 비어 있는 레거시 세이브는 `expandDiscovery`가 시드를 채운다. 워프 검사도 비어 있으면 `seededDiscovery()`를 기준으로 판단해야 신규/레거시가 막히지 않는다.

## PR-6 길드 정원 8~10

### 목표

- 길드 정원을 3명에서 8~10명으로 올린다.
- 전투 라인업은 3명 유지한다. 정원 확대가 곧 8v8/10v10 전투로 번지면 PR 범위가 커진다.
- 길드 전원 알림, 초대/신청 수락, UI 카운터가 새 정원을 일관되게 표시해야 한다.

### 스키마 변경

- 없음. `guild_members`는 `(guild_id, user_id)` PK이며 정원 제한은 앱 로직이다.

### 라우트/크론 변경

- `src/adventure/data/guild.ts`
  - `GUILD_MAX_MEMBERS = 10` 또는 운영 보수값 `8`.
  - 권장 MVP는 8명이다. 18명 규모에서는 10명 정원이 2개 길드로 수렴할 위험이 있다. 100명 천장에서는 10명이 적합하다.
- 기존 정원 검사 라우트:
  - `src/app/api/guilds/[id]/invite/route.ts`
  - `src/app/api/guilds/[id]/requests/route.ts`
  - `src/app/api/guilds/invites/[inviteId]/accept/route.ts`
  - `src/app/api/guilds/requests/[requestId]/accept/route.ts`
  - `src/app/api/guilds/browse/route.ts`
  - 위 파일들은 상수를 import하므로 상수 변경으로 서버 제한은 대체로 따라온다.
- UI 하드코딩:
  - `src/adventure/v2/V2GuildHome.tsx`의 `/3`, 정원 안내 문구를 `GUILD_MAX_MEMBERS` 기반으로 변경.
  - `src/app/manual/content/guild.tsx`의 정원 3명 문구 변경.
  - `src/lib/server/v2Notifications.ts`, `src/app/api/v2/outpost/claim/route.ts` 주석의 "정원 3"은 동작 영향은 없지만 오해 방지를 위해 정리.
- 라인업:
  - `src/app/api/v2/guild/me/lineup/route.ts`의 `MAX_LINEUP = 3` 유지.
  - `src/lib/server/v2RunTournament.ts`의 `MAX_LINEUP = 3` 유지.
  - UI에 "길드 정원 8/10, 전투 라인업 3"을 분리 표기한다.

### 신규 상수/공식

- `GUILD_MAX_MEMBERS = 8`으로 시작, 라이브가 50명 이상이면 10으로 올릴 수 있게 문서화.
- 별도:
  - `GUILD_WAR_LINEUP_MAX = 3`
  - 기존 `MAX_LINEUP` 중복 상수는 가능하면 `src/adventure/data/guild.ts` 또는 새 `src/adventure/data/v2/guildWar.ts`로 통합한다.

### 리스크/기존 충돌

- 정원 10명은 현재 18명 규모에서 양대 길드 구도를 만들 수 있다. 전쟁 점수 독점 방지와 반대로 작동할 수 있으므로 PR-6은 PR-2 점수 캡, PR-4 도전자 보너스 이후 배포하는 편이 낫다.
- 길드 전원 알림은 현재 정원 3이라 순차 insert로 충분하다는 주석이 있다. 10명도 기술적으로 문제는 작지만, 여러 거점 피격 알림이 동시에 나가면 알림량이 늘어난다. 기존 `WAR_NOTIF_DEBOUNCE_MS` 유지가 필요하다.
- 길드 브라우저/초대/신청은 v2 경로가 아니라 `/api/guilds/*`도 함께 사용한다. v2 전쟁 PR이어도 일반 길드 API를 놓치면 정원 UI와 실제 수락이 불일치한다.

## PR-7 순서/의존성 + MVP 묶음

### 목표

- 리스크가 큰 스키마/크론/전투 밸런스 변경을 작게 나눠 배포한다.
- MVP는 "활성 쟁탈 거점 + 주간 리셋 + 점수 원장 + 워프 발견 게이트"까지로 잡고, 경제 보상과 정원 확대는 뒤로 미룰 수 있게 한다.

### 권장 순서

1. PR-1 쟁탈거점 다이얼
   - 활성 거점 게이트와 전황 응답 필드 추가.
   - 점수/보상 없이도 전장 표면을 줄이는 효과가 있다.
2. PR-2 주간 시즌 + 점수 + 결산 크론
   - `0054`가 PR-1에서 쓰이면 PR-2는 `0055`, 아니면 PR-2가 `0054`부터 시작한다. 병렬 브랜치가 있으면 머지 직전 마이그레이션 번호를 다시 확인한다.
   - occupation 삭제 리셋과 보상 멱등성을 먼저 검증한다.
3. PR-5 워프
   - 전쟁 참여 접근성을 올리지만 전투 공식을 건드리지 않는다.
   - 발견 게이트가 이미 있으므로 스키마 없이 배포 가능하다.
4. PR-4 도전자 보너스
   - 점수/리셋 데이터가 쌓인 뒤 조정한다.
   - 보너스는 전투 승률에 직접 영향을 주므로 관측 가능한 전황 로그 이후 배포한다.
5. PR-3 eject 현상금/벌금
   - 골드 경제와 PvP 패널티를 건드리므로 점수 안정화 후 배포한다.
6. PR-6 길드 정원 8~10
   - 커뮤니티 구조를 바꾸는 변경이다. 전쟁 독점 완화 장치가 먼저 있어야 한다.

### MVP 묶음

- MVP-A:
  - PR-1 + PR-2 일부
  - 활성 쟁탈 거점 1~2개, 주간 중립 리셋, 점수 원장, 결산은 관리자 확인용 응답까지만.
- MVP-B:
  - MVP-A + PR-5
  - 발견 거점 워프로 전장 접근성 확보.
- MVP-C:
  - MVP-B + PR-4
  - 도전자 보너스 적용과 승률 관측.
- 후속:
  - PR-3, PR-6

### 공통 테스트 요구

- `warSeason` 시간 계산:
  - 일요일 14:59 UTC는 이전 시즌.
  - 일요일 15:00 UTC는 새 KST 월요일 00:00 시즌.
  - KST 기준 월요일 00:00 경계값.
- 활성 거점 다이얼:
  - 18명 => 2개.
  - 1명/0명 => 1개.
  - 100명 이상 => 10개.
  - manual override가 자동값보다 우선.
- occupation 리셋:
  - active outpost occupation은 삭제된다.
  - inactive/non-contestable occupation은 건드리지 않는다.
  - 삭제 후 `claim`은 NPC 단판 점령 경로로 들어간다.
  - null 업데이트를 쓰지 않았음을 테스트한다.
- 점수:
  - 같은 길드/같은 거점 capture 1회 100%, 2회 40%, 3회 0%.
  - siege 점수 주간 캡.
  - 유지시간만으로는 점수 증가 없음.
  - NPC 공격 로그는 점수로 집계되지 않음.
- 크론 멱등:
  - 같은 시즌 rollover 2회 호출해도 보상/삭제/다음 active가 중복되지 않음.
  - `war_season_rewards` PK 충돌 없이 no-op 처리.
- 워프:
  - 발견 거점 warp 성공.
  - 미발견 거점 `not_discovered`.
  - 인접 이동 기존 동작 유지.
  - 빈 `discoveredOutpostIds` 레거시 세이브는 `seededDiscovery()`로 판단.
- eject:
  - 침입자 골드 0이면 현상금 0.
  - 골드 부족 시 가진 만큼만 이전.
  - 동시 토벌 두 번째 요청은 `intruder_inactive`.
- 길드 정원:
  - 초대 발송, 초대 수락, 신청, 신청 수락 모두 새 정원 기준.
  - 라인업은 여전히 1~3명만 허용.

### 기존 충돌 체크리스트

- `src/app/api/v2/outpost/claim/route.ts`
  - occupation lock 순서 유지: occupation -> character.v2 -> treasury/adventure-log -> guild_resources.
  - 시즌 점수 insert는 character lock 이후여도 되지만, guild_resources와 교착하지 않게 독립 테이블 insert/upsert로 끝낸다.
- `src/app/api/v2/cron/npc-attacks/route.ts`
  - 리셋과 같은 occupation 삭제 의미론을 공유한다.
  - 같은 분 실행 금지. `deploy/crontab.txt`에서 war rollover는 정각을 피한다.
- `src/app/api/v2/war/overview/route.ts`
  - 기존 전체 전황과 시즌 전황을 분리한다. 클라가 기존 필드를 기대하므로 additive 응답으로 한다.
- `src/lib/server/v2RunTournament.ts`
  - 도전자 보너스가 들어가도 `MAX_LINEUP = 3`은 정원 변경과 별개로 유지한다.
- `src/adventure/data/guild.ts`
  - 정원 상수 변경은 일반 `/api/guilds/*`와 v2 UI 모두에 영향이 있다.
