# 길드 누적 의뢰 + 길드 명성 시스템

> 상태: ✅ **구현 완료** — 길드 누적 의뢰 + 명성 출고. 이 문서는 설계 기록.

길드 시스템 Phase 3 의 핵심 콘텐츠 — 멤버들이 평소 사냥/활동을 하면 길드가 함께 채워가는 주간 의뢰. 길드 명성으로 등급이 올라가고, 추후 길드 버프 업그레이드 자원으로도 쓰인다.

> **원칙** — 게임 컨셉(퀘스트 진행 중심) 위에 자연스럽게 얹는다. 새 인프라 도입 X (cron + 서버 트랜잭션). MVP 한 종류 의뢰 동사로 시작 → 검증 후 확장.

---

## 1. 컨셉

| 항목 | 내용 |
|---|---|
| **수락 흐름** | 마스터가 길드 회관에서 주간 후보 중 1개를 "수락" → 활성화. 동시 활성 1개 |
| **누적 방식** | 활성화 이후 멤버 모두의 사냥/활동이 자동 카운트 (수락 *전* 처치는 무효) |
| **발행 주기** | 매주 월요일 00:00 KST cron 으로 길드별 후보 3개 자동 생성 |
| **마감** | 일요일 23:59 KST 미완료 의뢰 소멸 |
| **보상** | 모든 멤버에게 균등 우편 (골드/재료/제작서) + 길드 명성 적립 |
| **개인 명성 → 길드 명성 동반 적립** | 멤버가 캐릭터 명성을 벌 때 같은 양이 길드 누적·사용가능에도 가산 |
| **명성 두 컬럼** | **누적 명성** (영구, 등급 결정) + **사용 가능 명성** (소비형, 버프 업그레이드 자원) |

### 1.1 명성 누적 vs 사용 가능

```
의뢰 보상 / 멤버 개인 명성 적립
  ↓ 둘 다 +N
누적 명성 (fameTotal)        사용 가능 명성 (fameAvailable)
   = 영구 표시값             = 버프 업그레이드 시 소비
   = 등급 결정               = 누적과 동일하게 시작 후 차감
```

예: 100 누적 → 표시 "100", 사용 가능 100. 버프 업글로 50 사용 → 표시 여전히 "100", 사용 가능 50.

작은 길드(3명) + 주간 1건이라 "이번 주 같이 산적 100명 처치하자" 같은 의식적 협력 구도.

---

## 2. 길드 등급 (알파벳 8단계)

길드의 위상 = 누적 명성에 따라 자동 결정. 의뢰 풀과 (Phase 별도) 버프 슬롯이 등급에 연동.

| 등급 | 누적 명성 임계 | 의뢰 풀 (슬라이딩 윈도우 ±2) | 버프 슬롯 (Phase 별도) |
|---|---|---|---|
| G | 0 | G | — |
| F | 200 | G ~ F | 1 |
| E | 600 | G ~ F | 1 |
| D | 1500 | F ~ D | 2 |
| C | 3500 | E ~ C | 2 |
| B | 8000 | D ~ B | 3 |
| A | 18000 | C ~ A | 3 |
| S | 40000 | A ~ S 전체 상위 | 4 |

### 2.1 슬라이딩 윈도우 풀 게이팅

길드 등급 ±2 단계 안의 의뢰만 추첨. 단순 누적 해금 대신 **옛 의뢰는 자동으로 빠지고** 한 단계 위 의뢰가 들어오는 식. 후반에 보상 인플레와 자연스럽게 매칭되고 너무 쉬운 의뢰가 후보에 안 끼게.

세부 규칙:
- 등급 G/F 시작은 G 풀에서만 (아래 단계 없음)
- 등급 D 부터: 자기 등급 −2 ~ +2 풀
- 등급 S 끝: 자기 등급 ~ 위쪽 (있다면) 풀. 즉 콘텐츠 추가되면 해당 부분 자연스럽게 채움

### 2.2 도달감 추정

주당 +150 명성(현재 콘텐츠) 가정 → 콘텐츠 늘어 +500/주 가능 가정:

| 등급 | 도달 (현재) | 도달 (확장 후) |
|---|---|---|
| F | 1~2주 | <1주 |
| E | 1개월 | 1~2주 |
| D | 2~3개월 | 1개월 |
| C | 5~6개월 | 2개월 |
| B | 1년+ | 4~5개월 |
| A | 2~3년 | 1년 |
| S | 5년+ | 2년+ (장기 도전) |

---

## 3. 사용자 흐름

### 3.1 주간 발행 (cron, 월요일 00:00 KST)

1. 모든 활성 길드 순회
2. 길드의 누적 명성 → 현재 등급 산출 → 슬라이딩 윈도우(±2) 의뢰 풀 결정
3. 풀에서 3개 무작위 추첨 → `guild_quest_instances` 에 status='proposed' 로 생성
4. 마스터에게 시스템 우편 "이번 주 길드 의뢰 후보 3건이 발행되었습니다"

### 3.2 수락 (마스터)

길드 회관 → "주간 의뢰" 패널 → 후보 3개 카드 노출 → "수락" 1개 선택 → 나머지 2개 dismissed. 결정 후 변경 X.

### 3.3 누적

활성 의뢰가 있는 길드 멤버의 트리거 액션:
- 몬스터 처치: `onBattleEnd` 시점 클라이언트가 `POST /api/guilds/quests/progress` 호출 (배치)
- 재료 획득: 드랍 발생 시 동일
- 보스 클리어: kill_boss task 매칭 시

서버는 atomic increment 로 progress 증가, target 도달 시 자동 완료.

### 3.4 완료 / 보상

1. status='completed', completedAt=now()
2. `guilds.fameTotal += reward.fame`
3. `guilds.fameAvailable += reward.fame`
4. 멤버 각자에게 우편 (kind='guild_quest_reward')
5. 다음 우편 수령은 기존 marketplace_inbox claim 흐름

### 3.5 개인 명성 → 길드 명성 동반 적립

멤버가 캐릭터 명성을 벌 때마다 (의뢰/보스/시련 등) — 그 양만큼 본인 길드의 fameTotal/fameAvailable 둘 다에 가산. 길드 의뢰 외에도 멤버 개별 활동이 길드 위상으로 직접 환원.

서버: character.fame 증분 트리거 시점에 `guild_members` 검사 → 본인이 속한 활성 길드의 fameTotal/Available 같이 증가 (트랜잭션 내).

### 3.6 마감 (cron, 일요일 23:59 KST)

- status='active' AND progress < target → status='expired'
- status='proposed' 미수락 → status='expired'

월요일 00:00 KST 새 cycle 시작.

---

## 4. 의뢰 데이터 구조

`src/adventure/data/guildQuests.ts`:

```ts
export type GuildQuestGrade = "G" | "F" | "E" | "D" | "C" | "B" | "A" | "S";

export type GuildQuestTask =
  | { kind: "kill_monster"; monsterName: string; count: number }
  | { kind: "kill_boss"; monsterName: string; count: number }
  | { kind: "collect_material"; materialId: MaterialId; count: number };

export type GuildQuestReward = {
  fame: number;
  goldPerMember: number;
  materials?: { materialId: MaterialId; count: number }[];
  items?: { itemId: ItemId; count: number }[];
};

export type GuildQuestDef = {
  id: string;
  name: string;
  description: string;
  grade: GuildQuestGrade;
  task: GuildQuestTask;
  reward: GuildQuestReward;
};

export const GUILD_GRADE_THRESHOLDS: Record<GuildQuestGrade, number> = {
  G: 0,
  F: 200,
  E: 600,
  D: 1500,
  C: 3500,
  B: 8000,
  A: 18000,
  S: 40000,
};

// 슬라이딩 윈도우 ±2 — 길드 등급 D 면 F~B 풀에서 추첨.
export const QUEST_POOL_WINDOW = 2;
```

### 4.1 의뢰 풀 예시 (Phase A — G/F 등급만 시작)

**G 등급 (시작)**:
- 슬라임 사냥: 슬라임 100마리 — 명성 +20 / 멤버당 200G + 슬라임 조각 5
- 주정뱅이 정리: 주정뱅이 60명 — 명성 +20 / 멤버당 200G + 낡은 못 5
- 들개 토벌: 들개 80마리 — 명성 +25 / 멤버당 250G + 들개 가죽 3

**F 등급 (Phase B 확장)**:
- 박쥐 굴 청소: 박쥐 150마리 — 명성 +50 / 멤버당 500G + 박쥐 눈알 3
- 거미줄 채집: 거미줄 30개 — 명성 +50 / 멤버당 400G

E 이상 풀은 콘텐츠 발란스 잡고 Phase B 이후 추가.

---

## 5. DB 스키마

### 5.1 `guilds` 컬럼 추가

```ts
export const guilds = pgTable("guilds", {
  // 기존 컬럼…
  fameTotal: integer("fame_total").notNull().default(0),       // 영구 누적 (등급 결정)
  fameAvailable: integer("fame_available").notNull().default(0), // 소비형 (버프 업글)
});
```

마이그: 두 컬럼 ALTER TABLE … ADD COLUMN.

### 5.2 `guild_quest_instances` 신규

```ts
export const guildQuestInstances = pgTable(
  "guild_quest_instances",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id").notNull().references(() => guilds.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start").notNull(),     // 해당 주 월요일 00:00 KST
    questDefId: text("quest_def_id").notNull(),
    grade: text("grade").notNull(),                    // G/F/E/D/C/B/A/S 스냅샷
    status: text("status").notNull(),                   // proposed/active/completed/dismissed/expired
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),                // 발행 시점 스냅샷
    activatedAt: timestamp("activated_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("guild_quest_active_unique_idx")
      .on(t.guildId)
      .where(sql`${t.status} = 'active'`),
    index("guild_quest_guild_week_idx").on(t.guildId, t.weekStart),
  ],
);
```

partial unique index 가 동시 활성 1개 룰을 enforce.

---

## 6. API

`src/app/api/guilds/quests/`:

| 엔드포인트 | 메서드 | 권한 |
|---|---|---|
| `/this-week` | GET | 멤버 (활성 의뢰 + 후보 + 명성 + 등급) |
| `/[instanceId]/accept` | POST | 마스터 |
| `/progress` | POST | 멤버 (body: kind/name/count) |

### 6.1 cron 추가

- `/api/cron/guilds-quests-cycle` (cron schedule: Sunday 15:00 UTC = Monday 00:00 KST): 모든 활성 길드에 후보 3건 발행
- `/api/cron/guilds-quests-deadline` (cron schedule: Sunday 14:59 UTC = Sunday 23:59 KST): 활성 미완료 + proposed 미수락 → expired

---

## 7. UI

길드 회관(GuildHallView) 안에 새 섹션 (멤버 목록 위):

```
┌─────────────────────────────────────┐
│ 등급 [D] 길드            누적 명성 1820  │
│                          사용 가능 1820  │
│                                        │
│ [활성 의뢰 있을 때]                    │
│ 산적단 격퇴 (E급)                      │
│ 산적 처치 ▮▮▮▮▯▯▯▯▯▯ 42 / 100        │
│ 보상: 명성 +60, 멤버당 600G            │
│ 마감 일요일 23:59                      │
│                                        │
│ [proposed 만 있을 때, 마스터]          │
│ 이번 주 후보 (1개만 수락 가능)         │
│ 카드 3개…                              │
└─────────────────────────────────────┘
```

마스터가 아닌 멤버는 후보 보기만, 수락 버튼 disabled.

---

## 8. 단계별 구현 계획

### Phase A — MVP (~4일)

- [ ] `guilds.fameTotal` + `guilds.fameAvailable` 컬럼 (마이그)
- [ ] `guild_quest_instances` 테이블
- [ ] `GuildQuestDef` 데이터 — G등급 의뢰 3종 (kill_monster)
- [ ] cron: 주간 발행 + 일요일 마감
- [ ] API: this-week / accept / progress
- [ ] 클라이언트 통합: `onBattleEnd` 진행도 보고 + character.fame 증분 시 길드 명성 동반 적립
- [ ] UI: GuildHallView 주간 의뢰 패널 + 등급/명성 헤더

### Phase B — 풀 확장 + 동사 다양화

- [ ] kill_boss / collect_material task 추가
- [ ] F~D 등급 풀 의뢰 정의 (보상 발란스)
- [ ] 보상 다양화 (재료/제작서/낮은 확률 장비)

### Phase C — 길드 버프 업그레이드 (사용 가능 명성 소비처)

- [ ] 버프 정의 (예: 사냥 EXP +5%, 골드 +5%, 드랍률 +1%)
- [ ] 등급별 버프 슬롯 수 적용 (1~4)
- [ ] 업그레이드 UI + fameAvailable 차감
- [ ] 활성 버프 → 멤버 사냥에 자동 적용 (서버 트랜잭션)

---

## 9. 결정 사항 (확정)

| 항목 | 값 |
|---|---|
| 길드 등급 | G/F/E/D/C/B/A/S 8단계 |
| 누적 임계 | 0 / 200 / 600 / 1500 / 3500 / 8000 / 18000 / 40000 |
| 의뢰 풀 게이팅 | 슬라이딩 윈도우 ±2 |
| 명성 두 컬럼 | fameTotal (영구) + fameAvailable (소비) |
| 개인 명성 → 길드 명성 동반 적립 | 양쪽 다 +N |
| 주간 후보 개수 | 3개 |
| 동시 활성 의뢰 | 1개 |
| 수락 후 변경 | 불가 (그 주 끝까지 고정) |
| 발행 시각 | 월요일 00:00 KST |
| 마감 시각 | 일요일 23:59 KST |
| 보상 분배 | 멤버 균등 우편 |
| 누적 cap (단일 호출) | 50 |

---

## 10. 결정 보류 (Phase 검증 후)

- 시즌제 vs 영구 누적 (현재 영구)
- 마스터 미수락 시 자동 수락 / 멤버 투표 (현재 그냥 만료)
- 재료 collect_material task 시점 — 발행 후 모은 것만 카운트 (의도)
- 멤버 기여 표시 — 이번 결정으로 "개인 명성 적립 = 길드 명성 가산"으로 자연 해결
