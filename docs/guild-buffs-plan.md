# 길드 버프 시스템

> 상태: ✅ **구현 완료** — 길드 버프 시스템 출고. 이 문서는 설계 기록.

길드의 누적 명성(`fameAvailable`)을 소비해 멤버 전원이 받는 영구 보조 효과를 켜는 시스템. `docs/guild-quests-plan.md` 의 Phase C 를 별도 문서로 분리.

> **원칙** — 전투 보조(EXP/골드/드랍) 한 축에 집중. 새 인프라 도입 X — 기존 `onBattleEnd` 리워드 파이프라인에 곱셈 한 줄 끼우는 식. 발란스 폭발을 막기 위해 **개별 +5% 상한 × 슬롯 수 제한**으로 자연스럽게 cap.

---

## 1. 컨셉

| 항목 | 내용 |
|---|---|
| **효과 대상** | 길드 소속 멤버 전원 (마스터/멤버 동일) |
| **적용 시점** | 활성화 즉시. 다음 전투부터 반영 |
| **소비 자원** | `guilds.fameAvailable` (이미 schema 존재) |
| **슬롯 수** | 길드 등급 연동 (F=1, D=2, B=3, S=4) |
| **버프당 티어** | T1 ~ T5 (5단계 업그레이드) |
| **편집 권한** | 마스터만 슬롯 변경/업그레이드. 멤버는 조회만 |
| **다운그레이드** | 슬롯 해제 시 누적 투자의 50% `fameAvailable` 환급 |
| **스택** | 같은 종류 버프는 한 슬롯만. 슬롯 간 효과는 **곱셈** (additive 가 아님) |
| **상한** | 단일 버프 +5%, 슬롯 4개 모두 채워도 효과별 ×1.05^N 로 자연 cap |

핵심 디자인 의도: 길드 가입의 **체감 보상**을 즉시 주되, 솔로 플레이 대비 압도적이지 않도록(최대 +5%×4 ≈ 1.21배) 억제. 무엇을 채울지가 마스터의 **유의미한 선택**이 되도록 슬롯 수 < 버프 종류 수.

---

## 2. 등급별 슬롯

`docs/guild-quests-plan.md` §2 표와 동일:

| 등급 | 누적 명성 임계 | 버프 슬롯 |
|---|---|---|
| G | 0 | 0 |
| F | 200 | 1 |
| E | 600 | 1 |
| D | 1500 | 2 |
| C | 3500 | 2 |
| B | 8000 | 3 |
| A | 18000 | 3 |
| S | 40000 | 4 |

등급 강등(자동 위임 등으로 fameTotal 재계산되지는 않으므로 실질 강등 없음)은 고려 X. 등급이 올라가면 잠겨있던 슬롯이 즉시 해방.

---

## 3. 버프 카탈로그 (Phase A — 전투 보조 5종)

전부 곱셈 배율. 모두 `gradeRequired: F` 부터 잠금 해제 (별도 등급 게이트 없음 — 슬롯 자체가 게이트).

| ID | 이름 | 효과 (T1 → T5) | 적용 지점 |
|---|---|---|---|
| `exp_boost` | **사냥경험 결사** | EXP +1% / +2% / +3% / +4% / +5% | `onBattleEnd.addExp` 인자 |
| `gold_boost` | **황금손 결사** | 골드 드랍량 +1% / +2% / +3% / +4% / +5% | `drop.kind === "gold"` amount |
| `drop_boost` | **행운의 별 결사** | 드랍 확률 +0.5% / +1% / +1.5% / +2% / +2.5% (additive to LUK multiplier) | `adjustedChance` 곱셈 |
| `fame_boost` | **명성 결사** | 개인 명성 +1% / +2% / +3% / +4% / +5% | `addGoldFame` fame 인자 |
| `boss_attempt` | **결의의 깃발** | 보스 일일 시도 +1 / +1 / +2 / +2 / +3 (특수 — 곱셈 아님) | `bossAttempts` 일일 캡 |

> **참고**: 5개 슬롯 정의 vs 최대 4 슬롯 → 마스터의 **취사선택**이 의미를 가짐.

### 3.1 드랍 확률 buff 의 정확한 의미

기존 LUK 공식 (`onBattleEnd.ts`):
```ts
const luckMultiplier = 1 + deps.luk * 0.01;
const adjustedChance = Math.min(1, drop.chance * luckMultiplier);
```

여기에 길드 버프 합성:
```ts
const guildDropBonus = 1 + (activeBuff("drop_boost")?.effect ?? 0); // 0.005 ~ 0.025
const adjustedChance = Math.min(1, drop.chance * luckMultiplier * guildDropBonus);
```

LUK 와 곱하기 때문에 LUK 가 높은 멤버일수록 절대값 증가가 큼 — 의도.

---

## 4. 업그레이드 비용 (`fameAvailable` 소비)

기하 증가 곡선. **T1 → T5 누적 합 13,000 명성** = S급 길드의 누적 명성 임계(40k)에서도 단일 버프 만렙은 1/3 비용.

| 티어 | 신규 설치 비용 | 누적 합 |
|---|---|---|
| T1 | 1,000 | 1,000 |
| T2 | +2,000 | 3,000 |
| T3 | +3,000 | 6,000 |
| T4 | +3,000 | 9,000 |
| T5 | +4,000 | 13,000 |

**다운그레이드/슬롯 해제**: 누적 투자 × 0.5 환급. 예: T3 (누적 6,000) 해제 → 3,000 환급.

### 4.1 슬롯 교체 패널티

설치된 버프를 **다른 종류로 교체**하려면 기존 버프를 먼저 해제(50% 환급). 직접 교체 X — 의도적 비용 부담으로 "잠깐 다른 거 끼워보자" 남용 차단.

---

## 5. DB 스키마

JSONB 한 컬럼 vs 별도 row — 슬롯 4개 이하 + 자주 read/rare write 라 **JSONB 한 컬럼**으로.

### 5.1 `guilds` 컬럼 추가

```ts
export const guilds = pgTable("guilds", {
  // 기존…
  fameTotal: integer("fame_total").notNull().default(0),
  fameAvailable: integer("fame_available").notNull().default(0),
  // 신규 — Phase C
  buffs: jsonb("buffs").$type<GuildBuffSlot[]>().notNull().default(sql`'[]'::jsonb`),
});
```

```ts
export type GuildBuffId =
  | "exp_boost"
  | "gold_boost"
  | "drop_boost"
  | "fame_boost"
  | "boss_attempt";

export type GuildBuffSlot = {
  buffId: GuildBuffId;
  tier: 1 | 2 | 3 | 4 | 5;
  installedAt: string;   // ISO timestamp (감사 로그용)
};
```

### 5.2 마이그

`drizzle/0XXX_guild_buffs.sql`:
```sql
ALTER TABLE guilds ADD COLUMN buffs jsonb NOT NULL DEFAULT '[]'::jsonb;
```

별도 audit table 은 보류 (필요해지면 `guild_buff_history` 추가). MVP 는 JSONB in-place 갱신만.

---

## 6. 버프 카탈로그 (코드)

`src/adventure/data/guildBuffs.ts` 신규:

```ts
export type GuildBuffEffect =
  | { kind: "exp_mult"; value: number }      // 1.01 ~ 1.05
  | { kind: "gold_mult"; value: number }
  | { kind: "drop_mult"; value: number }     // 1.005 ~ 1.025
  | { kind: "fame_mult"; value: number }
  | { kind: "boss_attempt_bonus"; value: number };  // +1 ~ +3

export type GuildBuffDef = {
  id: GuildBuffId;
  name: string;
  description: string;
  tiers: {
    tier: 1 | 2 | 3 | 4 | 5;
    installCost: number;     // fameAvailable 소비량 (현재 티어로 가는 비용)
    cumulativeCost: number;  // 누적 합 (환급 계산용)
    effect: GuildBuffEffect;
  }[];
};

export const GUILD_BUFFS: Record<GuildBuffId, GuildBuffDef> = { /* … */ };

export function resolveBuffMultiplier(
  buffs: GuildBuffSlot[],
  kind: GuildBuffEffect["kind"],
): number {
  const slot = buffs.find(s => GUILD_BUFFS[s.buffId].tiers[s.tier - 1].effect.kind === kind);
  if (!slot) return kind === "boss_attempt_bonus" ? 0 : 1;
  return GUILD_BUFFS[slot.buffId].tiers[slot.tier - 1].effect.value;
}
```

### 6.1 슬롯 수 헬퍼

```ts
export function buffSlotsForGrade(grade: GuildQuestGrade): number {
  switch (grade) {
    case "G": return 0;
    case "F": case "E": return 1;
    case "D": case "C": return 2;
    case "B": case "A": return 3;
    case "S": return 4;
  }
}
```

---

## 7. API

`src/app/api/guilds/buffs/`:

| 엔드포인트 | 메서드 | 권한 | 동작 |
|---|---|---|---|
| `/` | GET | 멤버 | 현재 슬롯 + 카탈로그 + 잔여 `fameAvailable` |
| `/install` | POST | 마스터 | body: `{ buffId }` → T1 신규 설치 (빈 슬롯 + 비용 검증) |
| `/upgrade` | POST | 마스터 | body: `{ buffId }` → 현재 티어 +1 (T5 거부 + 비용 검증) |
| `/uninstall` | POST | 마스터 | body: `{ buffId }` → 슬롯 비움 + 50% 환급 |

모든 mutation은 `db.transaction` + `SELECT … FOR UPDATE` 로 race-safe. JSONB 갱신은 read-modify-write 라 잠금 필수.

### 7.1 슬롯 한도 검증

```ts
const grade = gradeForFame(guild.fameTotal);
const maxSlots = buffSlotsForGrade(grade);
if (guild.buffs.length >= maxSlots) throw new Error("슬롯 부족");
```

---

## 8. 적용 흐름 — `onBattleEnd` 통합

현재 (`src/adventure/battle/onBattleEnd.ts:72-97`):
```ts
deps.characterState.addExp(payload.rewards.exp, deps.vit);
// …
deps.characterState.addGoldFame(drop.amount, 0);
```

수정 후:
```ts
const buffs = deps.guildBuffs ?? [];                              // /api/guilds/me 에서 들고옴
const expMult = resolveBuffMultiplier(buffs, "exp_mult");          // 1.0 ~ 1.05
const goldMult = resolveBuffMultiplier(buffs, "gold_mult");
const fameMult = resolveBuffMultiplier(buffs, "fame_mult");
const dropMult = resolveBuffMultiplier(buffs, "drop_mult");        // 1.0 ~ 1.025

deps.characterState.addExp(Math.floor(payload.rewards.exp * expMult), deps.vit);
// …
deps.characterState.addGoldFame(
  Math.floor(drop.amount * goldMult),
  Math.floor(baseFame * fameMult),
);

// drop 롤:
const adjustedChance = Math.min(1, drop.chance * luckMultiplier * dropMult);
```

### 8.1 클라이언트 캐시 전략

- `useGuildState()` 훅이 `/api/guilds/me` 응답의 `buffs` 를 메모리에 보관
- 전투마다 props 로 `onBattleEnd` 에 전달
- 마스터가 슬롯 변경하면 다음 `me` poll(~30s) 또는 명시적 invalidate 시 갱신
- 즉시성이 필요한 경우 슬롯 변경 후 `refreshGuild()` 강제 호출

### 8.2 보스 시도 버프 (`boss_attempt`)

곱셈 아닌 가산. `bossAttempts` 일일 캡 계산 시점에 추가:
```ts
const dailyCap = BASE_BOSS_ATTEMPTS + resolveBuffMultiplier(buffs, "boss_attempt_bonus");
```

---

## 9. UI

`GuildHallView` 안에 새 sub-panel "길드 버프" (멤버 목록 위, 주간 의뢰 아래):

```
┌─────────────────────────────────────────┐
│ 길드 버프  (B급 / 슬롯 2 / 3 사용)          │
│ 사용 가능 명성: 4,200                     │
│                                          │
│ [슬롯 1] 사냥경험 결사 T3 (+3% EXP)        │
│         [업그레이드 → T4: 3,000 명성]    │
│         [해제 (3,000 환급)]              │
│                                          │
│ [슬롯 2] 황금손 결사 T2 (+2% 골드)         │
│         [업그레이드] [해제]               │
│                                          │
│ [슬롯 3] (빈 슬롯)                        │
│         [버프 선택…] ← 카탈로그 모달       │
│                                          │
│ [잠긴 슬롯 4] — S급 도달 시 해방          │
└─────────────────────────────────────────┘
```

- 마스터: 모든 액션 버튼 활성
- 멤버: 슬롯 정보 read-only, "이 버프가 내 사냥에 적용 중" 표시
- 버프 선택 모달: 카탈로그 5개 카드. 이미 설치된 종류는 disabled

### 9.1 모바일 레이아웃

세로 카드 스택. 슬롯당 한 카드. 카테고리 탭 사이에 들어가는 것보다 `guild_hall` sub-view 내부 sub-view 로 분리 권장 — 메모리 룰 `feedback_subview_navigation.md` 와 일치.

---

## 10. 발란스 시뮬

S급 만렙(슬롯 4개 모두 T5) 가정:
- EXP × 1.05
- 골드 × 1.05
- 명성 × 1.05
- 드랍 × 1.025 (LUK 50 인 캐릭터의 50% 드랍이 → 53.8% 로)

복합 효과 ≈ **시간당 보상 +13~16%**. 길드 가입 메리트는 명확하지만 솔로의 두 배가 되거나 하지는 않음. 발란스 안전선.

명성 비용: 한 슬롯 만렙 13,000 × 4 = 52,000 → S급 임계(40k)를 넘는 누적이 필요 → "S급 안착 후 1년+ 운영 길드의 보상".

---

## 11. 단계별 구현

### Phase 1 — DB + API + 카탈로그 (~2일)

- [ ] `guilds.buffs` JSONB 컬럼 + 마이그
- [ ] `GUILD_BUFFS` 카탈로그 5종 + `resolveBuffMultiplier`
- [ ] API 4개 (`/buffs/`, `/install`, `/upgrade`, `/uninstall`)
- [ ] 마스터/멤버/슬롯한도/비용 서버 검증 + 트랜잭션

### Phase 2 — 전투 통합 (~1일)

- [ ] `useGuildState` 가 `buffs` 캐시
- [ ] `onBattleEnd` 에 4개 멀티플라이어 통합
- [ ] `boss_attempt` 가산 적용
- [ ] 회귀 테스트 (LUK + guild_buff 곱셈 정확성)

### Phase 3 — UI (~2일)

- [ ] `GuildHallView` 에 버프 sub-panel
- [ ] 버프 선택 모달 (카탈로그)
- [ ] 슬롯 잠금 표시 (등급별)
- [ ] 마스터/멤버 권한 분기

### Phase 4 — 확장 (필요 시)

- [ ] 비전투 버프 (제작 성공률, 거래소 수수료 감면 등) — 별도 plan
- [ ] 버프 변경 audit log (`guild_buff_history`)
- [ ] 버프 변경 시스템 우편 (멤버 통지)

---

## 12. 결정 사항 (확정)

| 항목 | 값 |
|---|---|
| 효과 축 (Phase A) | EXP / 골드 / 드랍 / 명성 / 보스시도 |
| 단일 버프 상한 | +5% (보스시도는 +3) |
| 티어 단계 | T1~T5 |
| 슬롯 수 | F·E=1, D·C=2, B·A=3, S=4 |
| 누적 만렙 비용 | 13,000 명성/버프 |
| 다운그레이드 환급 | 누적 투자 × 0.5 |
| 편집 권한 | 마스터 단독 |
| 적용 시점 | 즉시 (다음 전투부터) |
| 스택 규칙 | 같은 종류 1슬롯만, 슬롯 간 곱셈 |
| 저장 방식 | `guilds.buffs` JSONB |

---

## 13. 결정 보류

- 비전투 버프 (제작/거래소) — Phase 4 분리
- 버프 일시 비활성화 토글 (PvP 도입 시 필요 가능) — 현재 PvP 없음
- 멤버 투표제 — 현재 마스터 단독
- 버프 효과 가시화 (전투 결과 화면에 "+5 EXP 길드 보너스" 표시) — UX 폴리시 단계
- 시즌제 리셋 vs 영구 — guild-quests-plan 과 일관되게 영구
