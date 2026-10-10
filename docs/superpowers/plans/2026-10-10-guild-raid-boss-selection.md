# 길드 토벌전 보스 선택 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 길드마스터·관리자가 매주 토벌 보스(흉포한 산군 / 토벌 전용 재앙의 스콜피온 킹)를 고르고, 보스별로 순위·보상을 따로 정산한다.

**Architecture:** 주간 이벤트는 한 주 하나로 유지하고, `guild_raid_guild_scores` 행에 `boss_kind`를 저장한다(행 존재 = 선택 완료·변경 불가). 토벌 보스 정의는 협동 `COOP_BOSSES`와 분리된 `GUILD_RAID_BOSSES` 레지스트리에 둔다. 순위는 `partition by boss_kind`, 정산 때 `reward_tier`(standard/bonus/floor)를 저장한다.

**Tech Stack:** Next.js 16 App Router, Drizzle ORM(PostgreSQL), Vitest, React Testing Library.

**Spec:** `docs/superpowers/specs/2026-10-10-guild-raid-boss-selection-design.md`

## Global Constraints

- 작업 공간: `/tmp/wt-guild-raid-boss`, 브랜치 `feat/guild-raid-boss-selection`. 배포 금지.
- 토벌 보스 ID: `"mountain_chief_hard" | "canyon_predator_raid"`. 기본값 `GUILD_RAID_DEFAULT_BOSS_ID = "mountain_chief_hard"`.
- 협동 보스(`COOP_BOSSES`, 협동 보상·상점·소환) 코드는 바꾸지 않는다.
- 산군 1단계 체력 `1_200_000`, 단계 성장 `GUILD_RAID_STAGE_HP_GROWTH = 1.25` 유지.
- 보상: standard = `guildRaidRewardForRank(rank)`, bonus = 그 2배(골드·증명서 모두), floor = `{ gold: 500_000, masteryCertificates: 50 }`.
- 선택 권한: `isGuildMasterOrManager` (`src/lib/server/guildAdmin.ts`). 선택은 `active` 기간에만, 한 번만.
- 선택 전 공격 불가(`boss_not_selected`). 자동 기본값 없음.
- 플레이어 노출 문구에 "v2" 금지, 마크다운·대시 장식 금지. 화면 표면은 `SURFACE_CARD`/`SURFACE_INSET`, 컨테이너 `opacity-*` 금지.
- 각 Task는 회귀 테스트 먼저. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 테스트 실행: `npx vitest run <path>`. 타입: `npx tsc --noEmit -p .`. 린트: `npx eslint <paths>`.

## Review Focus

- 관리자 두 명이 동시에 다른 보스를 선택 → 먼저 커밋된 하나만 남고 다른 쪽은 `already_selected` + 실제 선택값을 받는다(Task 5 테스트).
- 선택 직후 첫 공격 전에 길드원이 연습만 한 경우 → 연습은 선택에 영향 없음, 공격은 고른 보스로(Task 6·7 테스트).
- 기존 주(마이그레이션 이전) 정산 행 수령 → `boss_kind` 기본값 산군, `reward_tier` NULL은 standard로 지급(Task 7 테스트).
- 다른 보스 순위표를 보다가 우리 길드 순위 → `?board=`가 우리 보스와 다르면 `guild.rank`는 여전히 우리 보스 묶음 기준(Task 7 테스트).
- 미선택 길드가 공격 요청 → 전투 시뮬을 돌리지 않고 `boss_not_selected`(Task 6 테스트, simulate 호출 0회).

---

### Task 1: 토벌 보스 레지스트리와 순수 로직

**Files:**
- Create: `src/adventure/data/v2/guildRaidBosses.ts`
- Create: `src/adventure/data/v2/guildRaidBosses.test.ts`
- Modify: `src/adventure/data/v2/guildRaid.ts`
- Modify: `src/adventure/data/v2/guildRaid.test.ts`

**Interfaces:**
- Produces (guildRaidBosses.ts):
  - `type GuildRaidBossId = "mountain_chief_hard" | "canyon_predator_raid"`
  - `GUILD_RAID_BOSS_IDS: readonly GuildRaidBossId[]` (순서: 산군, 스콜피온)
  - `GUILD_RAID_DEFAULT_BOSS_ID: GuildRaidBossId = "mountain_chief_hard"`
  - `type GuildRaidBossDef = { id; definition: CoopBossKind; stageBaseHp: number; rewardMultiplier: 1 | 2; bonusMinGuildDamage: number | null }`
  - `GUILD_RAID_BOSSES: Record<GuildRaidBossId, GuildRaidBossDef>`
  - `parseGuildRaidBossId(raw: unknown): GuildRaidBossId | null` (own-key 검사)
- Produces (guildRaid.ts):
  - `guildRaidMaxHp(bossId: GuildRaidBossId, stage: number): number` (기존 1-인자 시그니처 대체)
  - `type GuildRaidRewardTier = "standard" | "bonus" | "floor"`
  - `resolveGuildRaidRewardTier(bossId: GuildRaidBossId, guildDamage: number): GuildRaidRewardTier`
  - `guildRaidRewardFor(rank: number, tier: GuildRaidRewardTier): GuildRaidReward`
  - `parseGuildRaidRewardTier(raw: unknown): GuildRaidRewardTier` (NULL·알 수 없는 값 → `"standard"`)
  - `rankGuildRaidScoresByBoss<T extends { guildId: number; damage: number; bossKind: GuildRaidBossId }>(rows: readonly T[]): Array<T & { rank: number }>` — 보스별로 묶어 각 묶음에 `rankGuildRaidScores` 적용
  - `GUILD_RAID_PILOT_BOSS_KIND` 제거

- [ ] **Step 1: 실패 테스트 작성**

`guildRaidBosses.test.ts`:
- `parseGuildRaidBossId("canyon_predator_raid")` → 그대로, `"toString"`·`"canyon_predator_hard"`·`1` → `null`
- `GUILD_RAID_BOSSES.mountain_chief_hard.definition === COOP_BOSSES.mountain_chief_hard`, `stageBaseHp === 1_200_000`, `rewardMultiplier === 1`, `bonusMinGuildDamage === null`
- 스콜피온: `definition.name === "재앙의 스콜피온 킹"`, `definition.base.image === COOP_BOSSES.canyon_predator_hard.base.image`, `definition.anchorDepth > COOP_BOSSES.canyon_predator_hard.anchorDepth`, `rewardMultiplier === 2`, `bonusMinGuildDamage > 0`
- 협동 원본 불변: `COOP_BOSSES.canyon_predator_hard.anchorDepth === 78`

`guildRaid.test.ts` 추가:
- `guildRaidMaxHp("mountain_chief_hard", 1) === 1_200_000`, `(…, 2) === 1_500_000`
- `guildRaidMaxHp("canyon_predator_raid", 1) === GUILD_RAID_BOSSES.canyon_predator_raid.stageBaseHp`
- `resolveGuildRaidRewardTier("mountain_chief_hard", 0) === "standard"`; 스콜피온 기준값 정확히 → `"bonus"`, 기준값-1 → `"floor"`
- `guildRaidRewardFor(1, "bonus")` → `{ gold: 10_000_000, masteryCertificates: 1_000 }`; `guildRaidRewardFor(1, "floor")` → `{ gold: 500_000, masteryCertificates: 50 }`; `guildRaidRewardFor(2, "standard")` → `{ gold: 3_000_000, masteryCertificates: 300 }`
- `parseGuildRaidRewardTier(null) === "standard"`, `("bonus") === "bonus"`
- `rankGuildRaidScoresByBoss`: 산군 길드 A(100)·B(50), 스콜피온 길드 C(10) → A 1위, B 2위, C 1위
- 기존 `applyGuildRaidDamage` 테스트에서 기본 `maxHpForStage` 의존 부분은 명시 콜백으로 바꾼다

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildRaid.test.ts src/adventure/data/v2/guildRaidBosses.test.ts` → FAIL(모듈 없음)

- [ ] **Step 3: 구현**

스콜피온 토벌판 초기 수치(Task 3에서 시뮬로 확정):
```ts
const CANYON_PREDATOR_RAID: CoopBossKind = {
  ...COOP_BOSSES.canyon_predator_hard,
  anchorDepth: 100,
  // 토벌 전투는 매 판 HP 100%에서 시작해 발악이 걸리지 않으므로 두 발악을 처음부터 굽는다.
  enrageStages: COOP_BOSSES.canyon_predator_hard.enrageStages.map((s) => ({ ...s, hpFraction: 1 })),
  traits: [...] // 원본 문구 + "토벌 전용: 모래폭풍과 갑각 붕괴 상태로 시작"
};
```
`stageBaseHp` 초기 `480_000`, `bonusMinGuildDamage` 초기 `10_000_000`. `applyGuildRaidDamage`의 세 번째 인자는 필수로 바꾼다(기본값이 보스를 모르므로).

- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS. `npx tsc --noEmit -p .`는 호출부 오류가 남는 것이 정상(Task 4~7에서 해결). 오류 목록이 `guildRaidLifecycle`, `guildRaidAttack`, `guildRaidRead`, `guildRaidBattle`, `guildRaidPractice` 및 클라이언트 파일로 한정되는지만 확인.

- [ ] **Step 5: 커밋** — `feat: 길드 토벌전 보스 레지스트리와 보스별 체력·보상 구간 계산`

---

### Task 2: 토벌 전투 순수 함수 분리와 시뮬 스크립트

**Files:**
- Modify: `src/lib/server/guildRaidBattle.ts`
- Modify: `src/lib/server/guildRaidBattle.test.ts`
- Create: `scripts/sim-guild-raid-boss.ts`
- Modify: `scripts/sim-live-top-combat.ts` (`loadTopPlayers`, `SimPlayer` export만)
- Modify: `package.json` (스크립트 `sim:guild-raid-boss`)

**Interfaces:**
- Consumes: `GUILD_RAID_BOSSES`, `GuildRaidBossId` (Task 1)
- Produces:
  - `resolveGuildRaidBattle(input: { bossId: GuildRaidBossId; player: PlayerCombat; playerMaxHp: number; skills: V2SkillsState; playerName: string }): GuildRaidBattleResult` — DB 없이 현재 `simulateRaidBattle`의 `resolveBattle` 호출부를 그대로 옮긴 것
  - `simulateGuildRaidBattle({ tx, userId, bossId, lockForUpdate? })` — 인자 `bossKind: CoopBossKindId` → `bossId: GuildRaidBossId`. 보스 Monster는 `GUILD_RAID_BOSSES[bossId].definition`으로 만든다

- [ ] **Step 1: 실패 테스트** — `guildRaidBattle.test.ts`에 `resolveGuildRaidBattle`을 같은 플레이어로 두 보스에 돌려 `replay.enemy.name`이 각각 `"흉포한 산군"`, `"재앙의 스콜피온 킹"`이고 `damageDealt >= 0`인지 검사. 기존 mock 기반 테스트는 `bossId` 인자로 갱신.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildRaidBattle.test.ts` → FAIL
- [ ] **Step 3: 구현** — `simulateRaidBattle`은 저장 읽기·actor 준비 후 `resolveGuildRaidBattle` 호출만 남긴다.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 시뮬 스크립트 작성**

`scripts/sim-guild-raid-boss.ts`: `loadTopPlayers(pool)`로 상위 20명을 읽고, 보스마다 `TRIALS = 20`회 seed 고정(`withSeededRandom` 패턴은 `sim-live-top-combat.ts`의 `seededRandom` 재사용)으로 `resolveGuildRaidBattle` 실행. 출력(식별 정보 제외):
- 캐릭터별: 순위, 직업, 산군 피해 중앙값, 스콜피온 피해 중앙값, 비율, 스콜피온 사망률
- 요약: 비율 중앙값, 스콜피온 사망 캐릭터 비율(사망률 50% 이상인 캐릭터 수/20), 1위 사망률, 스콜피온 1회 피해 중앙값, 제안 `stageBaseHp = round(1_200_000 × 비율중앙값, -4)`, 제안 `bonusMinGuildDamage = round(스콜피온피해중앙값 × 30, -4)`

`package.json`: `"sim:guild-raid-boss": "NODE_PATH=./scripts/server-only-stub node --env-file=.env.production --import tsx scripts/sim-guild-raid-boss.ts"`.

- [ ] **Step 6: 로컬 구동 확인** — `DATABASE_URL` 없이 실행 시 `DATABASE_URL is required`로 종료하는지 확인(`NODE_PATH=./scripts/server-only-stub node --import tsx scripts/sim-guild-raid-boss.ts`).
- [ ] **Step 7: 커밋** — `feat: 길드 토벌전 전투 순수 함수 분리와 보스 난이도 시뮬`

---

### Task 3: 운영 상위 유저 시뮬로 스콜피온 수치 확정

**Files:**
- Modify: `src/adventure/data/v2/guildRaidBosses.ts`

- [ ] **Step 1: 오너 허락 받기** — 운영 EC2에서 읽기 전용 시뮬을 실행해도 되는지 묻는다. 허락 전에는 Task 4 이후를 먼저 진행한다.
- [ ] **Step 2: 실행** — EC2에서 브랜치 파일을 임시 디렉터리에 올려 `node --env-file=/run/adventure-rpg/production.env --env-file=.env.production` 방식으로 실행(배포 디렉터리 변경 금지, 메모 `ops-ec2-access-and-cron` 참고).
- [ ] **Step 3: 조정** — 목표: 비율 중앙값 ≤ 0.40, 사망 캐릭터 ≥ 10/20, 1위 사망률 > 0. 미달이면 `anchorDepth`(5 단위)와 `base`의 `atk`·`def`·`evasionPct` 덮어쓰기로 조정 후 재실행. 과도하면(비율 < 0.2 또는 1위 사망률 100%) 완화.
- [ ] **Step 4: 확정값 반영** — 시뮬이 제안한 `stageBaseHp`, `bonusMinGuildDamage`와 최종 덮어쓰기 수치를 넣고, 근거 주석 한 줄(날짜·비율·사망 수) 추가. Task 1 테스트 재실행 PASS.
- [ ] **Step 5: 커밋** — `balance: 토벌 전용 스콜피온 킹 난이도·단계 체력·2배 보상 기준 확정`

---

### Task 4: 마이그레이션과 수명주기(보스별 순위·정산)

**Files:**
- Modify: `src/db/schema.ts` (guildRaidGuildScores, guildRaidAttackLogs)
- Create: `drizzle/0189_guild_raid_boss_selection.sql` (+ `drizzle/meta` 갱신, `npm run db:generate`로 생성 후 백필 SQL 추가)
- Modify: `src/lib/server/guildRaidLifecycle.ts`
- Modify: `src/lib/server/guildRaidLifecycle.test.ts`

**Interfaces:**
- Consumes: `rankGuildRaidScoresByBoss`, `resolveGuildRaidRewardTier`, `parseGuildRaidBossId`, `GUILD_RAID_DEFAULT_BOSS_ID`, `guildRaidMaxHp` (Task 1)
- Produces:
  - schema: `guildRaidGuildScores.bossKind` (`boss_kind` text not null default `'mountain_chief_hard'`), `.selectedByUserId` (`selected_by_user_id` text null), `.selectedAt` (`selected_at` timestamp null), `.rewardTier` (`reward_tier` text null, CHECK in standard/bonus/floor); 인덱스 `guild_raid_guild_scores_rank_idx`를 `(event_id, boss_kind, damage desc)`로 교체; `guildRaidAttackLogs.bossKind` (`boss_kind` text not null default `'mountain_chief_hard'`)
  - `GuildRaidScoreRecord`에 `bossKind: GuildRaidBossId; rewardTier: GuildRaidRewardTier | null` 추가
  - store: `countScores(eventId, bossId)`, `listRankedScoresPage(eventId, bossId, offset, limit)`, `findRankedScore(eventId, guildId)` (조회 길드의 보스 묶음 기준 순위)
  - `buildGuildRaidViewerRankQuery(database, eventId, guildId)` — `rank() over (partition by "boss_kind" order by "damage" desc)`
  - `readGuildRaidLeaderboard(eventId, bossId, viewerGuildId, requestedPage)` — 인자 순서 변경
  - 정산 build: `scores`에 `finalRank`와 `rewardTier` 채움, store가 `reward_tier`도 저장

- [ ] **Step 1: 실패 테스트** — `guildRaidLifecycle.test.ts`:
  - MemoryStore를 새 시그니처로 갱신(묶음은 `rankGuildRaidScoresByBoss`)
  - 쿼리 문자열 테스트 기대값 `'rank() over (partition by "boss_kind" order by "damage" desc) as "rank"'`
  - 정산: 산군 A(20)·B(10), 스콜피온 C(기준 이상)·D(기준 미만, >0) → A `finalRank 1/standard`, B `2/standard`, C `1/bonus`, D `2/floor`
  - 피해 0 길드는 `finalRank null`, `rewardTier null` (기존 동작 유지)
  - `readGuildRaidLeaderboard(eventId, "canyon_predator_raid", A.guildId)` → rows는 C·D만, viewer는 A의 산군 묶음 1위
  - 새 이벤트 `bossKind === "mountain_chief_hard"`, `maxHp === 1_200_000`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildRaidLifecycle.test.ts` → FAIL
- [ ] **Step 3: 스키마·마이그레이션** — schema 수정 후 `npm run db:generate -- --name guild_raid_boss_selection`, 생성된 SQL 끝에 `UPDATE "guild_raid_guild_scores" SET "reward_tier" = 'standard' WHERE "final_rank" IS NOT NULL AND "reward_tier" IS NULL;` 추가(재실행 안전). `npm run check-migrations` PASS.
- [ ] **Step 4: 수명주기 구현** — 위 Interfaces대로. `toScoreRecord`는 `parseGuildRaidBossId(row.bossKind) ?? GUILD_RAID_DEFAULT_BOSS_ID`, `rewardTier`는 NULL 유지.
- [ ] **Step 5: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 6: 커밋** — `feat: 길드 토벌전 보스별 순위·정산과 보상 구간 저장`

---

### Task 5: 보스 선택 API

**Files:**
- Create: `src/lib/server/guildRaidSelect.ts`
- Create: `src/lib/server/guildRaidSelect.test.ts`
- Create: `src/app/api/v2/guild/raid/select/route.ts`
- Create: `src/app/api/v2/guild/raid/select/route.test.ts`

**Interfaces:**
- Consumes: `parseGuildRaidBossId`, `guildRaidMaxHp`, `guildRaidPhase` (Task 1), `ensureCurrentGuildRaid`, `isGuildMasterOrManager`
- Produces:
  - `type GuildRaidSelectError = "no_guild" | "forbidden" | "event_ended" | "bad_boss" | "already_selected"`
  - `resolveGuildRaidSelection(input: { now: Date; event: { status: string; endsAt: Date }; canManage: boolean; bossId: GuildRaidBossId | null; existing: { bossKind: GuildRaidBossId } | null }): { ok: true } | { ok: false; error: GuildRaidSelectError; selected?: GuildRaidBossId }` — 검사 순서: forbidden → event_ended → bad_boss → already_selected
  - `selectGuildRaidBoss({ userId, bossId: unknown, now? }): Promise<{ ok: true; bossId: GuildRaidBossId; selectedAt: number } | { ok: false; error: GuildRaidSelectError; selected?: GuildRaidBossId }>` — 트랜잭션 안에서 길드 조회(해산 제외) → 권한 → 기존 행 → INSERT `onConflictDoNothing` → 충돌 시 다시 읽어 `already_selected` + `selected`
  - route `POST` body `{ bossId }`; 상태 코드 `no_guild 403, forbidden 403, event_ended 410, bad_boss 400, already_selected 409`; 레이트 리밋 `enforceUserAndIpRateLimit(req, { userId, action: "v2:guild-raid:select", userLimit: 10, ipLimit: 60, windowMs: 60_000 })`

- [ ] **Step 1: 실패 테스트**
  - `resolveGuildRaidSelection`: 일반 길드원 → `forbidden`; `endsAt <= now` → `event_ended`; `bossId null` → `bad_boss`; 기존 선택 산군 + 요청 스콜피온 → `{ ok:false, error:"already_selected", selected:"mountain_chief_hard" }`; 같은 보스 재요청도 `already_selected`; 정상 → `{ ok: true }`
  - route: 비로그인 401, JSON 오류 400 `invalid_json`, 서비스 오류 코드별 상태, 성공 200 본문 그대로(서비스 mock, `src/app/api/v2/guild/raid/route.test.ts` 패턴)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildRaidSelect.test.ts src/app/api/v2/guild/raid/select/route.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `feat: 길드장·관리자의 주간 토벌 보스 선택 API`

---

### Task 6: 공격을 선택한 보스로

**Files:**
- Modify: `src/lib/server/guildRaidAttack.ts`
- Modify: `src/lib/server/guildRaidAttack.test.ts`
- Modify: `src/app/api/v2/guild/raid/attack/route.ts` (`boss_not_selected: 409`)

**Interfaces:**
- Consumes: `simulateGuildRaidBattle({ bossId })` (Task 2), `guildRaidMaxHp(bossId, stage)` (Task 1), schema `bossKind` 칸 (Task 4)
- Produces:
  - `GuildRaidAttackMutationInput`: `event.bossKind` 제거, `bossId: GuildRaidBossId` 추가, `maxHpForStage` 제거(내부에서 `guildRaidMaxHp(bossId, ·)`)
  - `GuildRaidAttackOutcome` 오류에 `"boss_not_selected"` 추가
  - 흐름 순서: 멱등 로그 확인 → 길드 조회 → **점수 행 조회(없으면 `boss_not_selected`, 시뮬 전)** → 시뮬 → 트랜잭션 재검증(점수 행 `FOR UPDATE`) → 갱신 → 로그 INSERT에 `bossKind`
  - `existingOutcome`의 `maxHp`는 로그 `bossKind`로 계산

- [ ] **Step 1: 실패 테스트** — `resolveGuildRaidAttackMutation`에 `bossId: "canyon_predator_raid"`, `guildProgress { stage 1, hp 1, maxHp = guildRaidMaxHp("canyon_predator_raid",1) }`, 피해 1 → 결과 `stage 2`, `maxHp === guildRaidMaxHp("canyon_predator_raid", 2)`. 기존 테스트 입력을 새 시그니처로 갱신.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildRaidAttack.test.ts` → FAIL
- [ ] **Step 3: 구현** — 위 순서대로. 점수 행 자동 생성 INSERT 삭제.
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS
- [ ] **Step 5: 커밋** — `feat: 길드 토벌전 공격을 길드가 고른 보스로 진행`

---

### Task 7: 연습·조회·보상 수령·다시보기

**Files:**
- Modify: `src/lib/server/guildRaidPractice.ts`, `src/lib/server/guildRaidPractice.test.ts`, `src/app/api/v2/guild/raid/practice/route.ts`
- Modify: `src/lib/server/guildRaidRead.ts`, `src/app/api/v2/guild/raid/route.ts`, `src/app/api/v2/guild/raid/route.test.ts`
- Modify: `src/lib/server/guildRaidRewardClaim.ts`, `src/lib/server/guildRaidRewardClaim.test.ts`
- Modify: `src/adventure/v2/guild/guildRaidTypes.ts`

**Interfaces:**
- Consumes: Task 1·2·4 산출물
- Produces:
  - 연습: `practiceGuildRaid({ userId, bossId?: unknown, now? })`. context에 `selectedBossKind: string | null`. 결정 순서: 요청 `bossId`(잘못된 값이면 `bad_boss`) → 길드 선택값 → `GUILD_RAID_DEFAULT_BOSS_ID`. route는 body `{ bossId? }`를 읽되 본문이 없거나 JSON이 아니어도 허용. `bad_boss` 상태 400. `GuildRaidPracticeResult.bossKind: GuildRaidBossId`.
  - 조회 `readGuildRaidState(userId, now, { leaderboardPage, recentPage, board })`: 새 필드 `selection`, `canSelect`, `bosses`, `board`(spec 2절 타입 그대로). `event.bossKind/stage/hp/maxHp`는 선택 전 `null`. `guild.rank`는 우리 보스 묶음 기준. 순위표 보스는 `parseGuildRaidBossId(board) ?? selection?.bossId ?? GUILD_RAID_DEFAULT_BOSS_ID`. `my.reward`: 정산 후엔 `guildRaidRewardFor(finalRank, parseGuildRaidRewardTier(rewardTier))`, 정산 전엔 `guildRaidRewardFor(rank, resolveGuildRaidRewardTier(bossId, guild.damage))`. 새 필드 `my.bonusThresholdMet: boolean | null`(스콜피온만 boolean).
  - `GuildRaidState`(guildRaidTypes.ts) 타입을 위와 일치하게 갱신. `bosses` 항목 타입 이름 `GuildRaidBossSummary`.
  - 수령: `resolveGuildRaidRewardClaim` 입력에 `rewardTier: GuildRaidRewardTier | null` 추가, 지급액 `guildRaidRewardFor(finalRank, parseGuildRaidRewardTier(rewardTier))`.
  - 다시보기 `readGuildRaidReplay`: `bossKind`를 로그의 `guildRaidAttackLogs.bossKind`에서 `parseGuildRaidBossId`로.

- [ ] **Step 1: 실패 테스트**
  - 연습: `bossId: "canyon_predator_raid"` → simulate가 그 보스로 호출; `bossId` 없음 + 선택 스콜피온 → 스콜피온; 둘 다 없음 → 산군; `bossId: "nope"` → `bad_boss`
  - 수령: `finalRank 1, rewardTier "bonus"` → `{ gold: 10_000_000, masteryCertificates: 1_000 }`; `rewardTier "floor", finalRank 1` → 50만/50; `rewardTier null, finalRank 2` → 300만/300
  - 조회 route: `board` 쿼리 파라미터가 `readGuildRaidState`로 전달되는지(mock)
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildRaidPractice.test.ts src/lib/server/guildRaidRewardClaim.test.ts src/app/api/v2/guild/raid/route.test.ts` → FAIL
- [ ] **Step 3: 구현**
- [ ] **Step 4: 통과 확인** — 같은 명령 → PASS, `npx tsc --noEmit -p .`에서 서버 쪽 오류 0(클라이언트 오류만 남음)
- [ ] **Step 5: 커밋** — `feat: 길드 토벌전 연습·조회·보상 수령을 보스별로`

---

### Task 8: 토벌전 화면

**Files:**
- Create: `src/adventure/v2/guild/GuildRaidBossPicker.tsx`
- Modify: `src/adventure/v2/guild/GuildRaidPanel.tsx`, `src/adventure/v2/guild/GuildRaidPanel.test.tsx`
- Modify: `src/adventure/v2/guild/useGuildRaid.ts`, `src/adventure/v2/guild/useGuildRaid.test.tsx`
- Modify: `src/adventure/v2/guild/GuildRaidAttackLogView.tsx` (+ 해당 테스트가 있으면 갱신)

**Interfaces:**
- Consumes: `GuildRaidState`, `GuildRaidBossSummary` (Task 7), `GUILD_RAID_BOSSES` (Task 1)
- Produces:
  - `useGuildRaid()` 반환에 `selectBoss(bossId: GuildRaidBossId): Promise<void>`, `selecting: boolean`, `practice(bossId?: GuildRaidBossId)`, `setBoard(bossId: GuildRaidBossId)` 추가. `selectBoss`는 `POST /api/v2/guild/raid/select` 후 조용히 재조회, `already_selected`도 재조회.
  - `GuildRaidBossPicker({ bosses, canSelect, selecting, practicing, attacking, onSelect, onPractice })` — 보스 카드 목록, 선택 버튼은 확인 창(기존 공용 확인 다이얼로그 컴포넌트를 `src/components/ui`에서 찾아 재사용) 후 `onSelect`
  - `GuildRaidPanelContent`에 `onSelectBoss`, `selecting`, `onBoardChange` prop 추가. `state.selection == null`이면 Picker를 보스 카드 자리에 렌더하고 공격 버튼 대신 안내.
- 문구(고정):
  - 미선택·권한 없음: `길드장 또는 관리자가 이번 주 보스를 선택하면 공격할 수 있습니다.`
  - 확인 창: 제목 `{보스 이름}을 이번 주 보스로 선택할까요?`, 본문 `선택하면 이번 주에는 바꿀 수 없습니다.`
  - 스콜피온 카드 보상 안내: `보상 2배 · 길드 누적 피해 {기준} 미만이면 순위와 관계없이 50만 골드와 숙련의 증표 50개`
  - 진행 표시(스콜피온 선택 후, 정산 전): `2배 보상 기준 {길드 피해} / {기준}`
  - 오류 문구 추가: `forbidden: "길드장 또는 관리자만 보스를 선택할 수 있습니다."`, `already_selected: "이번 주 보스가 이미 선택되었습니다."`, `boss_not_selected: "이번 주 보스를 먼저 선택해야 합니다."`, `bad_boss: "보스 정보를 확인할 수 없습니다."`
  - 순위표 탭: 보스 이름 두 개, `role="tablist"`

- [ ] **Step 1: 실패 테스트** (`GuildRaidPanel.test.tsx`, 기존 `raidState` 헬퍼에 새 필드 기본값 추가)
  - 미선택 + `canSelect` → 두 보스의 "이번 주 보스로 선택" 버튼, 공격 버튼 없음; 클릭 → 확인 창 문구 → 확인 시 `onSelectBoss("canyon_predator_raid")`
  - 미선택 + `!canSelect` → 위 안내 문구, 선택 버튼 없음, 연습 버튼은 두 개
  - 선택 후 → 고른 보스 이름·단계 표시, 순위표 탭 두 개 중 우리 보스 `aria-selected="true"`, 다른 탭 클릭 → `onBoardChange`
  - 스콜피온 선택 + `bonusThresholdMet false` → 진행 표시 문구
  - `useGuildRaid.test.tsx`: `selectBoss`가 select API를 `{ bossId }`로 호출하고 재조회; `practice("canyon_predator_raid")` 본문에 bossId
- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/v2/guild` → FAIL
- [ ] **Step 3: 구현** — 구현 전 `anti-slop-ui` 스킬을 불러 기준 확인. 표면 `SURFACE_CARD`/`SURFACE_INSET`, 공용 `Button`·`Card`.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/adventure/v2/guild` → PASS, `npx tsc --noEmit -p .` 오류 0
- [ ] **Step 5: 시각 확인** — `/dev` 프리뷰 하네스(메모 `dev-preview-harness`)에 토벌전 패널 상태가 있으면 미선택·선택 후 두 상태를 라이트·다크로 스크린샷(메모 `ui-visual-verification-env`). 하네스에 없으면 그 사실을 보고에 적는다.
- [ ] **Step 6: 커밋** — `feat: 길드 토벌전 보스 선택 화면과 보스별 순위 탭`

---

### Task 9: 매뉴얼과 전체 검증

**Files:**
- Modify: `src/app/manual/content/guild.tsx` (토벌전 절, 135행 부근)
- Modify: `src/app/manual/current-content.test.tsx` (토벌전 문구 기대값이 있으면)

- [ ] **Step 1: 실패 테스트** — `current-content.test.tsx`에 기대 문구 추가: `길드장 또는 관리자가 매주 토벌 보스를 선택`, `같은 보스를 고른 길드끼리`, `재앙의 스콜피온 킹은 보상이 2배`
- [ ] **Step 2: 실패 확인** — `npx vitest run src/app/manual` → FAIL
- [ ] **Step 3: 매뉴얼 수정** — spec 4절 세 문장을 기존 문체(`<Em>`, `<li>`)로. 기존 "각 길드가 독립된 단계형 보스" 문단은 보스 선택에 맞게 고친다.
- [ ] **Step 4: 통과 확인** — `npx vitest run src/app/manual` → PASS
- [ ] **Step 5: 전체 검증** — `npx tsc --noEmit -p .`, `npx eslint src/adventure/data/v2 src/lib/server src/adventure/v2/guild src/app/api/v2/guild/raid src/app/manual scripts/sim-guild-raid-boss.ts`, `npx vitest run` 모두 PASS. `npm run check-migrations` PASS. 빌드는 워크트리 symlink 제약(메모 `worktree-turbopack-symlink`) 때문에 생략하고 보고에 명시.
- [ ] **Step 6: 커밋** — `docs: 매뉴얼에 길드 토벌전 보스 선택과 보스별 보상 안내`
