# 모험의 서 (Adventure Log) 기획

> 상태: ✅ **구현 완료** — 모험의 서(도감) 출고. 이 문서는 설계 기록.

> 캐릭터 → "모험의 서" 서브뷰. 플레이어가 진행하면서 직접 채워가는 **나만의 도감/안내서** 컨셉.

## 개요

- 게임을 진행하면서 만난 **몬스터·마을·NPC·아이템 등에 대한 정보가 자동으로 누적·해금**되어 도감 형태로 보이는 기능.
- "정보가 처음부터 다 보이는 위키"가 아니라 **모험가가 직접 손으로 쓰는 노트** 같은 느낌.
- 진행도(예: 처치 횟수)에 따라 한 항목 안에서도 **점진적 공개(progressive disclosure)**.

## 탭 구성

`모험의 서` 안쪽은 다시 가로 탭(서브 탭) 으로 나눈다.

| 탭 | 키 | 내용 |
|---|---|---|
| 몬스터 | `monsters` | 마주친·처치한 몬스터 도감 |
| 아이템 | `items` | 획득·장착한 장비/소비/재료 도감 |
| NPC | `npcs` | 대화한 NPC 인물 노트 |
| 마을 | `towns` | 방문한 마을(`tags: ["town"]`) 안내문 |
| (후순위) 지역 | `regions` | 비-마을 지역(평야/숲/동굴/호수/폐허) 풍경 노트 |

— 4개 탭(몬스터/아이템/NPC/마을)을 첫 버전 UI로 두고, 데이터 트래킹은 단계적으로 채운다.
— `지역`은 후순위로 보류.
— 빈 탭은 자체적으로 "아직 기록이 없습니다" 비어있음 안내.

---

## 몬스터 도감 (1단계 우선 구현)

### 진행도 단계

처치 횟수(`kills`)에 따라 정보가 단계적으로 해금된다.

| 단계 | 조건 | 공개되는 정보 |
|---|---|---|
| 0. 미발견 | 한 번도 마주치지 않음 | 카드 자체가 목록에 없음 |
| 1. 목격 (`encountered`) | 마주친 적 있음(전투 시작) | 이름, 실루엣 이미지(어둡게/필터), 출현 지역 |
| 2. 처치 1회+ | `kills >= 1` | 이미지 정상 표시, HP 표시 |
| 3. 처치 30회+ | `kills >= 30` | 공격력/방어력/속도 공개 |
| 4. 처치 50회+ | `kills >= 50` | EXP, 짧은 메모/플레이어 코멘트 슬롯 |

> 임계값(1/30/50)은 추후 밸런스에 따라 조정. 코드 상수로 분리.
> 약점/속성/특이 행동 단계는 데이터가 생기면 추가 도입(현재 시스템에는 없음).

### 카드 UI

- 목록(그리드): 각 몬스터 카드는 — 아바타 + 이름 + `처치 N회` 배지.
- 미목격은 목록에 없음 / 목격은 어둡게 + `?` 가림.
- 카드 클릭 → 상세 뷰 (해금된 정보만 단계적으로 표시).

### 데이터 모델 (저장)

```ts
// localStorage key: "adventure-log.monsters.v1"
type MonsterLogEntry = {
  encountered: boolean;   // 한 번이라도 마주친 적
  kills: number;          // 처치 횟수
  firstSeenAt?: number;   // ms epoch
  lastKilledAt?: number;  // ms epoch
};

type MonsterLog = Record<string /* monster name */, MonsterLogEntry>;
```

— 전투 시작 시 `encountered = true` 갱신.
— 전투 승리 시 `kills += 1`, `lastKilledAt = Date.now()`.

### 트리거 포인트

- `BattleView.start(enemy)` → `markEncountered(enemy.name)`.
- `handleBattleEnd(payload)` win 분기 → `incrementKill(payload.enemyName)`.

---

## 마을 도감

### 진행도 단계

- **방문 안 함** → 목록에 없음.
- **방문함** → 이름, 위치 좌표, 짧은 설명 공개.
- **NPC 모두와 대화** → 보너스 메모 한 줄(예: 마을 슬로건/주민의 평).

### 데이터 모델

```ts
// "adventure-log.towns.v1"
type TownLogEntry = {
  visited: boolean;
  firstVisitedAt?: number;
  npcsTalkedTo: string[]; // npc id 목록
};
type TownLog = Record<string /* region id */, TownLogEntry>;
```

### 트리거

- 마을 진입(adventure tab → `subView === "town"`) → `markVisited(regionId)`.
- NPC 대화 종료 → `addTalkedNpc(regionId, npcId)`.

---

## NPC 도감

### 진행도 단계

- **만난 적 없음** → 없음.
- **첫 대화** → 이름, 역할(`elder/vendor/...`), 짧은 설명 공개.
- **대화 N회 이상**(예: 3회) → 그 NPC의 첫 대사/시그니처 대사 한 줄 코멘트.

### 데이터 모델

```ts
// "adventure-log.npcs.v1"
type NpcLogEntry = {
  talkCount: number;
  firstTalkAt?: number;
};
type NpcLog = Record<string /* npc id */, NpcLogEntry>;
```

### 트리거

- `NpcDialogue` 마운트 또는 닫힘 → `incrementTalk(npcId)` (1회 측정 단위는 "대화 한 번 트림" 으로 통일).

---

## 지역 (선택, 후순위)

- 비-마을 지역(평야/숲/동굴/호수/폐허) 방문 시 등록.
- "거기에서 처치한 몬스터 종류/수" 누적 보여주기.

---

## 아이템 (선택, 후순위)

- 획득/장착해본 장비, 소비한 아이템 누적.
- 미획득은 실루엣.
- 첫 획득 시점, 마지막 사용/장착 시점.

---

## UI / 상호작용

### 메인 진입

- `캐릭터 탭 → 모험의 서`
- 진입 시 `monsters` 탭 기본 활성.
- 가로 서브 탭 바: `몬스터 / 마을 / NPC` (필요 시 `지역 / 아이템` 추가).

### 목록 페이지 (탭별)

- 그리드 또는 리스트.
- 비어있으면 — 점선 박스 + 안내 문구 (이미 character/info에 쓴 패턴 재사용).
- 각 항목 클릭 → 상세 뷰 (현재 해금 단계까지의 정보).

### 카드 상태 표현

- 미발견: 목록에 없음.
- 목격(미처치): 흑백/회색 + 이름 부분 가려짐(`?`) + 처치 0회 표시.
- 처치 진척: 단계 뱃지(`Lv.1/2/3...` 또는 `★/★★/★★★`)로 시각화.

### 점진적 공개(상세 뷰)

- 이미 공개된 정보는 그대로.
- 다음 단계 정보는 **반투명/잠금 아이콘 + "처치 N회 더"** 같은 식으로 다음 임계값 안내.
- 동기 부여용으로 다음 임계값까지 남은 횟수를 카운터로 보여주는 게 핵심.

---

## 영속화 (localStorage)

키 분리 권장 — 로그 도메인별로 따로 두면 마이그레이션 쉽다.

- `adventure-log.monsters.v1`
- `adventure-log.towns.v1`
- `adventure-log.npcs.v1`
- (후순위) `adventure-log.regions.v1`, `adventure-log.items.v1`

마이그레이션 정책:
- 키에 `.v1` 등 버전 suffix 유지.
- 스키마 깨질 때 `.v2`로 새 키, 옛 키는 자동 제거(현재 `LEGACY_PROFILE_KEYS` 패턴 동일).

---

## 구현 로드맵 (단계별)

### Phase 1 — 기반
- [ ] `src/adventure/log/storage.ts` — load/save 헬퍼 (`monsters/towns/npcs` 각각).
- [ ] `useAdventureLog` 훅 또는 page.tsx state 통합 (저장/이벤트 연결 포인트).

### Phase 2 — 몬스터 도감
- [ ] 임계값 상수 + `getRevealStage(kills)` 헬퍼.
- [ ] 트리거 연결 — `BattleView.start` → encountered, `handleBattleEnd` win → kill++.
- [ ] AdventureLogView (탭 + 몬스터 목록 + 상세 뷰) 첫 버전 — 잠긴 슬롯 포함.

### Phase 3 — 마을 도감
- [ ] 마을 진입 트리거.
- [ ] NPC 대화 시 `npcsTalkedTo` 누적.
- [ ] 마을 탭/카드/상세 뷰.

### Phase 4 — NPC 도감
- [ ] NpcDialogue 종료 시 `talkCount++`.
- [ ] NPC 탭/카드/상세 뷰.
- [ ] 마을 ↔ NPC 상호 링크 (선택: 마을 상세에서 그 마을의 NPC 목록).

### Phase 5 — (선택) 지역 / 아이템
- 우선 보류, 다른 시스템 정착 뒤 검토.

---

## 메모

- 너무 많은 카운터/배지를 한 번에 노출하면 부담. 처음엔 "이름·이미지·처치 N회·다음 단계까지 N회" 정도로 단순하게.
- 임계값 도달 시 알림(`addNotification("log_reveal", ...)`)으로 작은 만족감 트리거 — 추후 검토.
- 같은 적을 여러 지역에서 만나는 경우(예: 들개 = 평야 + 외곽 숲) — `firstSeenRegion`을 별도로 저장해두면 도감 메모로 활용 가능.
