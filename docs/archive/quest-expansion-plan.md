# 운향 + 신규 지역 — 퀘스트 라인 확장 계획

> 상태: ✅ **구현 완료** — 운향+신규 지역 퀘스트 라인 출고. 이 문서는 설계 기록.

운향(`unhyang`)과 그 너머 신규 지역(운저 평원·바람골 역참·잿빛 협로·봉황령·화산 지대·천공 성지)에 **메인 라인 / 사이드 의뢰 / 마을 간 연계 의뢰**를 채워 넣는 단일 출처 설계 문서.

> **원칙**
> - 새 시스템·새 메커니즘은 도입하지 않는다 — 전부 기존 패턴(`Quest` `kill`/`deliver` + `giverNpcId` + `requiresQuestCompleted` + `repeatable`/`cooldownMs`, `STORY_QUESTS` 멀티스테이지, `storyFlags`, `markTitleObtained`).
> - 이 게임은 **퀘스트 진행 중심 모험 RPG** — 신규 지역이 "통과 지점"이 아니라 "사람과 사연이 있는 곳"이 되도록 한다. 특히 운향·천공 성지는 NPC만 있고 메인 라인이 비어 있어 1순위.
> - 가능한 한 **기존 마을·NPC를 다시 불러온다** (수지↔남편, 디올라 트라이얼 라인이 마을→동굴→숲 동선을 다시 훑게 한 패턴). 신규 지역 의뢰가 시작 마을/디올라까지 연결되면 세계가 하나로 묶인다.
> - 신규 몬스터·재료·NPC가 필요한 항목은 표에 ⚠ 로 표시 — 없이도 성립하는 안을 우선.

---

## 0. 현황 — 이미 있는 것

| 지역 | NPC | 가진 의뢰 | 비고 |
|---|---|---|---|
| 시작 마을 | 교관 스미스 / 대장장이 볼드 / 수지 / 나무꾼 지미 | 훈련 3 + 지미 산적·깊은 동굴 + 길드판 5 + 볼드/수지 스토리 | **꽉 차 있음** — 추가는 연계 의뢰만 |
| 디올라 | 마린(촌장) / 카이 / 노라 / 보로 / 리오 / 후드 손님 | 트라이얼 라인 3(deliver) + 마린 영혼결정 + 길드판 4 | **꽉 차 있음** — 추가는 운향 연계만. 카이·후드 손님 떡밥은 일부 미회수 |
| 운향 | 백운(노촌장) / 만월(대장장이) / 도연(가이드) / 산하(약초꾼) / 순례자 미상 | 도연 3(절벽늑대·평원약탈자·불꽃독수리) / 산하 3(산초꽃·거인비늘·화염비늘) | **백운·만월·순례자 의뢰 0** → 메인 라인 비어 있음 |
| 운저 평원 | (town 아님 — NPC 없음) | (바람골에서 받는 의뢰만) | NPC 추가 불가, 의뢰는 바람골/운향에서 |
| 바람골 역참 | 마로(역참지기) / 노을(상인) / 한솔(길잡이) | 마로 들소 / 노을 깃털 / 한솔 잿빛골렘·화산보스·용암슬라임 + 길드판 2 | 한 줄씩만 — 더 채울 여지 |
| 잿빛 협로 | (town 아님 — NPC 없음) | (바람골에서 받는 의뢰만) | |
| 봉황령 | (town 아님 — NPC 없음) | 도연 불꽃독수리 / 산하 화염비늘 / 검·해무? 봉황령 의뢰 일부 | town 아니라 NPC 추가 불가, 의뢰는 운향/천공에서 |
| 화산 지대 | (town 아님 — NPC 없음) | 한솔 용암슬라임 / 시온 용암핵 | |
| 천공 성지 | 해무(원로) / 검(정찰대원) / 시온(연금술사) | 검 산악기사 / 시온 용암핵 + 길드판 1 | **해무 의뢰 0** → 화산의 심장 메인 라인 비어 있음 |

**기존 storyFlag**: `jimmy_deep_cave_quest`, `stranger_ruins_guide`, `peak_giant_engaged`, `peak_giant_defeated`, `volcano_heart_defeated`, `bold_blacksmith_intro`, `bold_slime_core`, `suzy_husband_news`.
**관련 칭호**: `giant_slayer`(거인살해자 — 운봉의 거인 협동 처치 누적 데미지 50%↑), `diola_friend`(디올라의 친구 — `diola-marin-soul-crystals` 완료 시 부여).

---

## 1. 운향 메인 라인 — "잠들지 않는 산" (백운 + 만월)

운향의 핵심 서사는 **운봉의 거인** 인데 지금은 협동 보스 + `peak_giant_engaged` 게이트만 있고 NPC 서사가 없다. 노촌장 백운이 라인을 끌고, 대장장이 만월이 보조한다.
진행: **운향 도달(=거인과 한 번 맞붙음) → 백운 협곡 정찰 → 운봉의 거인 처치 → 교역로 정리 2종 → 정기 토벌** + 만월 운봉석 보조 + 볼드 연계.

### 1.1 백운 — `quests.ts`

> 백운 어투: greeting 이 *"…먼 길을 올라왔구먼. … 살고 있다네. … 들려주지."* — **노촌장 어조(～구먼/～다네/～게야/～주게/～보겠나)**. 아래 설명문도 거기 맞춰 작성 (디올라 마린의 `diola-marin-soul-crystals` 가 하오체 "～주시오"인 것과 대비 — NPC마다 다름, §14 참고).

```ts
// quests.ts — 운향 메인 라인 (giverNpcId: "unhyang_elder")
{
  id: "unhyang-baekun-canyon-survey",
  regionId: "unhyang",
  title: "산이 깨어나는 소리",
  description:
    "협곡의 무리장 늑대들이 요즘 평소와 다르게 움직인다네. 그놈들이 어떻게 무리를 끌고 다니는지 보면, 산이 어디까지 깨어났는지 알 수 있을 게야. 세 마리만 정리하고 와 주겠나?",
  requiredLevel: 20,
  target: { kind: "kill", monsterName: "늑대 무리장", count: 3 },
  reward: { gold: 700, fame: 24, exp: 1000, materials: [{ id: "giant_scale", count: 3 }] },
  repeatable: false,
  giverNpcId: "unhyang_elder",
},
{
  id: "unhyang-baekun-peak-giant",
  regionId: "unhyang",
  title: "운봉의 거인",
  description:
    "이제 알겠네 — 산 깊은 곳에 잠들지 않는 것이 버티는 한, 이 산정은 평온할 수 없어. 운봉의 거인. 혼자선 어림없는 상대지. 동료를 모아 그놈을 잠재워 주게. 산정의 명운이 거기 달렸다네.",
  requiredLevel: 22,
  target: { kind: "kill", monsterName: "운봉의 거인", count: 1 },
  reward: { gold: 1800, fame: 60, exp: 4500, items: [{ id: "peak_heart", count: 1 }] },
  repeatable: false,
  giverNpcId: "unhyang_elder",
  requiresQuestCompleted: "unhyang-baekun-canyon-survey",
},
{
  id: "unhyang-baekun-cliff-wolves",
  regionId: "unhyang",
  title: "교역로 정리 ─ 협곡",
  description:
    "거인이 잠든 지금이 기회야. 협곡 길에 절벽 늑대가 너무 많아 짐꾼들이 다니질 못해. 서른 마리만 솎아 주게 — 디올라와 다시 거래를 트려면 길부터 안전해야 하니.",
  requiredLevel: 22,
  target: { kind: "kill", monsterName: "절벽 늑대", count: 30 },
  reward: { gold: 500, fame: 22, exp: 900, potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "unhyang_elder",
  requiresQuestCompleted: "unhyang-baekun-peak-giant",
},
{
  id: "unhyang-baekun-highland-goats",
  regionId: "unhyang",
  title: "교역로 정리 ─ 산기슭",
  description:
    "산기슭 비탈은 산양 떼가 바위를 굴려대서 위험하다네. 마흔 마리만 정리해 주게 — 그래야 아랫마을 짐수레가 비탈을 오를 수 있어.",
  requiredLevel: 18,
  target: { kind: "kill", monsterName: "산양", count: 40 },
  reward: { gold: 450, fame: 20, exp: 800 },
  repeatable: false,
  giverNpcId: "unhyang_elder",
  requiresQuestCompleted: "unhyang-baekun-peak-giant",
},
{
  id: "unhyang-peak-giant-recurring",
  regionId: "unhyang",
  title: "운봉의 거인 토벌 ─ 정기",
  description:
    "거인은 잠재워도 산의 숨결을 먹고 다시 일어선다네. 세 번이면 한동안은 산정이 조용할 게야. 동료들과 함께 가 주게.",
  requiredLevel: 22,
  target: { kind: "kill", monsterName: "운봉의 거인", count: 3 },
  reward: { gold: 900, fame: 22, exp: 1800 },
  repeatable: true,
  requiresQuestCompleted: "unhyang-baekun-peak-giant",
},
```

**진행 흐름 / 다이얼로그 (`BaekunDialogue.tsx`):**

| 상태 | 트리거 | 백운 대사 / 행동 |
|---|---|---|
| A (도착) | 운향 첫 진입 (`peak_giant_engaged` 켜져 있음 — 거인과 한 번 맞붙어야 들어옴) | greeting *"…그 이야기는 차차 들려주지."* 직후 본론으로 — 거인 이야기를 풀어놓는다. "그놈이 깨어나는 걸 막아야 해. 우선 협곡 사정부터 봐 주겠나?" → `unhyang-baekun-canyon-survey` 제공 |
| B | A 완료 | "협곡을 봤다면 알 게야. 그놈은 산의 숨을 먹고 자라. …이제 잠재워야 할 때일세." → `unhyang-baekun-peak-giant` 제공 |
| C | B 완료 (= 거인 처치) | "산정이 다시 숨 쉬는구먼. …고맙네, 정말로." → `mountain_friend` 칭호 부여 + `unhyang_main_cleared` flag 세트. 이어서 "이제 한 가지 더 — 거인이 잠든 김에 아랫마을과의 길을 다시 잇고 싶네." → 교역로 정리 2종(`-cliff-wolves`/`-highland-goats`) 동시 제공 |
| D | C의 두 의뢰 모두 완료 | "길이 열렸어. 디올라 촌장 마린에게 가 보게 — 산정과 다시 거래를 트자고, 백운이 전하더라고 말일세." → `mountain_trade_open` flag 세트 (디올라 `diola-marin-mountain-trade` 해금, §7.2). 이후 `unhyang-peak-giant-recurring` 상시 제공 |

> ⚠ `peak_giant_defeated` flag 와 `unhyang-baekun-peak-giant` 퀘스트 진행도는 별개 — 운향 도착 전에 이미 거인을 잡았더라도 퀘스트 카운터는 0부터다(협동 보스라 재도전 가능). 의도된 동작: 백운 라인을 위해 한 번 더 잡는다. (대안: B를 `deliver giant_scale ×5` 로 바꿔 첫 처치에서 얻은 비늘로 즉시 완료. 본 문서는 `kill ×1` 채택.)
> ⚠ 칭호: 기존 `giant_slayer`(거인살해자 — 누적 데미지 50%↑ 조건)는 그대로 두고, 새 칭호 `mountain_friend`(산정의 벗)를 C 완료에 부여. `page.tsx` quest 완료 핸들러 하드체크(`diola-marin-soul-crystals → diola_friend` 패턴, `src/app/page.tsx:860`).

### 1.2 만월 — "운봉석을 벼리는 법" + 시작 마을 볼드 연계

만월 greeting: *"거인의 뼛조각을 가져오면 무엇이든 만들어 주지 — 아직은 좀 더 두고 봐야겠지만."* → 이 "두고 봐야겠지만"을 해소.

```ts
// quests.ts — 만월 보조 라인 (giverNpcId: "unhyang_smith")
{
  id: "unhyang-manwol-ore-demo",
  regionId: "unhyang",
  title: "운봉석을 벼리는 법",
  description:
    "운봉석은 제대로 다룰 줄 아는 손이 드물어. 자네가 운봉석 여섯 덩이만 가져오면, 그걸로 시연을 보여줌세 — 거인 어깨 비늘로 견갑을 어떻게 짜는지. 보고 나면 자네 손에도 새겨질 거야.",
  requiredLevel: 22,
  target: { kind: "deliver", materialId: "unbong_ore", count: 6 },
  reward: { gold: 500, exp: 800, recipes: ["peak_mantle"], potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "unhyang_smith",
},
```

> 운봉 무기 4종은 그대로 운봉의 거인 `recipe_one_of` 보상으로 두고, 견갑(`peak_mantle`, 현재 15% 드롭)만 만월 루트로도 확정 입수.

**`manwol_bold_reunion` (STORY_QUEST — 대장장이 간 우정, 수지↔남편 패턴):**

| 단계 | 장소 | 흐름 | 세트 flag |
|---|---|---|---|
| 시작 | 운향 (만월) | `unhyang-manwol-ore-demo` 완료 후 만월: "시작 마을에 볼드라는 대머리 영감 아직 살아 있나? 망치질 하나는 쓸 만했지 — 이거 좀 전해 주게." | — |
| 전달 | 시작 마을 (볼드, `BlacksmithDialogue.tsx`) | 볼드: "만월이? 그 까칠한 노인네! …이 손잡이, 만월이 솜씨군. 답례다." → 골드 + (강화 시스템 지원 시) 강화 1회 무료 / 미지원 시 제작서·포션 한 보따리 | `manwol_bold_letter_delivered` |
| 보고 | 운향 (만월) | 만월: "녀석 잘 산다니 다행이군." → 만월 무기 강화 비용 영구 -10% (또는 1회 무료) + 만월 잡담 갱신 | `manwol_bold_reunion_done` |

> 강화 할인이 시스템상 부담되면 보상을 단순화 — 양쪽 다 골드 + potionCapacityBonus + (볼드) 제작서 1종. 핵심은 두 대장장이가 서로를 "기억"하게 만드는 것.

### 1.3 순례자 미상 — "북쪽 너머" 미스터리 (떡밥 회수 + 미래 떡밥)

순례자 greeting: *"북쪽에서 왔다. 그 너머는 아직 네가 알 시간이 아니야."* — 디올라 후드 손님과 동형. 의뢰(보상) 없이 **대사 분기**만 — 콘텐츠 떡밥 보관소. `STORY_QUESTS` 에 `pilgrim_beyond_north` 한 줄(메타데이터).

| 상태 | 트리거 | 순례자 대사 (`PilgrimDialogue.tsx`) |
|---|---|---|
| 0 (잠금) | 운향 도달 직후 | greeting 그대로 + 잡담 풀(추위·별·산정 너머) |
| 1 (1차 해금) | `volcano_heart_defeated` 세트 | "능선 너머의 불덩이를 잠재웠다고? …그렇다면 천공 성지가 열렸겠군. 거기 원로 해무를 만나라. 그가 나보다 더 안다." + 새 잡담 풀 |
| 2 (2차 해금) | `skyreach_main_cleared` 세트 (= 해무 봉인 라인 완료, §6) | 북쪽의 정체 일부 공개 → **다음 콘텐츠 지역 떡밥**. 후드 손님(`diola_stranger`)·해무와 같은 예언/표식이라는 암시 → `pilgrim_revealed` flag (미래 콘텐츠용) |
| 3 (선택) | `pilgrim_revealed` + 시작 마을·운향·천공 메인 라인 전부 완료 | 디올라 후드 손님(`StrangerDialogue.tsx`)도 해금 — 처음으로 정체의 일부를 말함. 게임 전체 메인 서사의 씨앗 |

---

## 2. 운향 — 사이드 의뢰 추가

### 2.1 NPC 전속 (도연 / 산하)

| id | giver | 타입 | 목표 | 보상 | 해금 | 설명문안(NPC 어투) |
|---|---|---|---|---|---|---|
| `unhyang-doyeon-stone-frogs` | 도연 | `kill` | 바위 두꺼비 ×15 (산기슭) | gold 320 / fame 16 / exp 500 | reqLv 18 | "산기슭 바위 두꺼비, 그놈들 등껍데기가 길을 막아. 열다섯 마리만 치워 주면 짐꾼들 발이 좀 편해질 거야." |
| `unhyang-doyeon-windspirits` | 도연 | `kill` | 돌풍 정령 ×12 (협곡) | gold 380 / fame 18 / exp 600 | reqLv 20 | "협곡 돌풍 정령은 발 디딜 데를 못 잡게 만들어. 열둘만 흩어 주면 한동안 바람이 좀 잦을 거야." |
| `unhyang-sanha-tough-hide` | 산하 | `deliver` | `tough_hide` ×6 → 산하 | gold 420 / exp 600 / potions ×3 | reqLv 18 | "단단한 가죽으로 약 보따리를 싸야 하거든요. 여섯 장만 모아다 주시면 회복약으로 보답할게요." |
| `unhyang-sanha-windstone` | 산하 | `deliver` | `wind_mana_stone` ×4 → 산하 | gold 500 / exp 700 / potionCapacityBonus 1 | reqLv 20 | "바람 마석은 약을 오래 갈무리하는 데 그만이에요. 넷만 구해다 주시면 약 주머니를 더 크게 만들어 드릴게요." |
| `unhyang-baekun-pilgrim-escort` | 백운 | `kill` | 떠돌이 약탈자 ×15 (운저 평원) | gold 450 / fame 20 / exp 800 | `unhyang_main_cleared` | "북쪽에서 온 순례자가 운저 평원을 지나 다시 떠난다네. 거기 떠돌이 약탈자 무리가 자리를 잡았다더군 — 열다섯만 손봐 주겠나? 순례자가 무사히 지나가게." → §1.3 순례자 1차 해금과 자연스럽게 맞물림 |

### 2.2 운향 모험가 길드 게시판 (정식 로스터)

`kill` 형 + `giverNpcId` 없음 → `getQuestsForRegion("unhyang")` 로 게시판 노출. 산악 적 5종(산양·바위 두꺼비·절벽 늑대·돌풍 정령·늑대 무리장)을 **표준 의뢰(중간 카운트)** 와 **큰 의뢰(높은 카운트·높은 보상)** 로 깔고, 메인 라인·교역로 진척에 맞춰 한두 개를 후속 게이트로 묶는다. (시작 마을 `village-deep-cave-recurring` 처럼 게시판 의뢰도 quoted 어조 OK — 의뢰주는 "운향 모험가 길드".)

| id | 타입 | 목표 | 보상 | 해금 | 메모 |
|---|---|---|---|---|---|
| `unhyang-board-goats` | `kill` repeatable | 산양 ×45 | gold 320 / fame 14 / exp 650 | — | 산기슭 표준 |
| `unhyang-board-goats-large` | `kill` repeatable | 산양 ×80 | gold 620 / fame 24 / exp 1250 | reqLv 19 | 산기슭 큰 의뢰 |
| `unhyang-board-stone-frogs` | `kill` repeatable | 바위 두꺼비 ×40 | gold 360 / fame 16 / exp 700 | — | 산기슭 표준 |
| `unhyang-board-cliff-wolves` | `kill` repeatable | 절벽 늑대 ×40 | gold 360 / fame 16 / exp 700 | — | 협곡 표준 |
| `unhyang-board-cliff-wolves-large` | `kill` repeatable | 절벽 늑대 ×75 | gold 700 / fame 26 / exp 1300 | reqLv 21 | 협곡 큰 의뢰 |
| `unhyang-board-windspirits` | `kill` repeatable | 돌풍 정령 ×35 | gold 380 / fame 17 / exp 720 | — | 협곡 표준 |
| `unhyang-board-wolf-chieftain` | `kill` repeatable | 늑대 무리장 ×6 | gold 500 / fame 20 / exp 1100 | `requiresQuestCompleted: unhyang-baekun-canyon-survey` | 무리장은 희귀 등장이라 카운트 낮게. 백운 협곡 정찰 후 노출 (= "이제 무리장의 패턴을 안다") |
| `unhyang-board-supply-escort` | `kill` repeatable | 폐허 늑대 ×40 | gold 500 / fame 18 / exp 950 | `requiresQuestCompleted: diola-marin-mountain-trade` | 교역로 개통(§7.2) 후 — "디올라행 짐수레 호위". 디올라 길드판 `diola-board-mountain-supply`(§7.2 후속) 와 짝 |
| `unhyang-board-grand-hunt` | `kill` repeatable | 늑대 무리장 ×12 | gold 1100 / fame 36 / exp 2400 | `requiresQuestCompleted: unhyang-baekun-peak-giant` + reqLv 24 | 메인 클리어 후 풀리는 고난도 정기 의뢰. (협동 누적 `peak-giant-hunter` 와 별개 — 이쪽은 일반 풀 무리장) |

---

## 3. 다리 구간 — 운저 평원 / 바람골 역참 / 잿빛 협로

운저 평원·잿빛 협로는 town 이 아니라 NPC 를 둘 수 없으므로 의뢰는 **바람골 역참(town)** 과 **운향**에서 받게 한다. 바람골 역참에는 분위기 NPC 를 추가할 여지가 있음.

### 3.1 바람골 역참 — NPC 전속 (마로 / 노을 / 한솔) + 신규 NPC

| id | giver | 타입 | 목표 | 보상 | 해금 | 설명문안(NPC 어투) |
|---|---|---|---|---|---|---|
| `windvale-keeper-bison-king` | 역참지기 마로 | `kill` | 들소 ×40 (⚠ 또는 신규 미니보스 "들소 무리장" ×1) | gold 700 / fame 26 / exp 1100 | `requiresQuestCompleted: windvale-keeper-bison` | "솎아냈더니 더 큰 떼가 내려오는구려. 마흔 마리만 더 정리해 주시오 — 이번엔 울타리가 버텨야 할 텐데." (하오체 — 마로 greeting "～오시오/～곳이오") |
| `windvale-merchant-escort-raiders` | 대상 상인 노을 | `kill` | 떠돌이 약탈자 ×12 (운저 평원) | gold 400 / fame 16 / exp 650 | reqLv 28 | "내 짐수레를 노리는 약탈자 놈들 좀 떼어내 줘. 열둘이면 한동안은 길이 조용하지." (반말 — 노을 greeting "～않아/～드리지") |
| `windvale-merchant-escort-hawks` | 노을 | `kill` | 초원 매 ×10 (운저 평원) | gold 380 / exp 600 / potionCapacityBonus 1 | reqLv 28 | "초원 매가 자꾸 짐 위로 내리꽂혀서 깃털이 모이질 않아. 열 마리만 쫓아 주면 길에서 주운 좋은 걸 나눠 드리지." |
| `windvale-merchant-ash-stone` | 노을 | `deliver` | `ash_stone` ×8 → 노을 | gold 550 / exp 700 | reqLv 34 | "잿돌이 세공 받침에 그만이거든. 여덟 덩이만 모아다 줘." |
| `windvale-pathfinder-salamander` | 길잡이 한솔 | `kill` | 불씨 도롱뇽 ×15 (잿빛 협로) | gold 600 / fame 22 / exp 900 | reqLv 34 | "잿빛 협로에 불씨 도롱뇽이 들끓어. 열다섯만 꺼 주면 잿가루 사이로 길이 보일 거야." (반말 — 한솔 greeting "～해/～있어서") |
| `windvale-pathfinder-ridge-scout` | 한솔 | `kill` | 불꽃 독수리 ×12 (봉황령) | gold 750 / fame 24 / exp 1100 | `requiresQuestCompleted: windvale-pathfinder-golems` | "잿빛 협로를 넘으면 봉황령이야. 거기 불꽃 독수리가 능선을 빙빙 돌아 — 열둘만 떨어뜨려 주면 첫 발 디딜 데가 생겨." (봉황령 첫 발, 운향 도연 라인과 안 겹치게 카운트 낮게) |
| **신규 NPC** `windvale_bard`(떠돌이 음유시인) | — | — | (의뢰 없음 — 분위기/세계관 잡담; 단 §11 `hidden-lucky-collector` 의 트리거 NPC) | — | — | 대상 일행 사이를 떠도는 가수. 산정·화염 능선·천공 성지 소문을 노래로 흘림 — 콘텐츠 떡밥 흩뿌리기용. 어투: 노래하듯 운율 섞인 반말/존대 혼합 |
| **신규 NPC** `windvale_caravan_guard`(대상 호위병 등불) | — | (위 노을 호위 의뢰 2종을 이쪽으로 옮겨 분담해도 됨) | — | — | — | 노을의 호위 의뢰를 나눠 받는 quest NPC. 어투: 무뚝뚝한 반말("～해/～없어") |

### 3.2 운향 → 다리 구간 (운향에서 받는 의뢰)

도연이 이미 `unhyang-guide-cloud-raiders`(떠돌이 약탈자 ×15) 를 줌. 추가:

| id | giver | 타입 | 목표 | 보상 | 설명문안(NPC 어투) |
|---|---|---|---|---|---|
| `unhyang-guide-bison-down` | 도연 | `kill` | 들소 ×20 (운저 평원) | gold 450 / fame 20 / exp 700 | "산정 아래 들판 가봤어? 들소 떼가 길을 떡 막아. 스무 마리만 솎아 주면 짐수레가 좀 다닐 거야." (반말 — 도연 greeting "～위험해/～있어") |
| `unhyang-sanha-bison-hide` | 산하 | `deliver` | `bison_hide` ×6 → 산하 | gold 550 / exp 800 / potions ×3 | "들소 가죽으로 약상자를 짜야겠어요. 여섯 장만 모아다 주시면 회복약으로 보답할게요." (존대 — 산하 greeting "～네요/～게요") |

### 3.3 바람골 역참 모험가 길드 게시판 (정식 로스터)

`getQuestsForRegion("windvale")` 노출. **다리 구간 전체(운저 평원·잿빛 협로)** 의 적 6종을 표준/큰 의뢰로 깔고, 봉황령·화산 입구용 "원거리" 의뢰 두엇과 화산 보스 후 풀리는 후속을 둔다. (봉황령·화산 *내부* 정기 의뢰는 천공 성지 게시판 §4·§5 이 맡음 — 거점 분담.)

| id | 타입 | 목표 | 보상 | 해금 | 메모 |
|---|---|---|---|---|---|
| `windvale-board-bison` | `kill` repeatable | 들소 ×40 | gold 400 / fame 16 / exp 700 | — | 운저 평원 표준 (기존 코드의 `windvale-bison-cull` 정리·계승) |
| `windvale-board-bison-large` | `kill` repeatable | 들소 ×75 | gold 760 / fame 26 / exp 1350 | reqLv 29 | 운저 평원 큰 의뢰 |
| `windvale-board-hawks` | `kill` repeatable | 초원 매 ×35 | gold 380 / fame 14 / exp 650 | — | 운저 평원 표준 |
| `windvale-board-raiders` | `kill` repeatable | 떠돌이 약탈자 ×30 | gold 420 / fame 16 / exp 700 | — | 운저 평원 표준 |
| `windvale-board-ash-golems` | `kill` repeatable | 재먼지 골렘 ×30 | gold 520 / fame 18 / exp 850 | — | 잿빛 협로 표준 |
| `windvale-board-ash-hounds` | `kill` repeatable | 잿빛 들개 ×35 | gold 500 / fame 18 / exp 850 | — | 잿빛 협로 표준 (기존 코드의 `windvale-ash-hounds` 계승) |
| `windvale-board-ash-salamanders` | `kill` repeatable | 불씨 도롱뇽 ×35 | gold 480 / fame 17 / exp 800 | — | 잿빛 협로 표준 |
| `windvale-board-ash-golems-large` | `kill` repeatable | 재먼지 골렘 ×60 | gold 980 / fame 28 / exp 1600 | reqLv 35 | 잿빛 협로 큰 의뢰 |
| `windvale-board-ridge-eagles` | `kill` repeatable | 불꽃 독수리 ×30 | gold 700 / fame 22 / exp 1300 | `requiresQuestCompleted: windvale-pathfinder-golems` | 봉황령 입구 — "능선 길 확보". 천공 게시판의 봉황령 정기와 카운트 차별화(이쪽이 입구 난이도) |
| `windvale-board-volcano-toads` | `kill` repeatable | 화산 두꺼비 ×30 | gold 850 / fame 22 / exp 1600 | `requiresQuestCompleted: windvale-volcano-boss` | 화산 입구. 한솔 `windvale-lava-slimes`(용암 슬라임)과 다른 적 |

---

## 4. 봉황령 — 사이드 의뢰

town 이 아니므로 의뢰는 **운향(도연/산하)** 과 **천공 성지(검)** 에서 받게 한다. 기존: 도연 `unhyang-guide-phoenix-hunt`(불꽃 독수리 ×15), 산하 `unhyang-herbalist-flame-scale`(화염 비늘 ×8), 검 `skyreach-guide-knights`(산악 기사 ×20), 길드판 `unhyang-phoenix-ridge-patrol`(산악 기사 ×30).

| id | giver / 게시판 | 타입 | 목표 | 보상 | 해금 | 메모 |
|---|---|---|---|---|---|---|
| `unhyang-guide-flame-lizards` | 도연 | `kill` | 화염 도마뱀 ×15 | gold 800 / fame 26 / exp 1200 | reqLv 38 | 도연 봉황령 보강 |
| `skyreach-guide-phoenix-eagles` | 정찰대원 검 | `kill` | 불꽃 독수리 ×15 | gold 850 / fame 26 / exp 1300 | reqLv 40 | 검 봉황령 보강 |
| `skyreach-alchemist-phoenix-feather` | 연금술사 시온 | `deliver` | `phoenix_feather` ×4 → 시온 | gold 1000 / exp 1800 / potionCapacityBonus 1 | reqLv 40 | "봉황 깃털로 점화제를 만들어 봐야겠어" — 봉황 깃털 파밍 동기 강화 |
| `unhyang-herbalist-flame-eagle-cape` | 산하 | `kill` | 불꽃 독수리 ×20 | gold 900 / exp 1400 / `flame_eagle_cape`(봉황 망토) ×1 확정 | reqLv 40 | 망토 드랍률(0.3%)이 가혹하니 의뢰 1회 확정 루트를 하나 둔다 — `village-jimmy-bandits` → `spare_hatchet` 같은 "의뢰 보상 = 장비 1개" 패턴 |
| `skyreach-phoenix-ridge-eagles` | 길드판 | `kill` repeatable | 불꽃 독수리 ×35 | gold 700 / fame 22 / exp 1300 | — | |
| `skyreach-phoenix-ridge-lizards` | 길드판 | `kill` repeatable | 화염 도마뱀 ×35 | gold 680 / fame 21 / exp 1250 | — | |
| `unhyang-knight-captain` | 길드판 | `kill` repeatable | ⚠ 산악 기사단장 ×1 (신규 미니보스) / 또는 산악 기사 ×35 | gold 750 / fame 24 / exp 1400 | — | |

---

## 5. 화산 지대 — 사이드 의뢰

town 이 아니므로 의뢰는 **바람골 역참(한솔)** 과 **천공 성지(검/시온)** 에서. 기존: 한솔 `windvale-volcano-boss`(화산의 심장 ×1), `windvale-lava-slimes`(용암 슬라임 ×45 반복), 시온 `skyreach-alchemist-lava-core`(용암 핵 ×5), 길드판 `skyreach-flame-golems`(불꽃 골렘 ×30 반복).

| id | giver / 게시판 | 타입 | 목표 | 보상 | 해금 | 메모 |
|---|---|---|---|---|---|---|
| `skyreach-guide-volcano-toads` | 정찰대원 검 | `kill` | 화산 두꺼비 ×15 | gold 900 / fame 26 / exp 1500 | reqLv 52 | 검 화산 지대 보강 |
| `skyreach-guide-flame-golems` | 검 | `kill` | 불꽃 골렘 ×12 | gold 1000 / fame 28 / exp 1700 | reqLv 55 | |
| `skyreach-alchemist-flame-scale` | 시온 | `deliver` | `flame_scale` ×8 → 시온 | gold 1100 / exp 2000 / potionCapacityBonus 1 | reqLv 52 | "비늘에서 내열제를 추출해야 해" |
| `skyreach-volcanic-toads` | 길드판 | `kill` repeatable | 화산 두꺼비 ×30 | gold 850 / fame 22 / exp 1600 | — | |
| `skyreach-lava-slimes-2` | 길드판 | `kill` repeatable | 용암 슬라임 ×40 | gold 800 / fame 20 / exp 1500 | `requiresQuestCompleted: windvale-volcano-boss` | (한솔 것과 별도, 천공 거점) |

---

## 6. 천공 성지 메인 라인 — "능선 너머의 봉인" (해무)

천공 성지 원로 해무는 의뢰가 0개. 화산의 심장 처치 후(= `volcano_heart_defeated` — 천공 성지 진입 조건이라 자동) 만나는 NPC 인 만큼, **봉황 무구 갑옷·액세서리 확정 루트 + 성지 "또 다른 봉인" 서사 + 다음 콘텐츠 떡밥**을 맡긴다. (운향의 백운에 대응.)

### 6.1 해무 — `quests.ts`

```ts
// quests.ts — 천공 성지 메인 라인 (giverNpcId: "skyreach_elder")
{
  id: "skyreach-haemu-lava-core",
  regionId: "skyreach",
  title: "봉인의 자물쇠",
  description:
    "이 성지에는 화산의 심장 말고도 잠재워 둔 것이 있소. 그 봉인이 아래에서 올라오는 열기에 무뎌졌소 — 용암 핵 여섯 개면 자물쇠를 다시 채울 수 있소. 가져다 주면, 봉황 무구를 벼리는 법도 자네 손에 새겨 주리다.",
  requiredLevel: 55,
  target: { kind: "deliver", materialId: "lava_core", count: 6 },
  reward: { gold: 1200, exp: 2500, recipes: ["volcano_armor"] },
  repeatable: false,
  giverNpcId: "skyreach_elder",
},
{
  id: "skyreach-haemu-phoenix-feather",
  regionId: "skyreach",
  title: "봉황의 깃",
  description:
    "봉인을 더 단단히 하려면 봉황 깃털 다섯 장이 필요하오. 봉황령의 불꽃 독수리에게서, 혹은 화산의 심장이 떨군 것 중에 있을 게요. 가져오면 봉황주 만드는 법을 더해 주리다.",
  requiredLevel: 55,
  target: { kind: "deliver", materialId: "phoenix_feather", count: 5 },
  reward: { gold: 1400, exp: 3000, recipes: ["volcano_core"] },
  repeatable: false,
  giverNpcId: "skyreach_elder",
  requiresQuestCompleted: "skyreach-haemu-lava-core",
},
{
  id: "skyreach-haemu-flame-scale",
  regionId: "skyreach",
  title: "마지막 자물쇠",
  description:
    "마지막이오. 화염 비늘 여덟 장이면 봉인이 완성되오. …이 일을 끝내면, 자네에게 들려줄 이야기가 있소. 북쪽에서 온 순례자를 봤다고 했지? 그 이야기와 무관하지 않소.",
  requiredLevel: 55,
  target: { kind: "deliver", materialId: "flame_scale", count: 8 },
  reward: { gold: 1600, exp: 3500, potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "skyreach_elder",
  requiresQuestCompleted: "skyreach-haemu-phoenix-feather",
},
{
  id: "skyreach-volcano-heart-recurring",
  regionId: "skyreach",
  title: "화산의 심장 토벌 ─ 정기",
  description:
    "화산의 심장은 다시 달아오르오. 세 번 잠재우면 한동안은 성지 아래가 잠잠하리다. 동료를 데려가시오.",
  requiredLevel: 55,
  target: { kind: "kill", monsterName: "화산의 심장", count: 3 },
  reward: { gold: 1500, fame: 30, exp: 3000 },
  repeatable: true,
  requiresQuestCompleted: "skyreach-haemu-lava-core",
},
```

**진행 흐름 / 다이얼로그 (`HaemuDialogue.tsx` — 신규 또는 기존 천공 다이얼로그에 분기):**

| 상태 | 트리거 | 해무 대사 / 행동 |
|---|---|---|
| A (도착) | 천공 성지 첫 진입 (`volcano_heart_defeated` 자동) | greeting "그것이 잠든 걸 느꼈소" → 본론: 성지의 "또 다른 봉인". `skyreach-haemu-lava-core` 제공 + `skyreach-volcano-heart-recurring` 상시 |
| B | `-lava-core` 완료 | "자물쇠 하나가 채워졌소." `skyreach-haemu-phoenix-feather` 제공 |
| C | `-phoenix-feather` 완료 | "둘째 자물쇠도. …마지막 하나가 남았소." `skyreach-haemu-flame-scale` 제공 |
| D | `-flame-scale` 완료 | "봉인이 완성됐소. 고맙소." → `ridge_crosser` 칭호 부여 + `skyreach_main_cleared` flag 세트. + "북쪽에서 온 순례자에게 내 말을 전해 주오" → `skyreach-haemu-pilgrim-meet` 해금(§6.2). 순례자 미상 2차 해금(§1.3 상태 2)로 이어짐 |

> ⚠ 봉황 무구 4종 무기는 그대로 화산의 심장 `recipe_one_of` 보상으로 두고, 해무 라인은 갑옷(`volcano_armor`)·액세서리(`volcano_core`) — 현재 15% 드롭 — 만 확정 루트로 풀어줌. 보스 가치를 깎지 않는 선.

### 6.2 천공 성지 — 사이드 + 신규 NPC

| id | giver / 게시판 | 타입 | 목표 | 보상 | 메모 |
|---|---|---|---|---|---|
| `skyreach-haemu-pilgrim-meet` | 해무 | (대화 연계) | 운향 순례자 미상에게 해무의 말 전하기 → 다시 해무 | — (순례자 2차 해금 트리거) | §1.3 와 맞물림 — 천공 성지 ↔ 운향 연결 고리 |
| **신규 NPC** `skyreach_acolyte`(사미승 운하) | — | (의뢰 없음, 성지·봉인·첨탑 잡담) | — | 첨탑 너머 / 구름층 위 — **다음 콘텐츠 떡밥** 보관소 |
| **신규 NPC** `skyreach_gatekeeper`(문지기 청람) | — | 화산 지대 정기 토벌 의뢰 분담 (`skyreach-volcanic-toads` 등을 이쪽 NPC 전속으로 옮겨도 됨) | — | quest NPC 한 명 더 |

---

## 7. 마을 간 연계 의뢰 (cross-region)

신규 지역을 기존 마을과 묶는다. 대부분 **한쪽 NPC 에게 받아 → 다른 마을 NPC 와 대화 → 돌아옴** 의 storyFlag 형(수지↔남편 패턴) 이거나, 짝지어진 `kill`/`deliver` 의뢰.

### 7.1 시작 마을 ↔ 운향

- **볼드 ↔ 만월** — `manwol_bold_reunion` STORY_QUEST. 흐름·flag·보상은 **§1.2 에 상세**. (시작점은 만월 쪽 — `unhyang-manwol-ore-demo` 완료 후 만월이 부탁.)
- **`village-jimmy-doyeon-timber`** (나무꾼 지미 → 산악 가이드 도연):

```ts
// 지미가 운을 떼고, 실제 의뢰는 도연이 준다. 두 NPC 다이얼로그 양쪽에 분기.
// quests.ts
{
  id: "village-jimmy-doyeon-timber",
  regionId: "unhyang",                 // 실제 진행 거점은 운향(도연)
  title: "산정의 단단한 목재",
  description:
    "시작 마을 나무꾼 지미가 산정 협곡의 목재 이야기를 하더라고. 그건 절벽 늑대 소굴 안쪽에 있어 — 열다섯 마리만 정리하면 안전하게 베어 와서 지미한테 부쳐 줄게.",
  requiredLevel: 20,
  target: { kind: "kill", monsterName: "절벽 늑대", count: 15 },
  reward: { gold: 400, fame: 16, exp: 600, potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "unhyang_guide",
},
```
   - 다이얼로그: 시작 마을 지미(`WoodcutterJimmyDialogue.tsx`)에 "산정 협곡엔 안 휘는 목재가 난다던데, 가이드 도연한테 물어봐" 한 줄(운향 도달 후 노출) → 도연이 위 의뢰 제공 → 완료 시 `jimmy_doyeon_timber_done` flag → 지미 다이얼로그 갱신("도연이 목재 보냈더라. 자, 이거 — " 작은 추가 보상: 제작서 또는 골드).
   - ⚠ 신규 재료 `canyon_timber` 를 만들지(나무꾼/목재 테마 강화), `tough_hide` 같은 기존 재료 deliver 로 갈음할지는 선택. 위 안은 재료 없이 `kill` 로만.

- **`village-suzy-mountain`** (수지 — **선택 항목**): 디올라에서 `suzy_husband_news` 로 끝낸 라인을 한 발 더. 수지 남편이 디올라 일을 마치고 산정 일감을 따라 운향까지 갔다는 소문 → 운향에서 행방 확인(신규 단역 또는 순례자에게서). 보상 gold·fame + 수지 다이얼로그 갱신. 채택 시 수지가 게임 후반까지 따라오는 캐릭터가 됨.

### 7.2 디올라 ↔ 운향

- **`diola-marin-mountain-trade`** (촌장 마린 ↔ 노촌장 백운): 백운 라인 D 단계(§1.1)에서 `mountain_trade_open` flag 가 켜지면 디올라 마린 다이얼로그(`MarinDialogue.tsx`)에 해금:

```ts
// quests.ts — mountain_trade_open flag 가 켜지면 마린 다이얼로그에서 제공.
// (Quest 스키마엔 flag 게이트가 없으니, requiresQuestCompleted: "unhyang-baekun-highland-goats"
//  + 다이얼로그에서 cliff-wolves 완료도 함께 확인 — 또는 백운 D단계에서 디올라용 더미 quest 를
//  completed 처리하는 식. 가장 단순: requiresQuestCompleted 로 highland-goats 만 걸고
//  다이얼로그 노출 조건에 storyFlags.has("mountain_trade_open") 추가.)
{
  id: "diola-marin-mountain-trade",
  regionId: "diola",
  title: "산정과의 거래",
  description:
    "산정 길이 다시 안전해졌다고 들었소. 그렇다면 거래를 트지 — 우리 쪽 길목도 정리가 필요하오. 폐허 어귀 늑대 서른 마리만 솎아 주시오. 그러면 디올라와 운향 사이로 짐수레가 다시 오갈 게요.",
  requiredLevel: 22,
  target: { kind: "kill", monsterName: "폐허 늑대", count: 30 },
  reward: { gold: 700, fame: 26, exp: 1100, potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "diola_elder",
  requiresQuestCompleted: "unhyang-baekun-highland-goats",
},
```
   - 완료 시 `diola_unhyang_trade_done` flag → 디올라 마린·운향 백운 다이얼로그 양쪽 갱신("교역로가 열렸다, 짐수레가 오간다"). `diola_friend` 칭호 보유자에겐 다이얼로그에서 추가 골드 보너스(소소한 콜백).
   - 후속(선택): 양 마을 길드판에 짝지어진 호위 반복 의뢰 — 디올라 길드판 "산정 보급 호위"(산기슭 산양 ×40), 운향 길드판 "하산길 정리"(폐허 늑대 ×40), 둘 다 `requiresQuestCompleted: diola-marin-mountain-trade`.

- **`unhyang-sanha-nora-herbs`** (약초꾼 산하 → 여관 주인 노라):

```ts
// quests.ts
{
  id: "unhyang-sanha-nora-herbs",
  regionId: "unhyang",
  title: "디올라로 보내는 약초",
  description:
    "디올라 여관 주인 노라한테 산정 약초를 좀 보내고 싶어요. 산초꽃 열 송이만 모아다 주시면 제가 부쳐 드릴게요 — 답례는 노라가 직접 챙겨 줄 거예요. 디올라 들르면 인사 한번 하시고요.",
  requiredLevel: 18,
  target: { kind: "deliver", materialId: "sancho_blossom", count: 10 },
  reward: { gold: 400, exp: 600, potions: [{ id: "potion_heal_s", count: 5 }], potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "unhyang_herbalist",
},
```
   - 완료 시 `sanha_nora_herbs_sent` flag → 디올라 노라 다이얼로그(`NoraDialogue.tsx`) 갱신("산하가 보낸 약초 받았어요! 당신이 전령이었군요 — 고마워요") + `herbalists_courier` 칭호 부여(노라와의 대화 시점, 또는 quest 완료 시점). 보상 본체는 산하가 줌.

- **`unhyang-kai-fish-trade`** — **미채택 후보**(기록만): 어부 카이("호수에 뭔가 있다")의 떡밥을 운향까지 끌고 오기엔 운향에 호수가 없어 어색. 카이 떡밥은 디올라 내부(또는 미래 호수 sub-region — `content-roadmap.md` §8)에서 회수하는 게 자연스러움.

### 7.3 운향 ↔ 천공 성지 ↔ 디올라 후드 손님 — 미스터리 실타래

- **`skyreach-haemu-pilgrim-meet`** (해무 ↔ 순례자 미상): 해무 라인 D 단계(§6.1)에서 "북쪽에서 온 순례자에게 내 말을 전해 주오" → 운향 순례자 미상에게 전달 → 순례자 2차 해금(§1.3 상태 2) + 순례자가 답을 줌 → 천공 성지 해무에게 돌아가 보고 → 해무가 "북쪽 너머"의 정체 한 겹을 더 말함. `STORY_QUESTS` 1줄(`pilgrim_haemu_bridge`) + flag `pilgrim_haemu_relay_done`.
- **`stranger-pilgrim-prophecy`** — **선택/미래**: 디올라 후드 손님(`diola_stranger`) ↔ 운향 순례자 미상 — 같은 표식·같은 예언("호수 너머를 봤을 때 다시 와" ↔ "그 너머는 아직 네가 알 시간이 아니야"). 시작 마을·운향·천공 메인 라인 전부 완료 + `pilgrim_revealed` flag 시, 후드 손님이 처음으로 정체의 일부를 말함 → **다음 대륙/지역 떡밥**. 게임 전체 메인 서사의 씨앗 — 별도 콘텐츠 로드맵 항목으로 빼도 됨.

---

## 8. 신규 칭호 후보

| id | 이름(가칭) | 조건 | 부여 지점 |
|---|---|---|---|
| `mountain_friend` | 산정의 벗 | 운향 메인 라인(`unhyang-baekun-peak-giant`) 완료 | quest 완료 시 `grantTitle` 하드체크 (`diola_friend` 패턴, `page.tsx:860`) |
| `ridge_crosser` | 능선을 넘은 자 | 천공 성지 메인 라인(`skyreach-haemu-flame-scale`) 완료 | 동상 |
| `boss_hunter` | 보스 사냥꾼 | `deep-cave-hunter` + `volcano-heart-hunter` + `peak-giant-hunter` 모두 완료 (세 보스 각 10회, §10.4) | quest 완료 시 세 개 다 completed 인지 체크 |
| `caravan_warden` | 대상의 수호자 | 바람골 역참 호위 의뢰(`windvale-merchant-escort` 라인) 전부 완료 | quest 완료 시 |
| `herbalists_courier` | 약초꾼의 전령 | `unhyang-sanha-nora-herbs` 완료 (디올라 노라와 대화 시점) | quest 완료/대화 시 |
| `lucky_finder` | 운 좋은 손 | `hidden-lucky-collector` 완료 (유실된 명품 2종 보유, §11) | 히든 의뢰 완료 시. (대안: `addEquipment` 경로에서 unique rarity 체크 → 첫 획득 즉시 부여 — 둘 중 택1) |
| `cipher_bearer` (선택) | 표식을 든 자 | `hidden-hooded-cipher` 완료 (§11) | 히든 의뢰 완료 시 |

---

## 9. 데이터 변경 요약 (구현 시)

- **`src/adventure/data/quests.ts`** — 위 모든 `Quest` 항목. NPC 전속은 `giverNpcId`, 길드판은 미지정(`getQuestsForRegion` 노출), 후속은 `requiresQuestCompleted`, 반복은 `repeatable`(+`cooldownMs`). `deliver` 형은 NPC 대화에서만 진행 → giverNpcId 필수.
- **`src/adventure/data/storyQuests.ts`** — 대화형 멀티스테이지 메타데이터: `manwol_bold_reunion`, `pilgrim_beyond_north`, `pilgrim_haemu_bridge`, (선택) `suzy_mountain_search`, `stranger_pilgrim_prophecy`. (현재 패턴: 진행 상태는 각 시스템·flag 가 보존, 여기엔 id/title/description/giverNpcId 만.)
- **새 `storyFlag`** — 게이팅 + NPC 대사 분기용:
  - `unhyang_main_cleared` — 운봉의 거인 처치(`unhyang-baekun-peak-giant` 완료) 시
  - `mountain_trade_open` — 백운 교역로 2종(`-cliff-wolves` + `-highland-goats`) 완료 시 → 디올라 `diola-marin-mountain-trade` 해금
  - `diola_unhyang_trade_done` — `diola-marin-mountain-trade` 완료 시 → 양 마을 다이얼로그 갱신 + 후속 호위 반복 의뢰
  - `skyreach_main_cleared` — 해무 봉인 라인(`skyreach-haemu-flame-scale` 완료) 시
  - `manwol_bold_letter_delivered` / `manwol_bold_reunion_done` — 볼드↔만월 라인 2단계
  - `jimmy_doyeon_timber_done` — `village-jimmy-doyeon-timber` 완료 시 → 지미 다이얼로그 갱신
  - `sanha_nora_herbs_sent` — `unhyang-sanha-nora-herbs` 완료 시 → 노라 다이얼로그 갱신 + `herbalists_courier` 칭호
  - `pilgrim_revealed` / `pilgrim_haemu_relay_done` — 순례자 미스터리 라인
- **`src/adventure/town/dialogues/*.tsx`** — `BaekunDialogue`·`ManwolDialogue`·`PilgrimDialogue`·`DoyeonDialogue`·`SanhaDialogue` 에 단계별 분기 추가. 시작 마을 `BlacksmithDialogue`·`WoodcutterJimmyDialogue`·(선택) `SuzyDialogue`, 디올라 `MarinDialogue`·`NoraDialogue`·(선택) `StrangerDialogue` 에 연계 분기. 천공 성지 해무·검·시온은 현재 NPC만 있고 다이얼로그 컴포넌트가 없을 수 있음 → 신규 `HaemuDialogue` 등 추가. 신규 NPC(`windvale_bard` 등) 다이얼로그 파일.
- **`src/adventure/data/npcs.ts`** — 신규 `NpcId`: `windvale_bard`, `windvale_caravan_guard`(선택), `skyreach_acolyte`, `skyreach_gatekeeper`(선택). 시작 마을/디올라 NPC 추가 없음(전부 기존 재활용).
- **`src/adventure/data/titles.ts`** + **`src/app/page.tsx`** — §8 칭호 5종 추가 + quest 완료 핸들러(`handleClaimQuest`/`completeQuest` 근처, `page.tsx:860` 패턴)에 `grantTitle` 하드체크. `lucky_finder` 만은 `addEquipment`/`addDroppedEquipment` 경로에서 rarity 체크.
- **(선택) `src/adventure/data/monsters.ts`** — ⚠ 미니보스 후보(들소 무리장 / 산악 기사단장)는 region.boss 가 아니라 의뢰 전용이라 진입 경로가 애매 → 1차 범위 제외, 기존 잡몹 ×N 으로 대체.
- **(선택) `src/adventure/data/materials.ts`** — `canyon_timber`(지미↔도연) — 없이 `tough_hide` 재활용 가능.
- **`docs/items.md` / `docs/changelog.md`** — 새 보상 장비·제작서·칭호 동기화.

### 9.1 메인·연계 라인 의존 그래프

```
[운향 도달] (peak_giant_engaged)
  └─ 백운: unhyang-baekun-canyon-survey  (kill 늑대 무리장 ×3)
       └─ 백운: unhyang-baekun-peak-giant  (kill 운봉의 거인 ×1)  ──▶ mountain_friend 칭호, unhyang_main_cleared
            ├─ 백운: unhyang-baekun-cliff-wolves  (kill 절벽 늑대 ×30)  ─┐
            ├─ 백운: unhyang-baekun-highland-goats (kill 산양 ×40)       ─┴─▶ mountain_trade_open
            │                                                              └─ 디올라 마린: diola-marin-mountain-trade (kill 폐허 늑대 ×30) ──▶ diola_unhyang_trade_done
            │                                                                    └─ (선택) 양 마을 길드판 호위 반복 의뢰
            └─ 백운: unhyang-peak-giant-recurring  (kill 운봉의 거인 ×3, repeatable)

[운향 — 만월]
  만월: unhyang-manwol-ore-demo  (deliver 운봉석 ×6 → recipe peak_mantle)
       └─ 만월: manwol_bold_reunion (STORY) → [시작 마을 볼드] manwol_bold_letter_delivered → [운향 만월] manwol_bold_reunion_done

[운향 — 산하]   unhyang-sanha-nora-herbs (deliver 산초꽃 ×10) ──▶ sanha_nora_herbs_sent → [디올라 노라] herbalists_courier 칭호
[운향 — 도연]   village-jimmy-doyeon-timber (kill 절벽 늑대 ×15, 지미가 운 띄움) ──▶ jimmy_doyeon_timber_done → [시작 마을 지미] 추가 보상

[화산의 심장 처치] (volcano_heart_defeated → 천공 성지 진입)
  └─ 해무: skyreach-haemu-lava-core      (deliver 용암 핵 ×6 → recipe volcano_armor)
       └─ 해무: skyreach-haemu-phoenix-feather (deliver 봉황 깃털 ×5 → recipe volcano_core)
            └─ 해무: skyreach-haemu-flame-scale (deliver 화염 비늘 ×8) ──▶ ridge_crosser 칭호, skyreach_main_cleared
                 └─ 해무: skyreach-haemu-pilgrim-meet (STORY) ↔ [운향 순례자] → pilgrim_haemu_relay_done
  └─ 해무: skyreach-volcano-heart-recurring (kill 화산의 심장 ×3, repeatable)  [requiresQuestCompleted: skyreach-haemu-lava-core]

[순례자 미상 대사 단계]  0(잠금) → 1(volcano_heart_defeated) → 2(skyreach_main_cleared → pilgrim_revealed) → 3(선택: 전 메인 완료 → 디올라 후드 손님 해금)
```


---

## 10. 보스 의뢰 — 싱글 / 협동

게임의 보스는 두 부류 — **싱글(솔로 인스턴스)**: 광맥의 수호자(`deep_cave`), 화산의 심장(`volcanic_badlands`) — 둘 다 `region.boss` + 일일 3회 입장 제한. **협동**: 운봉의 거인 — 협동 던전(`peak_giant_engaged`/`peak_giant_defeated` flag, 일반 풀에서 제외). 기존 보스 의뢰는 1회성 메인 + 정기 반복뿐 → **누적 사냥 라인 + 액세서리 확정 루트 + "보스 사냥꾼" 칭호**를 추가한다.

### 10.1 광맥의 수호자 (싱글, deep_cave)

```ts
// quests.ts — 볼드: 마정석 무기 라인 보조 (광맥의 수호자 → 마정석 → 볼드 연결).
// 만월의 unhyang-manwol-ore-demo(견갑) 와 같은 패턴 — 두 대장장이가 각자 보스 라인 액세서리 확정 루트를 줌.
{
  id: "village-bold-mana-crystal",
  regionId: "village",
  title: "마정석을 다루는 법",
  description:
    "광맥의 수호자가 떨군 마정석, 그거 제대로 다루려면 손이 익어야 해. 다섯 덩이만 가져와 봐 — 그걸로 시연을 보여주지. 보고 나면 자네도 마정석 무기를 벼릴 수 있을 거야.",
  requiredLevel: 6,
  target: { kind: "deliver", materialId: "mana_crystal", count: 5 },
  reward: { gold: 600, exp: 500, recipes: ["mana_bracelet"], potionCapacityBonus: 1 },
  repeatable: false,
  giverNpcId: "village_blacksmith_bold",
},
// 누적 사냥 1/3 — 일일 3회 제한이라 자연히 여러 날 걸린다. 지미가 주는 개인 도전(길드판 미노출).
{
  id: "deep-cave-hunter",
  regionId: "village",
  title: "광맥의 수호자 ─ 사냥 기록",
  description:
    "그놈을 열 번이나 잠재우면 동굴 안쪽이 한동안 조용하다고들 하더라고. 나야 무서워서 못 가지만 — 모험가 양반이라면 기록 한번 채워볼 만하지 않겠어?",
  requiredLevel: 6,
  target: { kind: "kill", monsterName: "광맥의 수호자", count: 10 },
  reward: { gold: 1500, fame: 30, exp: 1800 },
  repeatable: false,
  giverNpcId: "village_woodcutter_jimmy",
  requiresQuestCompleted: "village-jimmy-deep-cave",
},
```

### 10.2 화산의 심장 (싱글, volcanic_badlands)

```ts
// quests.ts — 시온: 화산의 심장 확정 드롭(용암 핵 ×4 / 봉황 깃털 ×3 / 화염 비늘 ×5)을 노린 누적 deliver.
{
  id: "skyreach-alchemist-heart-essence",
  regionId: "skyreach",
  title: "심장에서 나온 것",
  description:
    "화산의 심장을 잠재울 때마다 떨어지는 것들 — 용암 핵, 봉황 깃털, 화염 비늘. 그걸로 봉인 보강제를 만들어 봐야겠어. 용암 핵 열 개만 모아다 줘.",
  requiredLevel: 55,
  target: { kind: "deliver", materialId: "lava_core", count: 10 },
  reward: { gold: 2000, exp: 3500, potionCapacityBonus: 1 },
  repeatable: true,
  cooldownMs: 12 * 60 * 60 * 1000,        // 보스가 핵 4개 확정이라 12h 쿨다운으로 길게
  requiresQuestCompleted: "windvale-volcano-boss",
},
// 누적 사냥 2/3 — 정찰대원 검이 주는 개인 도전(길드판 미노출).
{
  id: "volcano-heart-hunter",
  regionId: "skyreach",
  title: "화산의 심장 ─ 사냥 기록",
  description:
    "그것을 열 번이나 잠재운 자가 있었다는 옛 기록이 성지에 남아 있어. 솜씨가 있다면 — 자네가 그 기록을 다시 써 보겠어?",
  requiredLevel: 55,
  target: { kind: "kill", monsterName: "화산의 심장", count: 10 },
  reward: { gold: 3500, fame: 50, exp: 6000 },
  repeatable: false,
  giverNpcId: "skyreach_guide",
  requiresQuestCompleted: "windvale-volcano-boss",
},
```

### 10.3 운봉의 거인 (협동)

```ts
// quests.ts — 누적 협동 사냥 3/3. 백운이 주는 개인 도전. "동료와 함께" 는 협동 던전 시스템으로 강제됨.
{
  id: "peak-giant-hunter",
  regionId: "unhyang",
  title: "운봉의 거인 ─ 사냥 기록",
  description:
    "거인을 열 번 잠재운 무리는 산정의 노래에 이름이 남는다네. 동료들과 함께 그 기록을 채워 보겠나?",
  requiredLevel: 22,
  target: { kind: "kill", monsterName: "운봉의 거인", count: 10 },
  reward: { gold: 2500, fame: 50, exp: 5000 },
  repeatable: false,
  giverNpcId: "unhyang_elder",
  requiresQuestCompleted: "unhyang-baekun-peak-giant",
},
```

### 10.4 "보스 사냥꾼" 칭호

세 hunter 의뢰(`deep-cave-hunter`[지미] + `volcano-heart-hunter`[검] + `peak-giant-hunter`[백운]) **전부 완료** → `page.tsx` quest 완료 핸들러에서 셋 다 completed 인지 확인 후 `boss_hunter` 칭호 부여. (개별 quest 가 monsterName 별 카운트라 "아무 보스나 N회"는 3분할 + 완료 체크로 구현 — `diola_friend` 패턴의 응용. 세 의뢰 모두 그 보스를 처음 소개한 NPC 가 다시 주는 "개인 도전" 이라 길드판 미노출.)
새 칭호 **`boss_hunter`**(보스 사냥꾼 — 세 거대한 것을 각각 열 번 잠재운 자).

### 10.5 보스 의뢰 전체 맵

| 보스 | 종류 | 메인(1회성) | 정기 반복(×3) | 누적(×10, NPC 도전) | 액세서리 확정 루트 | 추가 |
|---|---|---|---|---|---|---|
| 광맥의 수호자 | 싱글 (deep_cave, 일 3회) | `village-jimmy-deep-cave` (지미) | `village-deep-cave-recurring` (길드판) | `deep-cave-hunter` (지미) | `village-bold-mana-crystal` (볼드) → 마정석 팔찌 | — |
| 운봉의 거인 | 협동 (협동 던전) | `unhyang-baekun-peak-giant` (백운, §1) | `unhyang-peak-giant-recurring` (백운, §1) | `peak-giant-hunter` (백운) | `unhyang-manwol-ore-demo` (만월) → 운봉 견갑 (§1.2) | `unhyang-wolf-chieftain-hunt`(길드판 전초, §2.1) |
| 화산의 심장 | 싱글 (volcanic, 일 3회) | `windvale-volcano-boss` (한솔) | `skyreach-volcano-heart-recurring` (해무, §6) | `volcano-heart-hunter` (검) | `skyreach-haemu-*` (해무, §6.1) → 봉황갑·봉황주 | `skyreach-alchemist-heart-essence`(시온, 반복 deliver) |

---

## 11. 히든 퀘스트

"히든" = 길드 게시판에 안 뜨고(`giverNpcId` 지정), **특정 조건(아이템 보유 · 칭호 · storyFlag · 보스 N회 처치 · 특정 NPC를 모두 만남)이 충족돼야만 NPC 가 입을 여는** 의뢰. `Quest` 스키마는 손대지 않음 — 다이얼로그 컴포넌트가 노출 여부를 결정한다(디올라 후드 손님 "호수 너머를 봤을 때 다시 와" 패턴). 보상은 골드보다 **lore · 칭호 · 특별 아이템**에 무게.

| id | 트리거 (히든 조건) | 흐름 | 보상 | 메모 |
|---|---|---|---|---|
| `hidden-mole-king` | `mole_king_drill`(두더지왕의 드릴) 보유/장착 + 시작 마을 지미와 대화 | 지미 "두더지왕이 진짜 있다고? …평야 두더지를 백 마리쯤 잡아보면 흔적이 나올지도" → 두더지 ×100 → 지미가 "두더지왕의 기록"(lore) + 골드 | gold + lore. (선택) 추가 두더지 테마 아이템 | 유실된 명품 시스템과 묶이는 첫 히든 — 가볍고 재밌음 |
| `hidden-lucky-collector` | "유실된 명품"(unique 등급) 1개 이상 보유 + 바람골 음유시인(`windvale_bard`)과 대화 | 음유시인 "유실품을 모으는 자의 옛 노래가 있지 — 두 점을 모은 자에게 행운이 따라붙는다고" → 유실된 명품 2종 보유(다이얼로그에서 인벤 확인, deliver 아님) → `lucky_finder` 칭호 + 골드 | 칭호 + gold | §8 `lucky_finder` 를 이 히든 라인으로 부여(획득 즉시 부여 대신). 음유시인 NPC(§3.1)와 묶임 |
| `hidden-deepest-vein` | `deep-cave-hunter` 완료 (광맥의 수호자 10회) | 깊은 동굴에서 광부 표식/유령 발견(신규 단역 또는 만월·볼드 대사) → "광맥의 끝" — 작은 광물 골렘 ×50 (더 안쪽 암시) → lore + 미래 sub-region 떡밥 | lore + gold + potionCapacityBonus | 광맥 끝 = 미래 콘텐츠 떡밥 보관소 |
| `hidden-giants-origin` | `unhyang_main_cleared` + 운봉의 거인 5회 처치 + 순례자 미상과 대화 | 순례자 "거인이 어디서 왔는지 알고 싶나? …협곡 가장 깊은 곳, 돌풍 정령이 모이는 자리를 봐라" → 돌풍 정령 ×60 (또는 ⚠ 히든 인카운터) → 순례자가 거인의 기원 일부 공개 | lore + gold + 순례자 곁가지 해금 | §1.3 순례자 라인의 곁가지 — 북쪽 미스터리 보강 |
| `hidden-volcano-relic` | `windvale-volcano-boss` 완료 + 화산의 심장 5회 처치 + 시온과 대화 | 시온 "심장이 잠든 자리에 정수가 고였더군 — 화산 두꺼비를 충분히 잡으면 그 정수가 흘러나올 거야" → 화산 두꺼비 ×40 (+ `lava_core` deliver) → ⚠ 특별 액세서리("용암 정수" — 화염형) 또는 기존 봉황 무구 제작서 1종 | ⚠ 신규 액세서리 1종 또는 기존 제작서 | 봉황 무구 라인 곁가지. 신규 아이템 도입 시 ⚠ |
| `hidden-blacksmith-duel` | `manwol_bold_reunion_done` (볼드↔만월 라인 완료, §1.2) | 볼드(또는 만월) "옛날에 만월이랑 무기 하나를 절반씩 만들다 싸우고 헤어졌지. 둘 다 만났으니 — 마저 완성해 볼 텐가" → 양쪽에서 재료 deliver 2단계 → 합작 무기 제작서("월광검" 류) | ⚠ 신규 무기 제작서 1종 (+ 칭호 후보) | 두 대장장이 라인의 보너스 결말. 신규 무기 도입 시 ⚠ |
| `hidden-pilgrim-trail` | 운향에서 순례자 미상과 대화 + `unhyang_main_cleared` | 순례자가 떠난 뒤, 운저 평원 → 잿빛 협로 → 봉황령 각 지역 도착 시 "순례자의 표식" 다이얼로그 이벤트 + 짧은 kill/deliver 1단계씩 → 마지막에 천공 성지에서 순례자 재회 → 북쪽 떡밥 클로저 | 단계별 gold + 최종 lore + `pilgrim_revealed` flag | **가장 야심찬 히든** — 신규 지역 4곳을 가로지르는 빵부스러기 추격. §7.3 미스터리 실타래의 본편 |
| `hidden-hooded-cipher` | 디올라 후드 손님과 대화(`stranger_ruins_guide` 보유) + `unhyang_main_cleared` | 후드 손님이 준 표식/암호를 운향 순례자에게 보여줌 → 순례자가 일부 해독 → 후드 손님에게 돌아감 → 두 미스터리 NPC 가 같은 조직임이 드러남 | lore + (선택) 칭호 `cipher_bearer` | §7.3 `stranger-pilgrim-prophecy` 의 구체화. 게임 전체 메인 서사의 씨앗 |

> **히든 노출 (구현 노트)** — 전부 `giverNpcId` 지정 `Quest`(길드판 미노출, `getQuestsForRegion` 에 안 걸림) + 해당 NPC 다이얼로그에서 노출 조건 체크: `storyFlags.has(...)` / `inventory.has(itemId)` / `adventureLog.titles.includes(...)` / `quests.isCompleted(...)` / (보스 N회) `adventureLog.kills[name] >= N`. `Quest` 스키마 무변경 — "히든"은 순전히 다이얼로그 게이트 + 게시판 비노출.
> **신규 아이템 ⚠** — `hidden-volcano-relic`·`hidden-blacksmith-duel` 두 곳만. 나머지 6개는 lore·칭호·골드로 성립. 도입 여부는 §13 미결정.
> **"보스 N회 처치" 게이트** — `adventureLog.kills` 누적 카운터가 이미 존재(도감·칭호용). 히든 트리거에 그대로 재사용 — 새 추적 시스템 불필요.

### 11.1 `hidden-pilgrim-trail` — 순례자의 자취 (상세)

순례자 미상이 운향을 떠난 뒤, **운저 평원 → 잿빛 협로 → 봉황령**에 차례로 "표식"을 남긴다. 각 지역에 처음 들어설 때 다이얼로그 이벤트 + 짧은 1단계 의뢰가 풀리고, 다음 표식의 방향이 한 줄씩 드러난다. 마지막에 천공 성지에서 순례자와 재회 — 그가 처음으로 "북쪽 너머"를 말한다. (구현상으론 표식 = 그 지역에서 노출되는 `giverNpcId` 없는 1회성 `Quest` 인데 게시판에는 안 띄우고, "그 지역에 처음 visited + `unhyang_main_cleared` + 직전 표식 완료" 조건으로 surfacing. 또는 표식별 단역 NPC 하나씩.)

| # | 지역 | 표식 단서 | 1단계 의뢰 | 보상 | 다음으로 |
|---|---|---|---|---|---|
| 1 | 운저 평원 | "풀밭 한가운데 돌무지 위에 낯선 매듭. …순례자가 묶은 거다." | 떠돌이 약탈자 ×10 (매듭이 약탈자 야영지 옆) | gold 600 / exp 900 | 단서: "잿가루 냄새 나는 협로 쪽으로 갔다" |
| 2 | 잿빛 협로 | "잿더미에 반쯤 묻힌 같은 매듭. 옆에 식은 모닥불 자리." | `ash_stone` ×5 deliver (모닥불 자리에서 주워 표식에 올려놓기 — 단역 NPC 또는 자동) | gold 800 / exp 1200 | 단서: "불길이 서린 능선으로 올라갔다" |
| 3 | 봉황령 | "능선 바위에 새긴 매듭 문양 — 디올라 후드 손님이 준 표식과 같은 모양." | 산악 기사 ×12 (순례자가 기사들에게 길을 막혔다) | gold 1000 / exp 1500 | 단서: "능선 너머, 화산을 지나 성지로 갔다" |
| 4 | 천공 성지 | 순례자 미상이 거기 있다 — "여기까지 따라왔군." | (의뢰 없음 — 대화 이벤트) | 최종 lore + gold 1500 + `pilgrim_revealed` flag | **북쪽 너머의 정체 일부 공개.** §1.3 순례자 상태 2 와 동일 결과 — `hidden-pilgrim-trail` 을 끝낸 사람은 순례자 대사가 바로 상태 2 로 점프. `hidden-hooded-cipher`(후드 손님 라인)와 합류 → §7.3 미스터리 클로저 |

> 트리거 게이트: `unhyang_main_cleared` (= 백운 메인 완료 — 순례자가 그제서야 떠남) + 운향에서 순례자와 한 번 대화. 표식 #N 은 `#N-1` 완료 + 해당 지역 진입 시 surfacing. 화산 지대는 표식 없음(빠른 통과 구간으로 둠) — #3 단서가 "화산을 지나"로 직접 천공 성지를 가리킴.
> 신규 아이템 없음 — lore·골드만. 신규 단역 NPC(표식 옆에 쪼그려 앉은 짐꾼·잿빛 협로 떠돌이 등) 0~3명은 선택.

---

## 12. 우선순위 / 마일스톤

1. **M1 — 운향 메인 라인** ✅ *구현됨* (§1.1 백운: 협곡 정찰 → 거인 → 교역로 2종 / §1.2 만월 운봉석 시연 → 견갑 제작서 / `unhyang-peak-giant-recurring` 정기는 길드 게시판 / `mountain_friend` 칭호 + `unhyang_main_cleared`·`mountain_trade_open` flag / `BaekunDialogue`·`ManwolDialogue` 단계 분기). 미포함: `manwol_bold_reunion`(§7.1, M5 로 이관), 보상 수치 시뮬 미조정(§13).
2. **M2 — 천공 성지 메인 라인** ✅ *구현됨* (§6.1 해무 봉인 라인: 용암 핵 ×6 → 봉황 깃털 ×5 → 화염 비늘 ×8 → 봉황 깃털 ×8, 전부 deliver / `volcano_armor`·`volcano_core` 제작서 + `skyreach-haemu-weapons` 로 봉황 무기 4종 제작서까지 확정 / `ridge_crosser` 칭호 + `skyreach_main_cleared` flag(화염 비늘 단계에서) / `skyreach-volcano-heart-recurring` 정기는 길드 게시판 / 신규 `HaemuDialogue`(questLineDialogue 헬퍼 사용)). 미포함: `skyreach-haemu-pilgrim-meet` 릴레이 — 단 PilgrimDialogue 가 `skyreach_main_cleared` 로 직접 2차 해금되므로 라인은 이어짐.
3. **M3 — 사이드 의뢰 일괄** ✅ *구현됨* (§2 운향 / §3 다리 구간 / §4 봉황령 / §5 화산 지대).
   - 운향(§2.1·§2.2·§3.2): 도연 8의뢰 / 산하 8의뢰(전부 deliver) / 백운 `unhyang-baekun-pilgrim-escort` / 운향 게시판 9개. 봉황 망토 확정 루트 `unhyang-herbalist-flame-eagle-cape`(§4) 포함.
   - 다리 구간(§3.1·§3.3): 신규 다이얼로그 `MaroDialogue`·`NoeulDialogue`·`HansolDialogue` — 마로 2 / 노을 4 / 한솔 4의뢰 + 바람골 게시판 8개. 기존 미노출이던 `windvale-keeper-bison`·`windvale-merchant-hawk-feathers`·`windvale-pathfinder-golems`·`windvale-volcano-boss` 가 비로소 대화로 연결됨.
   - 봉황령·화산(§4·§5): 신규 다이얼로그 `GeomDialogue`(검 5)·`SionDialogue`(시온 4) — 기존 미노출이던 `skyreach-guide-knights`·`skyreach-alchemist-lava-core` 포함. 천공 게시판 `skyreach-phoenix-ridge-*`·`skyreach-volcanic-toads`·`skyreach-lava-slimes-2`·`skyreach-knight-captain-hunt`.
4. **M4 — 보스 의뢰 보강** ✅ *구현됨* (§10). 세 보스 누적 hunter ×3(`deep-cave-hunter`[지미]·`peak-giant-hunter`[백운]·`volcano-heart-hunter`[검]) + `boss_hunter` 칭호(page.tsx 하드체크) + 시온 `skyreach-alchemist-heart-essence`(용암 핵 ×10, 반복 12h) + 볼드 `village-bold-mana-crystal`(마정석 ×5 deliver → `mana_bracelet` 제작서, `jimmy_deep_cave_quest` flag 로 BlacksmithDialogue 노출). 미포함: 미니보스 도입(§13, 1차 제외 권장 그대로).
5. **M5 — 마을 간 연계** ✅ *구현됨* (§7.1·§7.2). `diola-marin-mountain-trade`(폐허 늑대 ×30 → `diola_unhyang_trade_done`) / `unhyang-sanha-nora-herbs`(산초꽃 ×10 → `sanha_nora_herbs_sent` + `herbalists_courier` 칭호) / `village-jimmy-doyeon-timber`(절벽 늑대 ×15 → `jimmy_doyeon_timber_done`) / `manwol_bold_reunion`(볼드↔만월 대사 릴레이 — `manwol_bold_errand_given` → `manwol_bold_letter_delivered` → `manwol_bold_reunion_done`, BlacksmithDialogue·ManwolDialogue 양쪽 갱신, `STORY_QUESTS.manwol_bold_reunion`). 양 마을 다이얼로그(마린·노라·지미·볼드·만월) 모두 갱신됨. 미포함: (선택) 수지 산정 확장·카이 호수 떡밥(§13).
6. **M6 — 미스터리 + 히든 + 신규 NPC + 칭호** (§1.3 순례자, §6.2 사미승·문지기, §3.1 음유시인, §8 칭호, §11 히든 퀘스트). ✅ *대부분 구현됨*.
   - §1.3 순례자 `PilgrimDialogue` 3단계(`volcano_heart_defeated` → `skyreach_main_cleared` → `pilgrim_revealed`) + `STORY_QUESTS.pilgrim_beyond_north`.
   - 신규 NPC 3명 — `windvale_bard`(음유시인) / `skyreach_acolyte`(사미승 운하) / `skyreach_gatekeeper`(문지기 청람). **초상화 미지정(placeholder)**, lore/quest NPC.
   - 히든 퀘스트 **8/8 구현** — `hidden-mole-king`(두더지왕의 드릴 보유 → 두더지 ×100, WoodcutterJimmyDialogue) / `hidden-deepest-vein`(deep-cave-hunter 완료 → 마정석 ×20, BlacksmithDialogue) / `hidden-blacksmith-duel`(manwol_bold_reunion_done → 단단한 결정 ×8, BlacksmithDialogue) / `hidden-giants-origin`(unhyang_main_cleared + 운봉의 거인 5회 → 돌풍 정령 ×60, PilgrimDialogue) / `hidden-volcano-relic`(화산의 심장 5회 → 화산 두꺼비 ×40, SionDialogue) / `hidden-lucky-collector`(unique 2종 보유 + 음유시인 대화, BardDialogue 신규, `STORY_QUESTS`) / `hidden-hooded-cipher`(후드 손님↔순례자 표식 릴레이 — `cipher_started` → `cipher_shown_pilgrim` → `cipher_done`, StrangerDialogue·PilgrimDialogue, `STORY_QUESTS`) / `hidden-pilgrim-trail`(§11.1 — 운저 평원→잿빛 협로→봉황령 표식 추적 → 천공 성지 재회 → `pilgrim_revealed`. `hidden-pilgrim-trail-1/2/3` 의뢰 + 신규 `PilgrimMarkDialogue`(통과 지역에서 "알림판" 카드로 surfacing — town 아닌 지역에 NPC 없이 의뢰 노출), `STORY_QUESTS`). 신규 헬퍼 `src/adventure/inventory/ownership.ts`(장비 보유·unique 카운트). 신규 아이템 도입(§13 결정): `hidden-blacksmith-duel` → `moonlight_blade`("월광검", atk+9/str+4/spd+3, rare), `hidden-volcano-relic` → `lava_essence`("용암 정수", str+6/vit+5, rare) — 둘 다 tradable=false·의뢰로만 입수.
   - 칭호 — `caravan_warden`(노을 호위 2종, page.tsx) / `lucky_finder`(`bard_lucky_collected` flag, useTitleGrants) / `cipher_bearer`(`cipher_done` flag, useTitleGrants). §8 칭호 전부 완료.
   - **미포함**: 없음 (M6 전부 구현). 잔여는 §13 보상 수치 시뮬 튜닝 + docs/items.md·changelog 동기화뿐.

각 마일스톤은 독립 PR — 한 PR = 한 라인/한 지역 단위로 쪼개 커밋. 사용자 검토 후 착수.

---

## 13. 미결정 사항

- ~~**`giant_slayer` vs `mountain_friend`**~~ → **결정: 새 칭호 `mountain_friend`** (기존 `giant_slayer`는 데미지 50%↑ 조건 그대로 유지). 구현됨.
- ~~**운봉 무구 / 봉황 무구 확정 루트**~~ → **결정: 무기까지 확정 루트로 푼다.** 보스 `recipe_one_of`(럭키 조기 입수)는 그대로 두고, 추가로 `unhyang-manwol-weapons`(운봉석 ×8 → 운봉 무기 4종 제작서, 만월) / `skyreach-haemu-weapons`(봉황 깃털 ×8 → 봉황 무기 4종 제작서, 해무)를 후속 의뢰로. 견갑/액세서리는 기존대로 `unhyang-manwol-ore-demo`(peak_mantle) / `skyreach-haemu-lava-core`·`-phoenix-feather`(volcano_armor·volcano_core). 구현됨.
- **미니보스 도입 여부** — 들소 무리장·산악 기사단장 같은 의뢰 전용 미니보스를 만들지(콘텐츠 풍부 ↑, 구현 ↑) vs 기존 잡몹 ×N 으로 갈음(가벼움). 1차 범위 제외 권장 — 미구현(그대로 잡몹 ×N).
- ~~**히든 퀘스트 신규 아이템**(§11)~~ → **결정: 도입한다.** `lava_essence`("용암 정수", str+6/vit+5 액세서리, rare, `hidden-volcano-relic` 보상) / `moonlight_blade`("월광검", atk+9/str+4/spd+3 무기, rare, `hidden-blacksmith-duel` 보상). 둘 다 정식 곡선 한 칸 위·tradable=false·의뢰로만 입수. 구현됨.
- **보스 누적 의뢰 카운트** — `deep-cave-hunter`/`volcano-heart-hunter`/`peak-giant-hunter` ×10 이 일일 3회 제한 보스라 4~5일 걸림 — 적절한지, ×5 로 낮출지.
- **수지 라인 산정 확장**(§7.1) / **카이 호수 떡밥**(§7.2) — 채택 여부. 전자는 좋고, 후자는 운향 지형상 어색.
- **다음 콘텐츠 떡밥의 방향** — "북쪽 너머" = 천공 성지 첨탑 위? 구름층 너머? 새 대륙? 순례자·해무·후드 손님 대사를 어디로 수렴시킬지. (`hidden-pilgrim-trail`·`hidden-hooded-cipher` 가 여기로 수렴.)
- 보상 수치(gold/fame/exp)는 전부 스케치 — 실제 곡선(만렙 70 EXP 테이블, 길드 의뢰 보상)에 맞춰 시뮬 조정 필요.

---

## 14. NPC 어투 레퍼런스 + 스토리 흐름 메모

본 문서의 모든 설명문안·다이얼로그는 아래 어투 표에 맞춰 작성·교정했다. 구현 시 `*Dialogue.tsx` 작성도 이 표를 기준으로 — NPC마다 register 가 다르고, **같은 NPC라도 greeting(잡담체)과 quest-giving(약간 더 격식) 사이에 미세한 차이**가 있을 수 있다(예: 마린).

| NPC | 기준 greeting (npcs.ts) | register | quest 설명문안 어투 | 비고 |
|---|---|---|---|---|
| 백운 (운향 노촌장) | "…먼 길을 올라왔구먼. … 살고 있다네. … 들려주지." | 노촌장 — `~구먼/~다네/~게야/~주게/~보겠나` | 동일 (§1.1 에서 하오체 → 이 어조로 전면 교정) | **메인 라인 주인공**. "산정의 명운/숨/노래" 류 큰말 즐겨 씀 |
| 만월 (운향 대장장이) | "어이, 모험가. 운봉석은 … 손이 드물어. … 만들어 주지 — 아직은 좀 더 두고 봐야겠지만." | 늙은 장인 — `~어/~주지/~겠지만` (가끔 `~게/~ㅁ세`) | "~드물어/~보여주지/~새겨질 거야" | 까칠+무뚝뚝. 볼드를 "그 까칠한 노인네/대머리 영감"이라 부름(§1.2) |
| 도연 (운향 가이드) | "산을 잘 안다니까 … 협곡은 아직도 위험해. … 도와줄 일이 있어." | 젊은 안내인 — 반말 `~해/~지/~있어/~줄게` | 동일 | 활기참. 산기슭/협곡/봉황령/운저 평원 사정에 밝음 |
| 산하 (운향 약초꾼) | "오, 새 얼굴이네요. … 모아오시면 … 써먹을 수 있어요." | 약초꾼 — 존대 부드러움 `~네요/~어요/~게요/~주시면` | 동일 | 약·재료 거래. 노라(디올라 여관)와 친분(§7.2) |
| 순례자 미상 (운향) | "…북쪽에서 왔다. 그 너머는 아직 네가 알 시간이 아니야." | 하드보일드 단정 — `~다/~아니야/~봐라` (말 아낌) | (의뢰 거의 없음 — 대사 분기 위주, §1.3) | 디올라 후드 손님과 같은 톤·같은 표식 |
| 마로 (바람골 역참지기) | "어서 오시오, 모험가. … 여긴 조용한 곳이오. …그 들소가 문제지만." | 노인 — 하오체 `~오시오/~곳이오/~주시오` | 동일 | 오가는 대상 사정에 훤함 |
| 노을 (바람골 대상 상인) | "오, 마침 사람 손이 필요했는데. … 모이질 않아. … 나눠 드리지." | 상인 반말 — `~않아/~드리지/~거든` | "~안 모여/~떼어내 줘/~나눠 드리지" | 길 위 소문통. 호위 의뢰 단골 |
| 한솔 (바람골 길잡이) | "봉황령으로 가려고? 길은 … 지나야 해. … 알려줄 수 있겠는데." | 길잡이 반말 — `~해/~있어서/~겠는데` | 동일 | 잿가루 묻은 외투. 잿빛 협로·봉황령 길 개척 |
| 해무 (천공 성지 원로) | "…드디어 왔구려. … 잠든 걸 느꼈소. … 잘 와줬소." | 원로 — 하오체 약간 고풍 `~구려/~소/~지/~주리다` | 동일 (§6.1) | "봉인/성지/능선" 류. 백운과 대응되는 자리 |
| 검 (천공 성지 정찰대원) | "왔구나! … 더 늘었어. … 도움을 청할 수 있겠는데." | 대담·말 빠름 반말 — `~구나/~늘었어/~겠는데` | 동일 | 봉황령·화산 지대 순찰 |
| 시온 (천공 성지 연금술사) | "오, 마침 잘 왔어. … 가끔 나오거든. … 거래할 수 있어." | 연금술사 반말 — `~왔어/~나오거든/~있어` | 동일 | 화산 재료 연구. 그을린 가운 |
| 볼드 (시작 마을 대장장이) | "어, 왔나. … 가져와 봐. … 녹여주지." | 대장장이 반말 — `~왔나/~봐/~주지/~거야` | 동일 (§7.1·§10.1) | 만월의 옛 동료(§1.2) |
| 지미 (시작 마을 나무꾼) | "어이, 모험가 양반. … 나무 좀 패다 왔지. … 안 그래?" | 소박한 반말 — `~양반/~왔지/~하더라고/~텐가?` | 동일 (§7.1·§10.1) | 깊은 동굴 의뢰 시리즈 + 도연과 연계 |
| 마린 (디올라 촌장) | "…어서 와요, 모험가. … 잘 살펴야 해. … 아니거든." | 자상한 노인 — greeting 은 `~와요/~해/~거든`, **quest 는 하오체** (`diola-marin-soul-crystals` = "~주시오/~했소") | quest: 하오체 (기존 선례 유지, §7.2) | greeting/quest 어조 차이 = 의도 |
| 노라 (디올라 여관) | "피곤해 보이네요. 들어와요. … 갓 갈아둔 거랍니다." | 따뜻한 존대 — `~네요/~어요/~거랍니다` | (산하 연계 답례 대사, §7.2) | — |
| 후드 손님 (디올라) | "…아직 너에게 들려줄 이야기는 없어. 호수 너머를 봤을 때, 다시 와." | 미스터리 — 순례자와 동형 | (대사 분기, §7.3·§11) | 순례자·해무와 같은 조직(미래 메인 서사) |

### 14.1 스토리 흐름 — 교정·정합성 체크 결과

- **백운 어조 통일** — §1.1 의 5개 메인 의뢰 + 다이얼로그 A~D 를 하오체("~주시오") → 노촌장 어조("~주게/~보겠나/~다네")로 전면 교정. greeting 과 일치.
- **만월 greeting "두고 봐야겠지만" 회수** — `unhyang-manwol-ore-demo`(운봉석 시연) 가 그 "두고 봐야겠지만"을 명시적으로 푸는 의뢰. 회수 완료.
- **백운 greeting "차차 들려주지" 회수** — 다이얼로그 상태 A 에서 곧장 거인 이야기로 이어짐.
- **순례자/후드 손님 톤 일치** — 둘 다 "~다/~없어/~다시 와" 단정 톤. 같은 표식(`hidden-pilgrim-trail` #3, `hidden-hooded-cipher`)으로 연결 — 떡밥 일관.
- **보스 누적 의뢰는 "그 보스를 처음 소개한 NPC"가 다시 줌** — 광맥(지미) / 거인(백운) / 화산(검) — 게시판 그라인드가 아니라 인물과 이어진 도전으로. 어조도 각 NPC.
- **거점 분담 정합** — 운향 게시판 = 산악 5종 / 바람골 게시판 = 다리 구간 6종(+봉황령·화산 입구) / 천공 게시판(§4·§5) = 봉황령·화산 내부. 한 적이 두 게시판에 중복 노출되지 않게 카운트·해금으로 차별화.
- **레벨 곡선** — reqLv: 산기슭 18 / 협곡 20 / 운향 메인 22 / 운저 평원 28 / 잿빛 협로 34 / 봉황령 38~40 / 화산 52~55 — 기존 region.recommendedLevel 과 일치. 만렙 70 곡선상 화산~천공 구간 보상이 더 커야 함(§13 미결정).
- **연계 의뢰 양방향 잠금 주의** — `diola-marin-mountain-trade` 는 백운 D 단계(`mountain_trade_open`)가 선행. 그 전엔 디올라 마린이 이 의뢰를 언급조차 안 함(다이얼로그 게이트). 반대로 운향 게시판 `unhyang-board-supply-escort` 는 `diola-marin-mountain-trade` 완료가 선행 — 순서 꼬임 없음.
