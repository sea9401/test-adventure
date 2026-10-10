# 길드 시설 Lv.6~10 확장 (1차) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 훈련장·탐사 본부·길드 식당·연금 공방·길드 교역소를 길드에서 Lv.10까지 올릴 수 있게 하고, Lv.6~10 진행을 운영 실적으로 묶는다. 단계마다 새 기능이 열린다.

**Architecture:** 업그레이드 표는 `settlement.ts`에 Lv.6~10 행을 더하고, `nextSettlementBuildingUpgrade`에 범위 인자(`guild_facility`/`association`/`village`)를 붙여 길드 시설만 Lv.10까지 연다. 운영 실적은 순수 계산 모듈 + 새 테이블 + `logGuildActivity` 안의 단일 적립 지점으로 구현한다. 협회 이용은 활동 로그를 남기지 않으므로 자동으로 빠진다. 시설별 콘텐츠는 각 데이터 카탈로그에 행을 추가하고, 필요한 곳(원정 동시 파견, 식당 지속 배율, 상위 지원 물자)만 로직을 바꾼다.

**Tech Stack:** Next.js 16 App Router, TypeScript, drizzle-orm 0.45 + PostgreSQL, vitest, React.

**Spec:** `docs/superpowers/specs/2026-10-10-guild-facility-lv6-10-design.md`

## Global Constraints

- 작업 위치: `/tmp/guild-facility-lv10` (브랜치 `feat/guild-facility-lv10`, origin/main 기준). 본 트리 `~/test-adventure`는 건드리지 않는다.
- 시작 전 워크트리에서 `npm ci`를 한 번 실행한다. 타입 검사는 `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit`.
- 협회 공공시설 최대 레벨은 5. 제작소·길드 창고·지도 제작소는 길드에서도 5.
- 운영 실적 주간 상한 100점, 목표 Lv.6 200 / Lv.7 250 / Lv.8 300 / Lv.9 350 / Lv.10 400. 주차는 월요일 00:00 KST.
- 플레이어 노출 문구에 "v2", 마크다운, 대시(—) 금지. 기존 문구 톤(존댓말, 짧은 문장)을 따른다.
- UI는 `src/components/ui/surfaces.ts` 표면만 쓰고 반투명 배경·컨테이너 opacity 금지(AGENTS.md).
- 배포·푸시·PR은 하지 않는다. 커밋은 태스크마다 현재 브랜치에. 커밋 메시지 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 플레이어 노출 변경은 매뉴얼(`src/app/manual/content/guild.tsx`)을 같은 작업에서 갱신한다(Task 10).

## Review Focus

1. 옛 영지 마을 건축물 업그레이드(`/api/v2/outpost/village/building/upgrade`)로 Lv.5 시설을 Lv.6으로 올리는 요청 → `max_level`로 거절돼야 한다(운영 실적 우회 금지). Task 1 테스트.
2. 협회 시설 Lv.5에서 기부·완료 요청 → 다음 단계가 없어야 한다(`nextAssociationFacilityUpgrade` null). Task 1 테스트.
3. 업그레이드 완료와 같은 주에 계속 이용 → 새 목표로 넘어가도 이번 주 적립량은 유지돼 주 100점을 넘지 않아야 한다. Task 2 테스트.
4. 기존 저장값의 단일 `activeExpedition`이 진행 중인 길드 → 배포 후에도 귀환 수령이 되어야 한다. Task 6 테스트.
5. 시설 레벨이 Lv.10인데 실적 행이 남아 있음 → 적립하지 않고 화면에 실적 막대가 나오지 않아야 한다. Task 2·4 테스트.

---

### Task 1: 최대 레벨 범위와 Lv.6~10 비용 표

**Files:**
- Modify: `src/adventure/data/v2/settlement.ts` (최대 레벨, `facilityResourceCostForLevel`, 5종 업그레이드 표, `nextSettlementBuildingUpgrade`)
- Modify: `src/adventure/data/v2/adventurerAssociation.ts:63-69`
- Modify: `src/lib/server/adventurerAssociation.ts:58,135`
- Modify (scope 인자 `"guild_facility"` 전달): `src/app/api/v2/guild/facilities/[buildingId]/donate/route.ts:104`, `src/app/api/v2/guild/facilities/[buildingId]/upgrade/route.ts:79`, `src/app/api/v2/guild/trade-post/route.ts:107,164,765`, `src/adventure/v2/guild/GuildOutpostsPanel.tsx:214`
- 그대로(기본값 `village`): `src/app/api/v2/outpost/village/building/upgrade/route.ts`, `src/adventure/v2/V2VillagePanel.tsx`
- Test: `src/adventure/data/v2/settlement.test.ts`(없으면 생성), `src/adventure/data/v2/adventurerAssociation.test.ts`

**Interfaces:**
- Produces:
  - `type SettlementUpgradeScope = "guild_facility" | "association" | "village"`
  - `GUILD_FACILITY_EXPANDED_IDS` = `["training_ground","exploration_hq","alchemy_workshop","dining_hall","trade_post"] as const`, `type GuildFacilityExpandedId = (typeof GUILD_FACILITY_EXPANDED_IDS)[number]`, `isGuildFacilityExpandedId(id: string): id is GuildFacilityExpandedId`
  - `settlementBuildingMaxLevel(buildingId: SettlementBuildingId, scope: SettlementUpgradeScope): number` → guild_facility + 확장 5종이면 10, 나머지 5
  - `MAX_SETTLEMENT_BUILDING_LEVEL = 10` (저장값 정규화 상한)
  - `nextSettlementBuildingUpgrade(buildingId, level, scope: SettlementUpgradeScope = "village")` → `level >= settlementBuildingMaxLevel(...)`이면 null

- [ ] **Step 1: 실패 테스트 작성**

```ts
it("길드 시설 확장 5종만 길드에서 Lv.10까지 열린다", () => {
  expect(settlementBuildingMaxLevel("training_ground", "guild_facility")).toBe(10);
  expect(settlementBuildingMaxLevel("guild_smithy", "guild_facility")).toBe(5);
  expect(settlementBuildingMaxLevel("guild_warehouse", "guild_facility")).toBe(5);
  expect(settlementBuildingMaxLevel("training_ground", "association")).toBe(5);
  expect(settlementBuildingMaxLevel("training_ground", "village")).toBe(5);
});
it("범위를 주지 않으면 Lv.5에서 다음 단계가 없다", () => {
  expect(nextSettlementBuildingUpgrade("trade_post", 5)).toBeNull();
  expect(nextSettlementBuildingUpgrade("trade_post", 5, "guild_facility")?.level).toBe(6);
  expect(nextSettlementBuildingUpgrade("trade_post", 10, "guild_facility")).toBeNull();
  expect(nextSettlementBuildingUpgrade("guild_smithy", 5, "guild_facility")).toBeNull();
});
it("Lv.6~10 공통 비용", () => {
  const lv6 = nextSettlementBuildingUpgrade("dining_hall", 5, "guild_facility")!;
  expect(lv6.cost).toEqual({
    [WOODCUTTING_MATERIAL_ID.oak]: 3000, [MINING_MATERIAL_ID.gold]: 3000,
    [WOODCUTTING_MATERIAL_ID.cedar]: 2500, [MINING_MATERIAL_ID.mythril]: 2500,
    [WOODCUTTING_MATERIAL_ID.cypress]: 2000, [MINING_MATERIAL_ID.adamantite]: 2000,
    gold: 400_000_000, fame: 4000,
  });
  const lv10 = nextSettlementBuildingUpgrade("dining_hall", 9, "guild_facility")!;
  expect(lv10.cost.gold).toBe(1_200_000_000);
  expect(lv10.cost.fame).toBe(10_000);
  expect(lv10.cost[WOODCUTTING_MATERIAL_ID.cypress]).toBe(7500);
});
// adventurerAssociation.test.ts
it("협회 시설은 Lv.5에서 멈춘다", () => {
  expect(nextAssociationFacilityUpgrade("training_ground", 5)).toBeNull();
  expect(nextAssociationFacilityUpgrade("training_ground", 4)?.level).toBe(5);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/settlement.test.ts src/adventure/data/v2/adventurerAssociation.test.ts` → FAIL(`settlementBuildingMaxLevel` 미정의)

- [ ] **Step 3: 구현**
  - `facilityResourceCostForLevel`의 인자를 `2|3|4|5|6|7|8|9|10`으로 넓히고 스펙 2.2 표의 Lv.6~10 재료를 넣는다. `facilityUpgradeCost`도 같은 범위.
  - 5종 표(`TRAINING_GROUND_UPGRADES` 등)에 Lv.6~10 행 추가. 골드 4억/6억/8억/10억/12억, 명성 4000/5500/7000/8500/10000. 시설별 수치 필드는 이 태스크에서 아래 값으로 채운다(콘텐츠 태스크는 이 값을 소비만 한다):
    - 훈련장 `trainingRewardBonusPct` 60/70/80/90/100, `unlockedDrillCount` 3/4/4/4/5, label 「합동 훈련장」「교관 숙소」「직군 수련관」「명예 훈련관」「전설의 훈련소」
    - 탐사 본부 `missionProgressBonusPct` 40/45/50/55/60, `weeklyMissionCount` 6/7/7/7/7, label 「고산 전진기지」「토벌 정찰소」「쌍둥이 원정 막사」「심연 관측소」「대륙 지도 회랑」
    - 연금 공방 `weeklyEnergy` 34/38/42/46/50, label 「정제 촉매실」「잉크 농축실」「초월 증류탑」「결정 연성로」「현자의 탑」
    - 식당 `weeklyMealTickets` 24/28/28/32/36, label 「심해 주방」「용사의 식탁」「장기 숙성고」「회복 연회장」「왕실 연회장」
    - 교역소 `weeklyContractCount` 5/6/6/6/7, `personalContributionCap` 750/900/1050/1200/1400, `tokenYieldBonusPct` 260/290/320/340/400, `completionRewardBonusPct` 110/130/150/175/200, label 「상단 연합 지부」「대륙 교역 거점」「왕립 물류 본부」「연합 교역 의회」「대륙 교역 연합」
  - `clampSettlementBuildingLevel` 상한은 `MAX_SETTLEMENT_BUILDING_LEVEL`(10)을 그대로 쓴다.
  - 협회: `nextAssociationFacilityUpgrade`는 `nextSettlementBuildingUpgrade(id, level, "association")`. 서버의 `Math.min(5, …)` 두 곳은 `settlementBuildingMaxLevel(buildingId, "association")`.
  - 위 Files 목록의 길드 시설 호출부에 `"guild_facility"` 인자 추가.

- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. 이어서 `npx vitest run src/adventure/data/v2 src/lib/server/adventurerAssociation src/app/api/v2/guild src/app/api/v2/outpost src/app/api/v2/association` → 기존 테스트 PASS. 옛 마을 업그레이드 라우트 테스트(있으면)에 "Lv.5 trade_post → 409 max_level" 케이스를 추가해 PASS 확인(Review Focus 1).

- [ ] **Step 5: 커밋** — `git commit -m "feat: 길드 시설 확장 5종 최대 레벨 10과 Lv.6~10 비용"`

---

### Task 2: 운영 실적 순수 계산

**Files:**
- Create: `src/adventure/data/v2/guildFacilityOperations.ts`
- Test: `src/adventure/data/v2/guildFacilityOperations.test.ts`

**Interfaces:**
- Consumes: `settlementBuildingMaxLevel`, `GUILD_FACILITY_EXPANDED_IDS` (Task 1), `todayGuildTrainingWeekKey` (`guildTrainingGround.ts`)
- Produces:
  - `GUILD_FACILITY_OPERATIONS_WEEKLY_CAP = 100`
  - `guildFacilityOperationsRequired(targetLevel: number): number` → 6:200, 7:250, 8:300, 9:350, 10:400, 그 외 0
  - `type GuildFacilityOperationsState = { targetLevel: number; points: number; weekKey: string; weekPoints: number }`
  - `normalizeGuildFacilityOperationsState(raw: Partial<GuildFacilityOperationsState> | null, args: { currentLevel: number; weekKey: string }): GuildFacilityOperationsState` → targetLevel = currentLevel+1. 저장값 targetLevel이 다르면 points 0. weekKey가 다르면 weekPoints 0.
  - `accrueGuildFacilityOperationsState(state, amount: number, args: { currentLevel: number; maxLevel: number }): { state: GuildFacilityOperationsState; accrued: number }` → currentLevel < 5 또는 currentLevel >= maxLevel이면 accrued 0. 그 외 `min(amount, 100 - weekPoints, required - points)` (음수는 0).
  - `guildFacilityOperationsComplete(state): boolean` → required > 0 && points >= required
  - `type GuildFacilityOperationActivity = "training_drill_claim" | "exploration_expedition_claim" | "exploration_weekly_claim" | "exploration_event_resolve" | "dining_meal" | "dining_ingredient_donation" | "alchemy_craft" | "trade_delivery" | "trade_contract_complete"`
  - `guildFacilityOperationAccrual(type: string, amount?: number): { buildingId: GuildFacilityExpandedId; points: number } | null` — 스펙 2.3 표. amount는 식재료 공동 준비 점수·연성력·납품 점수.
  - `type GuildFacilityOperationsView = { targetLevel: number; points: number; required: number; weekPoints: number; weeklyCap: number }`

- [ ] **Step 1: 실패 테스트 작성**

```ts
const base = normalizeGuildFacilityOperationsState(null, { currentLevel: 5, weekKey: "2026-10-12" });
it("Lv.5에서 다음 목표 200점", () => {
  expect(base).toEqual({ targetLevel: 6, points: 0, weekKey: "2026-10-12", weekPoints: 0 });
});
it("주간 상한 100점", () => {
  const r = accrueGuildFacilityOperationsState({ ...base, weekPoints: 95 }, 8, { currentLevel: 5, maxLevel: 10 });
  expect(r.accrued).toBe(5);
  expect(r.state.weekPoints).toBe(100);
});
it("목표에서 멈추고 이월 없음", () => {
  const r = accrueGuildFacilityOperationsState({ ...base, points: 198 }, 8, { currentLevel: 5, maxLevel: 10 });
  expect(r.accrued).toBe(2);
  expect(guildFacilityOperationsComplete(r.state)).toBe(true);
});
it("Lv.5 미만과 최대 레벨은 적립하지 않음", () => {
  expect(accrueGuildFacilityOperationsState(base, 8, { currentLevel: 4, maxLevel: 10 }).accrued).toBe(0);
  const lv10 = normalizeGuildFacilityOperationsState(null, { currentLevel: 10, weekKey: "2026-10-12" });
  expect(accrueGuildFacilityOperationsState(lv10, 8, { currentLevel: 10, maxLevel: 10 }).accrued).toBe(0);
});
it("레벨이 오르면 점수는 0, 같은 주 적립량은 유지", () => {
  const next = normalizeGuildFacilityOperationsState(
    { targetLevel: 6, points: 200, weekKey: "2026-10-12", weekPoints: 70 },
    { currentLevel: 6, weekKey: "2026-10-12" },
  );
  expect(next).toEqual({ targetLevel: 7, points: 0, weekKey: "2026-10-12", weekPoints: 70 });
});
it("주가 바뀌면 주간 적립량 초기화", () => {
  const next = normalizeGuildFacilityOperationsState(
    { targetLevel: 6, points: 120, weekKey: "2026-10-05", weekPoints: 100 },
    { currentLevel: 5, weekKey: "2026-10-12" },
  );
  expect(next.points).toBe(120);
  expect(next.weekPoints).toBe(0);
});
it("활동별 적립", () => {
  expect(guildFacilityOperationAccrual("training_drill_claim")).toEqual({ buildingId: "training_ground", points: 1 });
  expect(guildFacilityOperationAccrual("exploration_expedition_claim")).toEqual({ buildingId: "exploration_hq", points: 8 });
  expect(guildFacilityOperationAccrual("exploration_weekly_claim")?.points).toBe(3);
  expect(guildFacilityOperationAccrual("exploration_event_resolve")?.points).toBe(2);
  expect(guildFacilityOperationAccrual("dining_meal")).toEqual({ buildingId: "dining_hall", points: 2 });
  expect(guildFacilityOperationAccrual("dining_ingredient_donation", 37)?.points).toBe(3);
  expect(guildFacilityOperationAccrual("alchemy_craft", 14)).toEqual({ buildingId: "alchemy_workshop", points: 14 });
  expect(guildFacilityOperationAccrual("trade_delivery", 59)).toEqual({ buildingId: "trade_post", points: 5 });
  expect(guildFacilityOperationAccrual("trade_contract_complete")?.points).toBe(10);
  expect(guildFacilityOperationAccrual("trade_delivery", 9)).toBeNull();
  expect(guildFacilityOperationAccrual("gold_deposit")).toBeNull();
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildFacilityOperations.test.ts` → FAIL(모듈 없음)
- [ ] **Step 3: 구현** — 위 Interfaces 그대로. points 0이 되는 적립은 null을 돌려준다.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 길드 시설 운영 실적 계산"`

---

### Task 3: 운영 실적 저장과 활동 로그 적립

**Files:**
- Modify: `src/db/schema.ts` (`guildFacilityOperations` 테이블, `guildFacilityUpgradeDonations` 아래)
- Create: `drizzle/0189_*.sql` (`npm run db:generate`로 생성, 생성된 이름 그대로)
- Create: `src/lib/server/guildFacilityOperations.ts`
- Modify: `src/lib/server/guildActivityLog.ts` (`logGuildActivity` entry에 `operationAmount?: number`)
- Modify: `src/app/api/v2/guild/dining-hall/route.ts:290` (`operationAmount: points`), `src/app/api/v2/guild/alchemy-workshop/route.ts:418` (`operationAmount: energyCost`), `src/app/api/v2/guild/trade-post/route.ts:542` (`operationAmount: points`)
- Test: `src/lib/server/guildFacilityOperations.test.ts`, `src/lib/server/guildActivityLog.test.ts`(있으면 확장)

**Interfaces:**
- Consumes: Task 2 전부, `readGuildFacilityLevel(tx, guildId, buildingId)` (`guildFacilities.ts`), `settlementBuildingMaxLevel`
- Produces:
  - 테이블 `guild_facility_operations`: `guild_id integer FK guilds cascade`, `building_id text`, `target_level integer not null`, `points integer not null default 0`, `week_key text not null`, `week_points integer not null default 0`, `updated_at timestamp default now`, PK `(guild_id, building_id)`
  - `accrueGuildFacilityOperations(tx: Tx, args: { guildId: number; buildingId: GuildFacilityExpandedId; points: number; now?: Date }): Promise<number>` → 실제 적립량. 행 insert onConflictDoNothing 후 FOR UPDATE.
  - `lockGuildFacilityOperations(tx, guildId, buildingId, currentLevel, now?): Promise<GuildFacilityOperationsState>`
  - `saveGuildFacilityOperations(tx, guildId, buildingId, state): Promise<void>`
  - `readGuildFacilityOperationsViews(executor: DbExecutor, guildId: number, levels: Partial<Record<SettlementBuildingId, number>>, now?): Promise<Partial<Record<GuildFacilityExpandedId, GuildFacilityOperationsView>>>` → 목표 레벨이 6 이상이고 최대 레벨 미만인 시설만 포함
- 기존 테스트 방식(DB 모킹 또는 테스트 DB)은 `src/lib/server/guildFacilityMembership.test.ts`를 따른다.

- [ ] **Step 1: 실패 테스트 작성** — `accrueGuildFacilityOperations`: Lv.5 시설에 8점 → 8 반환, 행 points 8 / week_points 8. 같은 주 95점 상태에서 8점 → 5. 시설 Lv.4 → 0. `logGuildActivity({ type: "alchemy_craft", operationAmount: 14, … })` → alchemy_workshop 행 points 14. `type: "gold_deposit"` → 실적 행 없음.
- [ ] **Step 2: 실패 확인** — `npx vitest run src/lib/server/guildFacilityOperations.test.ts` → FAIL
- [ ] **Step 3: 스키마 추가 후 `npm run db:generate`** → 새 SQL 파일에 CREATE TABLE만 있는지 확인(다른 테이블 변경이 섞이면 중단하고 원인 확인)
- [ ] **Step 4: 헬퍼 구현과 `logGuildActivity` 연결** — insert 뒤 `guildFacilityOperationAccrual(entry.type, entry.operationAmount)`가 있으면 `accrueGuildFacilityOperations`. `operationAmount`는 meta에 저장하지 않는다. 세 호출부에 값 전달.
- [ ] **Step 5: 통과 확인** — 같은 명령 PASS, `npx vitest run src/app/api/v2/guild src/lib/server` PASS
- [ ] **Step 6: 커밋** — `git commit -m "feat: 길드 시설 운영 실적 저장과 적립"`

---

### Task 4: 업그레이드 조건과 화면

**Files:**
- Modify: `src/app/api/v2/guild/facilities/[buildingId]/upgrade/route.ts`
- Modify: `src/app/api/v2/me/guild/info/route.ts:415-440` (`facilityOperations` 응답)
- Modify: `src/adventure/v2/guild/guildShared.ts:85` (`facilityOperations?: Partial<Record<SettlementBuildingId, GuildFacilityOperationsView>>`)
- Modify: `src/adventure/v2/guild/GuildFacilityUpgradeFund.tsx`, `src/adventure/v2/guild/GuildOutpostsPanel.tsx:271-286`
- Test: `src/app/api/v2/guild/facilities/[buildingId]/upgrade/route.test.ts`(있으면 확장), `src/adventure/v2/guild/GuildFacilitiesPanel.test.tsx`, `src/app/api/v2/me/guild/info/route.test.ts`

**Interfaces:**
- Consumes: Task 3 `lockGuildFacilityOperations`, `saveGuildFacilityOperations`, `readGuildFacilityOperationsViews`; Task 2 `guildFacilityOperationsComplete`
- Produces: `GuildFacilityUpgradeFund` prop `operations?: GuildFacilityOperationsView`; 업그레이드 오류 `409 { ok:false, error:"operations_incomplete", operations: { points, required } }`

- [ ] **Step 1: 실패 테스트 작성**
  - 라우트: 목표 Lv.6, 재료·골드·명성 충분, 실적 120/200 → 409 `operations_incomplete`. 실적 200/200 → 200, 응답 후 실적 행 `{ targetLevel: 7, points: 0 }`, weekPoints 유지.
  - info: Lv.5 훈련장 길드 → `facilityOperations.training_ground = { targetLevel: 6, points, required: 200, weekPoints, weeklyCap: 100 }`. Lv.10 시설 → 키 없음. 제작소 → 키 없음.
  - 화면: operations `{points:120, required:200, weekPoints:64, weeklyCap:100}` → "운영 실적 120/200", "이번 주 +64/100" 텍스트. 실적 미달이면 완료 버튼 비활성. operations 없음 → 실적 줄 미표시.
- [ ] **Step 2: 실패 확인** — `npx vitest run "src/app/api/v2/guild/facilities" src/app/api/v2/me/guild/info src/adventure/v2/guild/GuildFacilitiesPanel.test.tsx` → FAIL
- [ ] **Step 3: 구현** — 라우트는 재료 확인 다음, 골드 확인 전에 실적을 확인한다(목표 레벨 ≥ 6일 때만). 완료 시 `saveGuildFacilityOperations`로 다음 목표 상태 저장. 화면은 재료 행 아래 같은 스타일의 진행 줄 하나를 추가하고, `canComplete`에 실적 완료를 AND 한다. 오류 코드 `operations_incomplete` 문구: "운영 실적이 아직 부족합니다."
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 길드 시설 Lv.6 이상 업그레이드에 운영 실적 조건"`

---

### Task 5: 훈련장 콘텐츠

**Files:**
- Modify: `src/adventure/data/v2/guildTrainingGround.ts`
- Modify: `src/app/api/v2/guild/training-ground/route.ts` (2단계 주간 보너스 지급 합산)
- Test: `src/adventure/data/v2/guildTrainingGround.test.ts`

**Interfaces:**
- Produces: 새 drill id `joint_tactics`, `warrior_deep`, `martial_deep`, `mage_deep`, `rogue_deep`, `survivor_deep`, `mutant_deep`, `elite_instructor`; 상수 `GUILD_TRAINING_WEEKLY_SECOND_BONUS_TARGET = 10`, `GUILD_TRAINING_WEEKLY_SECOND_BONUS_MASTERY = 60`, `GUILD_TRAINING_WEEKLY_SECOND_BONUS_MIN_LEVEL = 9`; `GuildTrainingState.weeklySecondBonusClaimed?: boolean`; `claimGuildTrainingDrill(state, drillId, buildingLevel = 1)`가 `weeklyBonusMastery`에 2단계 보너스까지 합산.

- [ ] **Step 0: 숙련 보정 확인** — 운영 DB 읽기 전용(`set default_transaction_read_only=on`)으로 최근 7일 `training_drill_claim` 활동의 `meta.rewardMastery` 평균과, 상위 길드원 `proficiency.v2` 저장값을 한 번 본다. Lv.10 하루 훈련 총량(기본 50+40+34+30+26에 +100%, 약 360)이 Lv.5 하루 총량(약 117)의 3배를 넘으므로, 상위 플레이어 하루 숙련 획득량에서 훈련 비중이 30%를 넘으면 새 훈련 기본값을 34/40/50 → 30/34/40으로 낮춘다. 결정과 근거 수치를 커밋 메시지에 남긴다.
- [ ] **Step 1: 실패 테스트 작성**

```ts
it("Lv.8 직군 심화 훈련은 현재 직군만 열린다", () => {
  const views = guildTrainingDrillViews({ state: emptyState, buildingLevel: 8, characterLevel: 100, hasJob: true, currentClass: "mage" });
  expect(views.find((v) => v.id === "mage_deep")?.available).toBe(true);
  expect(views.find((v) => v.id === "warrior_deep")?.lockedReason).toBe("전사 계열 전용");
  expect(views.find((v) => v.id === "elite_instructor")?.lockedReason).toBe("훈련장 Lv 10 필요");
});
it("Lv.10 일일 5회", () => {
  expect(trainingGroundUpgradeForLevel(10).unlockedDrillCount).toBe(5);
});
it("Lv.9 이상 주 10회째 훈련에 2단계 보너스 60", () => {
  const state = { ...emptyState, weeklyClaims: 9, weeklyBonusClaimed: true };
  expect(claimGuildTrainingDrill(state, "basic_stance", 9).weeklyBonusMastery).toBe(60);
  expect(claimGuildTrainingDrill(state, "basic_stance", 8).weeklyBonusMastery).toBe(0);
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildTrainingGround.test.ts` → FAIL
- [ ] **Step 3: 구현** — 스펙 3.1 표의 훈련 정의(제목·설명·대상·해금·기본값; 설명은 한 문장 존댓말). 직군 심화 훈련 제목은 「전사 심화 훈련」처럼 `GUILD_TRAINING_FOCUS_LABEL` + " 심화 훈련". `parseGuildTrainingState`는 `weeklySecondBonusClaimed`를 주차 단위로 읽는다. 라우트는 `claimGuildTrainingDrill`에 건물 레벨을 넘긴다.
- [ ] **Step 4: 통과 확인** — 같은 명령과 `npx vitest run src/app/api/v2/guild/training-ground` PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 훈련장 Lv.6~10 훈련과 주간 2단계 보너스"`

---

### Task 6: 탐사 본부 콘텐츠

**Files:**
- Create: `src/lib/server/guildMemberGrant.ts` (교역소 두 라우트의 `lockShopGrant`를 옮김)
- Modify: `src/app/api/v2/guild/trade-post/route.ts:829-878`, `src/app/api/v2/association/trade-post/route.ts:386` (공용 함수 사용)
- Modify: `src/adventure/data/v2/guildExploration.ts`
- Modify: `src/app/api/v2/guild/exploration/weekly/route.ts`
- Modify: `src/lib/server/guildExplorationWeekly.ts` (raidAttacks 컬럼 저장)
- Modify: `src/db/schema.ts` (`guildExplorationWeekly.raidAttackProgress integer not null default 0`) + `npm run db:generate`
- Modify: `src/lib/server/guildRaidAttack.ts` (실전 공격 성공 tx 안에서 `incrementGuildExplorationProgress(tx, guild.id, "raidAttacks", 1, now)`)
- Modify: `src/adventure/v2/guild/GuildExplorationPanel.tsx` (진행 중 원정 목록 표시)
- Test: `src/adventure/data/v2/guildExploration.test.ts`, `src/app/api/v2/guild/exploration/weekly/route.test.ts`(있으면), `src/lib/server/guildMemberGrant.test.ts`

**Interfaces:**
- Produces:
  - `type GuildMemberGrantOutput = { kind: "material"; materialId: string; count: number } | { kind: "stamina_potion"; count: number } | { kind: "mastery_certificate"; itemKey: string; count: number }`
  - `lockGuildMemberGrant(tx: Tx, userId: string, output: GuildMemberGrantOutput): Promise<() => Promise<void>>` (기존 동작 그대로)
  - `GuildExplorationExpeditionDef.memberReward?: GuildMemberGrantOutput`
  - `GuildExplorationContentState.activeExpeditions: GuildExplorationActiveExpedition[]` (`activeExpedition` 제거, 파서가 옛 단일 값을 배열로 변환)
  - `guildExplorationConcurrentLimit(level: number): number` → Lv.8 이상 2, 아니면 1
  - `guildExplorationDurationMinutes(def, level): number` → Lv.10이면 `Math.round(def.durationMinutes * 0.9)`
  - `startGuildExplorationExpedition(state, expeditionId, now, level)`; `claimGuildExplorationExpedition(state, now, expeditionId?)` → 지정 id(없으면 가장 먼저 끝난 것)만 회수
  - `guildExplorationEventIdsForLevel(level): GuildExplorationEventId[]` → Lv.10 미만 기존 3종, Lv.10 6종
  - 지표 `"raidAttacks"`, 의뢰 `weekly_raid_attack_60` (goal 60, rewardGold 4_000_000, rewardMapFragments 30, category "combat")

- [ ] **Step 1: 실패 테스트 작성**

```ts
it("옛 단일 원정 저장값을 배열로 읽는다", () => {
  const s = parseGuildExplorationContentState({ mapFragments: 0, restoredMaps: 0,
    activeExpedition: { expeditionId: "mist_forest", startedAt: "2026-10-10T00:00:00.000Z", endsAt: "2026-10-10T04:00:00.000Z" } });
  expect(s.activeExpeditions).toHaveLength(1);
  expect(s.activeExpeditions[0].expeditionId).toBe("mist_forest");
});
it("Lv.8부터 동시 2개, 같은 원정 중복 금지", () => {
  expect(guildExplorationConcurrentLimit(7)).toBe(1);
  expect(guildExplorationConcurrentLimit(8)).toBe(2);
  const one = startGuildExplorationExpedition(empty, "ancient_ruins", now, 8);
  expect(startGuildExplorationExpedition(one!, "ancient_ruins", now, 8)).toBeNull();
  expect(startGuildExplorationExpedition(one!, "mist_forest", now, 8)?.content.activeExpeditions).toHaveLength(2);
  expect(startGuildExplorationExpedition(one!, "mist_forest", now, 7)).toBeNull();
});
it("Lv.10 원정 시간 -10%", () => {
  expect(guildExplorationDurationMinutes(GUILD_EXPLORATION_EXPEDITIONS.abyss_corridor, 10)).toBe(1296);
  expect(guildExplorationDurationMinutes(GUILD_EXPLORATION_EXPEDITIONS.abyss_corridor, 9)).toBe(1440);
});
it("새 원정 정의", () => {
  expect(GUILD_EXPLORATION_EXPEDITIONS.frozen_peak).toMatchObject({ minLevel: 6, durationMinutes: 900, costGold: 6_000_000, rewardGold: 9_000_000, rewardFame: 200, mapFragments: 110, memberReward: { kind: "stamina_potion", count: 1 } });
  expect(GUILD_EXPLORATION_EXPEDITIONS.abyss_corridor).toMatchObject({ minLevel: 9, durationMinutes: 1440, costGold: 10_000_000, rewardGold: 15_000_000, rewardFame: 320, mapFragments: 170, memberReward: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 } });
});
it("Lv.10에서만 새 사건이 순환에 들어간다", () => {
  expect(guildExplorationEventIdsForLevel(9)).toHaveLength(3);
  expect(guildExplorationEventIdsForLevel(10)).toEqual(["collapsed_bridge","ancient_device","abandoned_cache","sealed_library","starlit_altar","lost_caravan"]);
});
it("토벌전 의뢰는 7번째 의뢰", () => {
  expect(GUILD_EXPLORATION_WEEKLY_MISSION_IDS[6]).toBe("weekly_raid_attack_60");
});
```
  라우트 테스트: 귀환 수령 시 `memberReward`가 회수 시점 길드원 전원에게 지급(교역소 지급 테스트와 같은 방식으로 검증). `lockGuildMemberGrant`는 기존 교역소 지급 테스트가 그대로 PASS.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildExploration.test.ts src/app/api/v2/guild/exploration src/app/api/v2/guild/trade-post src/app/api/v2/association/trade-post` → FAIL
- [ ] **Step 3: 구현**
  - `lockShopGrant` 두 벌을 `lockGuildMemberGrant`로 합친다(`guild_facility_support` 출력은 호출부에서 계속 따로 처리).
  - 새 사건 3종은 스펙 3.2 표 그대로(선택 id: `decode`/`sell_books`, `restore_altar`/`collect_offerings`, `secure_cargo`/`record_route`; `GuildExplorationEventChoiceId`에 추가). 사건 설명은 한 문장.
  - `restoreGuildExplorationMap(state, level)`이 `guildExplorationEventIdsForLevel(level)`로 순환.
  - 라우트: dispatch는 동시 한도·중복을 검사(오류 `expedition_active`)하고, `claim_expedition`은 body의 `expeditionId`(선택)를 받는다. 회수 시 `memberReward`가 있으면 `guildMemberIds(tx, guildId)` 전원에게 `lockGuildMemberGrant`.
  - 패널: 진행 중 원정을 목록으로 보여주고 원정마다 회수 버튼을 둔다. 기존 카드 스타일 재사용.
- [ ] **Step 4: 통과 확인** — 같은 명령 PASS. `npx vitest run src/lib/server/guildRaid src/app/api/v2/guild/raid` PASS(토벌전 연습 공격은 지표를 올리지 않는 테스트 추가).
- [ ] **Step 5: 커밋** — `git commit -m "feat: 탐사 본부 Lv.6~10 원정·동시 파견·토벌전 의뢰·사건"`

---

### Task 7: 길드 식당 콘텐츠

**Files:**
- Modify: `src/adventure/data/v2/guildDining.ts`
- Modify: `src/app/api/v2/guild/dining-hall/route.ts` (식사 시 시설 레벨 배율 전달)
- Modify: `src/adventure/v2/guild/GuildDiningHallPanel.tsx` (메뉴 지속 시간 표기가 배율을 반영)
- Test: `src/adventure/data/v2/guildDining.test.ts`

**Interfaces:**
- Produces: 메뉴 id `deep_sea_course`, `heroes_feast`, `grand_recovery_feast`, `royal_banquet`; `guildDiningEffectDurationMultiplier(level: number): number` → Lv.8 이상 1.5, 아니면 1; `activeEffectForMenu(menu, { currentEffect, now, weekKey, durationMultiplier?: number })`

- [ ] **Step 1: 실패 테스트 작성**

```ts
it("Lv.10 메뉴 10종", () => {
  expect(guildDiningMenusForFacilityLevel(10).map((m) => m.id)).toEqual(expect.arrayContaining(["deep_sea_course","heroes_feast","grand_recovery_feast","royal_banquet"]));
  expect(guildDiningMenusForFacilityLevel(5)).toHaveLength(6);
});
it("Lv.8 이상 지속 1.5배", () => {
  const menu = GUILD_DINING_MENUS.find((m) => m.id === "heroes_feast")!;
  const now = new Date("2026-10-13T00:00:00Z");
  const effect = activeEffectForMenu(menu, { currentEffect: null, now, weekKey: "2026-10-12", durationMultiplier: guildDiningEffectDurationMultiplier(8) });
  expect(effect!.expiresAt - now.getTime()).toBe(4.5 * 3600_000);
  expect(effect!.bonusPct).toBe(75);
});
it("왕실 대연회 사냥 90 생활 30", () => {
  const menu = GUILD_DINING_MENUS.find((m) => m.id === "royal_banquet")!;
  expect(menu.effect).toMatchObject({ kind: "all_xp", bonusPct: 90, lifeBonusPct: 30 });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildDining.test.ts` → FAIL
- [ ] **Step 3: 구현** — 스펙 3.3 표. 회복 대연회는 `recovery` hp/mp 1_000_000. 메뉴 설명 문구는 기존 형식(`${시간}시간 동안 … 증가합니다.`). 협회 식당 경로는 배율 1을 넘긴다.
- [ ] **Step 4: 통과 확인** — 같은 명령, `npx vitest run src/app/api/v2/guild/dining-hall src/lib/server/guildDining` PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 길드 식당 Lv.6~10 메뉴와 지속 시간 배율"`

---

### Task 8: 연금 공방 콘텐츠

**Files:**
- Modify: `src/adventure/data/v2/guildAlchemy.ts`
- Test: `src/adventure/data/v2/guildAlchemy.test.ts`

**Interfaces:**
- Produces: 레시피 id `refined_catalyst`, `concentrated_ink`, `transcendent_solution`, `volatile_crystal`, `sage_elixir` (스펙 3.4 표 값)

- [ ] **Step 1: 실패 테스트 작성**

```ts
it.each([
  ["refined_catalyst", 6, 14, { herb: 22, silverleaf: 2 }],
  ["concentrated_ink", 7, 16, { herb: 26, silverleaf: 3 }],
  ["transcendent_solution", 8, 6, { herb: 40, silverleaf: 4 }],
  ["volatile_crystal", 9, 20, { herb: 36, silverleaf: 4 }],
  ["sage_elixir", 10, 45, { herb: 75, silverleaf: 9 }],
])("%s", (id, level, energy, ingredients) => {
  expect(guildAlchemyRecipe(id)).toMatchObject({ minFacilityLevel: level, energyCost: energy, ingredients });
});
it("결과물", () => {
  expect(guildAlchemyRecipe("refined_catalyst")).toMatchObject({ output: "material", outputMaterialId: ENHANCE_STONE_MATERIAL_ID.blue, outputMaterialAmount: 2 });
  expect(guildAlchemyRecipe("concentrated_ink")).toMatchObject({ outputMaterialId: SUMMON_SCROLL_MATERIAL_ID, outputMaterialAmount: 5 });
  expect(guildAlchemyRecipe("transcendent_solution")).toMatchObject({ output: "charge", chargeAmount: 7_000_000 });
  expect(guildAlchemyRecipe("volatile_crystal")).toMatchObject({ outputMaterialId: ENHANCE_STONE_MATERIAL_ID.red, outputMaterialAmount: 2 });
  expect(guildAlchemyRecipe("sage_elixir")).toMatchObject({ output: "stamina_potion", staminaPotionAmount: 3 });
});
```

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildAlchemy.test.ts` → FAIL
- [ ] **Step 3: 구현** — 레시피 5종 추가. 설명은 기존 레시피처럼 한 문장.
- [ ] **Step 4: 통과 확인** — 같은 명령, `npx vitest run src/app/api/v2/guild/alchemy-workshop src/lib/server/guildAlchemyWorkshopRoute.test.ts` PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 연금 공방 Lv.6~10 레시피"`

---

### Task 9: 길드 교역소 콘텐츠

**Files:**
- Modify: `src/adventure/data/v2/guildTrade.ts` (교환 품목 5종, 출력 종류 `guild_facility_support_advanced`)
- Modify: `src/adventure/data/v2/guildFacilitySupport.ts` (`guildAdvancedFacilitySupportAllocation`)
- Modify: `src/app/api/v2/guild/trade-post/route.ts` (상위 지원 물자 구매·대상 목록)
- Modify: `src/adventure/v2/guild/GuildTradePostPanel.tsx` (상위 지원 물자 대상 선택)
- Test: `src/adventure/data/v2/guildTrade.test.ts`, `src/adventure/data/v2/guildFacilitySupport.test.ts`, `src/adventure/v2/guild/GuildTradePostPanel.test.tsx`

**Interfaces:**
- Consumes: Task 6 `lockGuildMemberGrant`
- Produces: 품목 id `summon_scroll_bundle`, `map_fragment_bundle`, `grand_fame_document`, `blue_stone_supply`, `advanced_facility_supplies`; `guildAdvancedFacilitySupportAllocation(cost: SettlementBuildingUpgradeCost, donated: SettlementResources): { cypress: number; adamantite: number; total: 200 } | null` (키는 `WOODCUTTING_MATERIAL_ID.cypress`, `MINING_MATERIAL_ID.adamantite` 자원 키 기준, 배분 규칙은 기존 `guildFacilitySupportAllocation`과 동일)

- [ ] **Step 0: 토큰 가격 확인** — 운영 DB 읽기 전용으로 상위 10개 길드의 주간 공동 토큰 획득량(`trade_delivery` 납품 점수 × Lv.5 보너스 기준)을 추정한다. 새 5종을 주간 한도까지 모두 사는 비용(150×2+180+400×2+350+300×2 = 2,230토큰)이 Lv.10 상위 길드 주간 획득량의 60%를 넘으면 가격을 같은 비율로 낮춘다. 결정과 근거를 커밋 메시지에 남긴다.
- [ ] **Step 1: 실패 테스트 작성**

```ts
it("Lv.6~10 교환 품목", () => {
  const byId = Object.fromEntries(GUILD_TRADE_SHOP_ITEMS.map((i) => [i.id, i]));
  expect(byId.summon_scroll_bundle).toMatchObject({ minFacilityLevel: 6, tokenCost: 150, weeklyLimit: 2, target: "members", output: { kind: "material", materialId: SUMMON_SCROLL_MATERIAL_ID, count: 1 } });
  expect(byId.map_fragment_bundle).toMatchObject({ minFacilityLevel: 7, tokenCost: 180, weeklyLimit: 1, target: "members", output: { kind: "material", materialId: TORN_MAP_FRAGMENT_MATERIAL_ID, count: 1 } });
  expect(byId.grand_fame_document).toMatchObject({ minFacilityLevel: 8, tokenCost: 400, weeklyLimit: 2, target: "guild" });
  expect(byId.blue_stone_supply).toMatchObject({ minFacilityLevel: 9, tokenCost: 350, weeklyLimit: 1, target: "members", output: { kind: "material", materialId: ENHANCE_STONE_MATERIAL_ID.blue, count: 1 } });
  expect(byId.advanced_facility_supplies).toMatchObject({ minFacilityLevel: 10, tokenCost: 300, weeklyLimit: 2, target: "guild", output: { kind: "guild_facility_support_advanced" } });
});
it("상위 지원 물자 배분", () => {
  const cost = { [WOODCUTTING_MATERIAL_ID.cypress]: 2000, [MINING_MATERIAL_ID.adamantite]: 2000 };
  expect(guildAdvancedFacilitySupportAllocation(cost, { [WOODCUTTING_MATERIAL_ID.cypress]: 1950 })).toEqual({ cypress: 50, adamantite: 150, total: 200 });
  expect(guildAdvancedFacilitySupportAllocation(cost, { [WOODCUTTING_MATERIAL_ID.cypress]: 2000, [MINING_MATERIAL_ID.adamantite]: 1900 })).toBeNull();
});
```
  라우트: 길드 명성 대문서 구매 → `fameTotal`·`fameAvailable` +300. 상위 지원 물자 구매 → 선택 시설 기부 진행도에 편백·아다만타이트 반영, 활동 로그 `facilitySupport`에 두 수량 기록.

- [ ] **Step 2: 실패 확인** — `npx vitest run src/adventure/data/v2/guildTrade.test.ts src/adventure/data/v2/guildFacilitySupport.test.ts src/app/api/v2/guild/trade-post` → FAIL
- [ ] **Step 3: 구현** — 길드 명성 대문서는 기존 `guild_fame_document` 처리 경로에 수량만 다르게 태운다(출력 정의를 확인해 같은 kind 재사용). 상위 지원 물자는 기존 지원 물자의 대상 계산·구매 분기를 같은 모양으로 복제하되 자원 키만 다르게 한다. `GuildActivityMeta.facilitySupport`에 `cypress?`, `adamantite?` 추가.
- [ ] **Step 4: 통과 확인** — 같은 명령과 `npx vitest run src/adventure/v2/guild` PASS
- [ ] **Step 5: 커밋** — `git commit -m "feat: 길드 교역소 Lv.6~10 교환 품목과 상위 시설 지원 물자"`

---

### Task 10: 매뉴얼과 전체 검증

**Files:**
- Modify: `src/app/manual/content/guild.tsx`

- [ ] **Step 1: 매뉴얼 갱신** — 길드 시설 절: 1차 5종 최대 Lv.10, 제작소·창고·협회 Lv.5 명시. 비용 표 두 개를 Lv.10까지(표가 업그레이드 배열을 순회하므로 대상 배열 확인). "운영 실적" 소절 신설: 주간 상한, 단계별 목표, 활동별 점수 표. 탐사 본부 절에 동시 파견·시간 단축·길드원 전원 보상 한 줄씩. 식당 표 캡션에 Lv.8 지속 배율. 문장은 짧게, "v2"·대시 금지.
- [ ] **Step 2: 전체 검증**
  - `NODE_OPTIONS=--max-old-space-size=4096 npx tsc --noEmit` → 오류 0
  - `npm run lint` → 오류 0
  - `npx vitest run` → 전부 PASS (실패하면 원인 수정, 기존 실패라면 main에서도 실패하는지 확인해 보고)
  - `npm run build` → 성공
- [ ] **Step 3: 화면 확인** — `/dev` 미리보기 또는 로컬 실행으로 시설 카드의 실적 줄, Lv.6+ 패널을 라이트·다크 모드에서 확인(배경 비침 없음).
- [ ] **Step 4: 커밋** — `git commit -m "docs: 매뉴얼에 길드 시설 Lv.6~10과 운영 실적 반영"`
