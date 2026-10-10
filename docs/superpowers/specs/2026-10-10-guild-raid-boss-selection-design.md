# 길드 토벌전 보스 선택 + 토벌 전용 스콜피온 킹 설계

작성일: 2026-10-10

## 목표

- 흉포한 산군보다 훨씬 강한 토벌 전용 보스(재앙의 스콜피온 킹 강화판)를 추가하고, 보상을 2배로 책정한다.
- 길드마스터 또는 관리자(manager)가 매주 그 주에 참여할 보스를 고르고, 길드는 그 주 내내 고른 보스만 공격한다.
- 순위는 같은 보스를 고른 길드끼리만 매긴다.

## 확정된 규칙

| 항목 | 결정 |
|---|---|
| 새 보스 | 기존 `canyon_predator_hard`(재앙의 스콜피온 킹)의 토벌 전용 변형 `canyon_predator_raid`. 이름·그림·스킬·특성 문구 재사용, 수치만 크게 상향 |
| 협동 보스 영향 | 없음. `COOP_BOSSES`에 넣지 않고 토벌 전용 레지스트리에 둔다 |
| 난이도 목표 | 운영 전투력 상위 20명 시뮬 기준: 스콜피온 피해가 산군 대비 중앙값 40% 이하, 20명 중 절반 이상이 전투 중 사망, 1위도 끝까지 버티는 경우가 드묾 |
| 선택 권한 | `guilds.masterId` 또는 `guild_members.role = 'manager'` |
| 선택 시점 | 전투 기간(active) 안이면 언제든. 마감 없음 |
| 선택 전 공격 | 불가. 자동 기본값 없음 |
| 선택 변경 | 불가. 한 번 고르면 그 주는 고정 |
| 연습 전투 | 선택 여부와 무관하게 두 보스 모두 가능 |
| 순위 | 이벤트 안에서 `boss_kind`별로 분리 |
| 산군 보상 | 기존 표 그대로(1배) |
| 스콜피온 보상 | 길드 누적 피해 ≥ 기준이면 순위별 2배, 미달이면 순위와 무관하게 산군 최하 구간(50만 골드·숙련 증명서 50장) |

기존 산군 보상표(`guildRaidRewardForRank`, 자격 충족 참여자 1인당):

| 길드 순위 | 골드 | 숙련 증명서 |
|---|---|---|
| 1위 | 5,000,000 | 500 |
| 2~3위 | 3,000,000 | 300 |
| 4~10위 | 1,000,000 | 100 |
| 11위 이하 | 500,000 | 50 |

스콜피온 기준 충족 시 위 표의 2배, 기준 미달 시 11위 이하 구간 고정.

## 1. 보스 정의와 난이도

### 토벌 전용 레지스트리

`src/adventure/data/v2/guildRaidBosses.ts`에 `GUILD_RAID_BOSSES`를 새로 둔다.

```ts
export type GuildRaidBossId = "mountain_chief_hard" | "canyon_predator_raid";

type GuildRaidBossDef = {
  id: GuildRaidBossId;
  definition: CoopBossKind;      // 전투용. 산군은 COOP_BOSSES 참조, 스콜피온은 복사 후 덮어쓰기
  stageBaseHp: number;           // 1단계 체력. 단계마다 GUILD_RAID_STAGE_HP_GROWTH(1.25)배
  bonusMinGuildDamage: number | null; // 2배 보상 기준. 산군은 null
};
```

- `canyon_predator_raid.definition`은 `COOP_BOSSES.canyon_predator_hard`를 펼친 뒤 `anchorDepth`, 공격력 배율, 방어력·회피를 덮어쓴다. `definition.id`는 `canyon_predator_hard`로 유지해 전투 함수(`coopBossForBattle`)의 기존 경로를 그대로 탄다.
- `parseGuildRaidBossId(raw)`로 DB 값을 검증한다. 알 수 없는 값은 `bad_boss`.
- `guildRaidMaxHp(stage)`를 `guildRaidMaxHp(bossId, stage)`로 바꾸고, 현재 산군 상수를 직접 읽는 호출부(`guildRaidLifecycle`, `guildRaidAttack`, `guildRaidRead`)를 모두 고친다. `GUILD_RAID_PILOT_BOSS_KIND`는 제거하고 `GUILD_RAID_DEFAULT_BOSS_ID = "mountain_chief_hard"`로 대체한다(이벤트 행 기록·연습 기본값 용도).

### 난이도 맞추기

- `scripts/sim-guild-raid-boss.ts`를 새로 만든다. `scripts/sim-live-top-combat.ts`처럼 운영 DB의 상위 20명 저장 상태를 SELECT만 하고, 토벌전과 같은 전투 경로(`simulateGuildRaidBattle`의 순수 부분)로 두 보스와 각각 여러 번 싸운다.
- 출력: 캐릭터별 산군 피해, 스콜피온 피해, 비율, 사망 여부, 요약(비율 중앙값, 사망 비율, 1위 생존 여부).
- 위 목표를 만족할 때까지 `canyon_predator_raid`의 덮어쓰기 수치를 조정한다.
- 시뮬 결과로 정하는 값:
  - `stageBaseHp`(스콜피온) = 산군 `1_200_000` × 피해 비율 중앙값. 상위권 길드가 한 주에 넘는 단계 수가 산군과 비슷해지게 한다.
  - `bonusMinGuildDamage` = 상위 20명 스콜피온 1회 피해 중앙값 × 30(상위권 유저 두 명이 한 주 내내 공격한 수준), 만 단위 반올림.
- 운영 EC2 실행은 실행 직전에 오너 허락을 받는다. 읽기 전용이며 게임 데이터를 바꾸지 않는다.

## 2. 서버 흐름

### 마이그레이션 `0189`

- `guild_raid_guild_scores`
  - `boss_kind text NOT NULL DEFAULT 'mountain_chief_hard'`
  - `selected_by_user_id text NULL`
  - `reward_tier text NULL` + CHECK `reward_tier IN ('standard','bonus','floor')`
  - 순위 인덱스를 `(event_id, boss_kind, damage DESC)`로 교체
- `guild_raid_attack_logs`
  - `boss_kind text NOT NULL DEFAULT 'mountain_chief_hard'`
- 기존 정산된 행의 `reward_tier`는 `'standard'`로 백필한다. 기존 행의 `boss_kind`는 기본값으로 산군이 된다.
- `guild_raid_events.boss_kind`는 호환용으로 남기고 계속 `mountain_chief_hard`를 쓴다. 판단에는 쓰지 않는다.

### 보스 선택 `POST /api/v2/guild/raid/select`

요청 `{ bossId: GuildRaidBossId }`.

1. 로그인·길드 소속 확인. 해산 길드는 `no_guild`.
2. 권한: 마스터 또는 manager가 아니면 `forbidden`.
3. 현재 이벤트가 `active` 기간이 아니면 `event_ended`.
4. `bossId` 검증 실패 시 `bad_boss`.
5. 점수 행 INSERT(`boss_kind`, `selected_by_user_id`, 길드 이름·엠블럼 스냅샷, `stage 1`, `hp = maxHp = guildRaidMaxHp(bossId, 1)`), `onConflictDoNothing`. 충돌하면 `already_selected`와 현재 선택을 돌려준다. 동시 선택은 먼저 들어간 쪽만 반영된다.
6. 고비용 요청 제한은 기존 `highCostRateLimit` 패턴을 따른다.

### 공격 `attackGuildRaid`

- 점수 행 자동 생성(INSERT … onConflictDoNothing)을 제거한다.
- 길드 점수 행을 `FOR UPDATE`로 읽고, 없으면 `boss_not_selected`.
- 전투는 점수 행의 `boss_kind`로 한다(`simulateGuildRaidBattle({ bossId })`). 이벤트의 `bossKind`는 쓰지 않는다.
- 단계 진행은 `applyGuildRaidDamage(state, damage, (stage) => guildRaidMaxHp(bossId, stage))`.
- 공격 로그에 `boss_kind`를 기록한다.
- 참여자 길드 고정, 하루 3회 제한, requestId 멱등 처리는 기존 그대로.
- 전투 시뮬을 점수 행 확인 전에 돌리지 않도록 순서를 조정한다(미선택 길드의 불필요한 전투 연산 방지).

### 연습 `POST /api/v2/guild/raid/practice`

- 요청에 `bossId`(선택)를 받는다. 주어지면 그 보스로, 없으면 길드가 고른 보스로, 고르지 않았으면 `GUILD_RAID_DEFAULT_BOSS_ID`로 연습한다.
- 기존 연습 제한 규칙은 그대로.

### 조회 `GET /api/v2/guild/raid`

새 필드:

```ts
selection: { bossId: GuildRaidBossId; selectedAt: number } | null;
canSelect: boolean; // 마스터/관리자 && active && selection == null
bosses: {
  id: GuildRaidBossId;
  name: string;
  image: string;
  traits: string[];
  rewardMultiplier: 1 | 2;
  bonusMinGuildDamage: number | null;
}[];
board: GuildRaidBossId; // 지금 보여 주는 순위표의 보스
```

- `event.bossKind`는 `GuildRaidBossId | null`(길드 선택값)로 바꾼다. 선택 전에는 `stage`·`hp`·`maxHp`도 null이고, 화면은 단계 표시를 숨긴다.
- 순위표: 기본은 우리 길드가 고른 보스, 선택 전이면 기본 보스. 쿼리 `?board=<bossId>`로 다른 보스 순위를 볼 수 있다.
- `my.reward`는 3절 공식으로 계산한 예상 보상. 스콜피온이 정산 전이면 `bonusThresholdMet`도 함께 보낸다.

### 다시보기 `GET /api/v2/guild/raid/attacks/[attackId]`

- 응답의 `bossKind`를 공격 로그의 `boss_kind`(`GuildRaidBossId`)로 바꾼다.

## 3. 순위, 정산, 보상

### 순위

- 실시간: `rank() over (partition by boss_kind order by damage desc)`, `damage > 0`만, 동점은 기존처럼 같은 순위.
- 정산: 점수 행을 `boss_kind`로 묶고 묶음마다 기존 `rankGuildRaidScores`를 적용한다.

### 보상 구간

순수 함수 `resolveGuildRaidRewardTier(bossId, guildDamage)`:

- 산군 → `standard`
- 스콜피온, `guildDamage >= bonusMinGuildDamage` → `bonus`
- 스콜피온, 미달 → `floor`

정산 시 `final_rank`와 함께 `reward_tier`를 저장한다. 이후 기준값을 바꿔도 끝난 주의 보상은 바뀌지 않는다.

### 지급액

순수 함수 `guildRaidRewardFor(rank, tier)`:

- `standard` → `guildRaidRewardForRank(rank)`
- `bonus` → `guildRaidRewardForRank(rank)` × 2(골드·증명서 모두)
- `floor` → `{ gold: 500_000, masteryCertificates: 50 }`

`guildRaidRewardClaim`은 점수 행의 `final_rank`, `reward_tier`를 읽어 이 함수로 지급한다. `reward_tier`가 NULL인 정산 행(마이그레이션 백필 누락 대비)은 `standard`로 해석한다.

참여자 자격(주간 3회 이상, 피해 1 이상), 수령 기간(정산 후 다음 월요일 0시 KST 전)은 기존 그대로.

## 4. 화면, 매뉴얼

### `GuildRaidPanel`

- 선택 전
  - 두 보스 카드: 그림, 이름, 특성, 보상표(스콜피온은 2배 표와 기준·미달 시 보상 명시), 연습 전투 버튼.
  - `canSelect`이면 카드마다 "이번 주 보스로 선택" 버튼. 누르면 "선택하면 이번 주에는 바꿀 수 없습니다" 확인 창.
  - 아니면 공격 버튼 자리에 "길드장 또는 관리자가 이번 주 보스를 선택하면 공격할 수 있습니다" 안내.
- 선택 후: 기존 화면과 같고 보스 정보만 고른 보스로. 순위표 위에 보스 탭(흉포한 산군 / 재앙의 스콜피온 킹), 기본은 우리 길드 쪽.
- 스콜피온 선택 길드는 정산 전 길드 피해 옆에 "2배 보상 기준 n / 기준값" 진행을 보여 준다.
- 표면은 `SURFACE_CARD`·`SURFACE_INSET`, 공용 `Button`·확인 창 재사용. 라이트·다크 모두 스크린샷 확인. 구현 전후 `anti-slop-ui` 기준 적용.

### `GuildRaidAttackLogView`

- 로그의 `bossKind`로 `GUILD_RAID_BOSSES`에서 이름·그림을 찾는다.

### 매뉴얼

`src/app/manual/content/guild.tsx` 토벌전 부분에 짧게 추가:

- 길드장 또는 관리자가 매주 보스를 고른다. 마감은 없지만 고르기 전에는 공격할 수 없고, 고른 뒤에는 바꿀 수 없다.
- 순위는 같은 보스를 고른 길드끼리 매긴다.
- 재앙의 스콜피온 킹은 보상이 2배다. 길드 누적 피해가 기준에 못 미치면 순위와 상관없이 50만 골드·숙련 증명서 50장을 받는다.

"v2" 같은 내부 용어는 쓰지 않는다.

## 5. 테스트

회귀 테스트를 먼저 작성한다.

- 순수 로직(`guildRaid.test.ts`, `guildRaidBosses.test.ts`)
  - `guildRaidMaxHp(bossId, stage)` 보스별 기준 체력·성장
  - `resolveGuildRaidRewardTier` 세 경우
  - `guildRaidRewardFor` 구간별 지급액(2배, floor 고정)
  - 보스별 묶음 순위(다른 보스 길드가 섞여도 각 묶음 1위가 따로 나옴)
- 서버
  - 선택: 마스터·관리자 허용, 일반 길드원 `forbidden`, 중복 `already_selected`, 전투 기간 외 `event_ended`, 잘못된 id `bad_boss`
  - 공격: 미선택 `boss_not_selected`, 고른 보스로 전투·단계 체력 계산, 로그에 `boss_kind` 기록
  - 정산: 보스별 `final_rank`, 스콜피온 기준 이상·미달의 `reward_tier`
  - 보상 수령: tier별 지급액, NULL tier는 standard
  - 연습: `bossId` 지정·미지정·미선택 경로
- 화면
  - 선택 전 역할별 표시(선택 버튼 / 안내 문구), 확인 창, 순위표 보스 탭
- 매뉴얼 현재 내용 테스트(`current-content.test.tsx`) 갱신

## 범위 밖

- 새 그림, 새 보스 스킬·기믹
- 협동 보스 `canyon_predator_hard` 자체 수치 변경
- 선택 취소·변경 기능
- 배포. 로컬 검증·커밋까지만 하고 배포는 오너 요청 시에만 한다.
