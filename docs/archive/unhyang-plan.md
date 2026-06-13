# 운향(雲鄕) — 산정 도시 라인 추가 계획

> 상태: ✅ **구현 완료** — 운향(산정 도시) 라인 출고. 이 문서는 설계 기록.

옛 폐허에서 동쪽으로 이어지는 산악 루트 — **북풍 산기슭 → 운무 협곡 → 운향 마을** 3개 지역과 보스 1체, NPC 5명, 메인/사이드 퀘스트, 신규 재료 3종·장비 5종·제작서 5종을 추가하는 작업의 단일 출처 설계 문서.

> **원칙** — 마정석 라인(광맥의 수호자) 패턴을 그대로 한 단계 위로 끌어올린다. 정확한 시뮬 기반 stat 조정. 새 시스템·새 메커니즘은 도입하지 않음 (storyFlag·trial·recipe_one_of·phaseTrigger 모두 기존 사용 패턴).

---

## 1. 컨셉

| 항목 | 내용 |
|---|---|
| **테마** | 옛 폐허 너머 동쪽 — 구름이 발치에 깔리는 산악·고지대 |
| **무드** | 디올라가 안개 속 어촌이라면 운향은 **바람·돌·금속·고독**. 더 험준하고 인구도 적다 |
| **권장 진입 Lv** | 산기슭 18 / 협곡 20 / 운향 도시 22 |
| **선결 조건** | 옛 폐허 (ruins) 도달 — 즉 폐허 라인 (`stranger_ruins_guide` 플래그) 진행 후 |
| **콘텐츠 핵심** | 운봉의 거인 보스 → 운봉 무기 5종 (마정석 라인 다음 단계) |
| **반복 콘텐츠** | 일일 3회 보스 + 6시간 쿨다운 정기 토벌 의뢰 |

---

## 2. 맵 구조

### 2.1 지역 정의

`src/adventure/data/world.ts` `WORLD_MAP.regions` 에 추가:

```ts
{
  id: "highland",
  name: "북풍 산기슭",
  description: "폐허 동쪽으로 솟은 비탈. 바람이 거칠고 돌투성이라 발 디딜 곳을 골라야 한다.",
  position: { x: 880, y: 380 },
  biome: "plains",                 // 또는 신규 "mountain" — 4. 결정 보류 참조
  enemies: ["산양", "바위 두꺼비"],
  encounterWeights: { "산양": 60, "바위 두꺼비": 40 },
  recommendedLevel: 18,
},
{
  id: "canyon",
  name: "운무 협곡",
  description: "구름이 낮게 깔리는 좁은 협곡. 발소리가 메아리치고, 무언가 거대한 것이 안쪽을 막고 있다.",
  position: { x: 1080, y: 320 },
  biome: "ruins",                  // 또는 신규 "mountain"
  enemies: ["절벽 늑대", "돌풍 정령", "늑대 무리장"],
  encounterWeights: { "절벽 늑대": 50, "돌풍 정령": 35, "늑대 무리장": 15 },
  boss: { monsterName: "운봉의 거인", dailyEntryLimit: 3 },
  recommendedLevel: 20,
},
{
  id: "unhyang",
  name: "운향",
  description: "구름이 발치에 깔리는 산정의 작은 도시. 산악을 피해 모인 장인과 순례자들이 산다.",
  position: { x: 1280, y: 260 },
  biome: "village",
  enemies: [],
  tags: ["town"],
  recommendedLevel: 22,
},
```

> **viewBox 주의** — 현재 `viewBox.width = 800`. 옛 폐허(680, 400)에서 동쪽으로 3칸 (~200px 간격) 으로 산기슭(880) → 협곡(1080) → 운향(1280) 배치하므로 `viewBox.width = 1400` 으로 확장 필요. y 는 폐허 위도(400) 부근에서 살짝 위로 아치형(380→320→260) — "산을 오르는" 시각 효과. 기존 region 좌표는 그대로 유지.

### 2.2 엣지 (이동 조건)

`WORLD_MAP.edges` 에 추가:

```ts
{
  from: "ruins", to: "highland",
  requires: { kind: "trial", battles: 5, enemiesFrom: "highland" }, // 산기슭 적 5전 — Lv 9 → 18 점프 완충
},
{
  from: "highland", to: "canyon",
  requires: { kind: "trial", battles: 5, enemiesFrom: "canyon" }, // 협곡 적 5전 — 폐허 패턴과 동일
},
{
  from: "canyon", to: "unhyang",
  requires: {
    kind: "story",
    flagId: "peak_giant_defeated",
    reason: "운봉의 거인이 길목을 가로막아 더 갈 수 없다.",
  },
}, // 보스 처치 보상에서 set
```

### 2.3 진행 흐름

```
[ruins 도달] (stranger_ruins_guide 보유)
   ↓ trial 5전 (산기슭 적)
[highland] — Lv 18 첫 진입, 산양·두꺼비로 감 익힘
   ↓ trial 5전
[canyon] — Lv 20 본격, 늑대 무리장(15%) 등장으로 긴장감
   ↓ 일일 3회 보스 도전
[운봉의 거인 처치] → storyFlag set
   ↓
[unhyang] — Lv 22 도시 진입, NPC·상점·운봉 무기 제작 라인 해금
```

---

## 3. NPC 명단 (5명)

`src/adventure/data/npcs.ts` `NpcId` 타입과 `NPCS` 배열에 추가.

| ID | 이름 | role | 한 줄 설명 | 핵심 역할 |
|---|---|---|---|---|
| `unhyang_elder` | 노촌장 백운 | elder | 구름 위 도시를 지켜온 노인. 거인의 위협을 가장 먼저 감지했다. | **메인 라인 trigger / 정기 토벌 의뢰** |
| `unhyang_smith` | 대장장이 만월 | vendor | 운봉석을 다루는 솜씨가 일품인 늙은 장인. 운봉 무기 제작 안내. | **운봉 무기 제작 힌트, 첫 제작 후 일상 대화** |
| `unhyang_guide` | 산악 가이드 도연 | quest | 협곡과 그 너머를 누벼본 젊은 안내인. 무리장 사냥 의뢰. | **사이드 kill 퀘스트** |
| `unhyang_herbalist` | 약초꾼 산하 | lore | 산에서만 나는 약초를 찾아다닌다. 회복약·재료 거래. | **사이드 deliver 퀘스트, 포션 한도 +1 보상** |
| `unhyang_pilgrim` | 순례자 미상 | stranger | 북쪽 더 깊은 곳에서 왔다고 한다. 말을 아낀다. | **다음 지역 확장 떡밥 (콘텐츠 보류)** |

### 3.1 초상화 파일

`public/images/npc/` 에 webp 5장:
- `baekun.webp` (백운)
- `manwol.webp` (만월)
- `doyeon.webp` (도연)
- `sanha.webp` (산하)
- `pilgrim.webp` (순례자)

> **컨벤션** (AGENTS.md): NPC 파일명 = short-name. 한글 이름은 영문 short-name으로 매핑 — `Npc.portrait`에 명시. `check-images` 스크립트가 검증.

### 3.2 NPC별 대화/퀘스트 매핑

각 NPC 별 `dialogues/{Name}Dialogue.tsx` 신설 (디올라 패턴 그대로):

| NPC | 분기 단계 | storyFlag / 퀘스트 |
|---|---|---|
| 백운 (elder) | 5단계 | `unhyang_elder_intro` → `unhyang_giant_quest_accepted` → 진행 → 거인 토벌 → `peak_giant_defeated` (보스 처치 시 자동 set) → 정기 토벌 게시 |
| 만월 (vendor) | 3단계 | 운봉 무기 미제작 → 운봉 무기 첫 제작 후 → 거인 팔찌까지 모두 제작 후 |
| 도연 (quest) | 3단계 (수주/진행/완료) | `unhyang-doyeon-wolves` (kill 절벽 늑대 ×10) |
| 산하 (lore) | 3단계 | `unhyang-sanha-herbs` (deliver 산초꽃 ×8) |
| 순례자 (stranger) | greeting only | (확장용 placeholder) |

### 3.3 AdventureScreen.tsx 등록

`renderNpcDialogue` 분기에 5개 NPC 추가:

```tsx
if (npc.id === "unhyang_elder") {
  return <BaekunDialogue npc={npc} onClose={close} storyFlags={storyFlags} quests={quests} />;
}
// ... 4개 더
```

---

## 4. 퀘스트 라인

`src/adventure/data/quests.ts` `QUESTS` 배열에 추가.

### 4.1 메인 라인 (백운 — 거인 봉인)

| ID | regionId | giverNpcId | 종류 | 목표 | 보상 | 비고 |
|---|---|---|---|---|---|---|
| `unhyang-baekun-giant` | unhyang | unhyang_elder | kill | "운봉의 거인" ×1 | gold 400, fame 25, exp 800 | **첫 처치 시 `peak_giant_defeated` storyFlag 발급** |
| `unhyang-baekun-recurring` | unhyang | unhyang_elder | kill | "운봉의 거인" ×3 | gold 350, fame 12, exp 450 | repeatable, `requiresQuestCompleted: "unhyang-baekun-giant"`, 6h 쿨다운 |

### 4.2 사이드 (도연 — 늑대 사냥)

| ID | regionId | giverNpcId | 종류 | 목표 | 보상 |
|---|---|---|---|---|---|
| `unhyang-doyeon-wolves` | unhyang | unhyang_guide | kill | "절벽 늑대" ×10 | gold 120, fame 6, exp 200, repeatable 6h |

### 4.3 사이드 (산하 — 약초 수집)

| ID | regionId | giverNpcId | 종류 | 목표 | 보상 |
|---|---|---|---|---|---|
| `unhyang-sanha-herbs` | unhyang | unhyang_herbalist | deliver | `sancho_blossom` ×8 | gold 100, exp 150, **포션 한도 +1**, repeatable 12h |
| `unhyang-sanha-bones` | unhyang | unhyang_herbalist | deliver | `giant_scale` ×5 | gold 200, exp 250, 회복약 ×3 |

### 4.4 메인 라인 분기 시각화

```
운향 첫 진입 (peak_giant_defeated 발급된 후)
  → 백운: "거인은 잠재웠지만 그가 단 하나가 아닐 게요" (정기 토벌 unlock)
  → 만월: 운봉 무기 제작 안내 ("거인 뼛조각이면 무엇이든 만들어 드리지")
  → 도연: 절벽 늑대 의뢰 (산악 보호)
  → 산하: 약초 의뢰 (탐험 동기)

이 모두 자유 진행 — 메인 라인은 정기 토벌 1줄, 나머지 사이드 자유.
```

---

## 5. 신규 재료 (3종)

`src/adventure/data/materials.ts`:

| ID | 이름 | 가격 | 상점 | 주 획득처 | 설명 |
|---|---|---|---|---|---|
| `giant_scale` | 거인 비늘 | 28 G | NO | 운봉의 거인 보스 (확정 ×3) / 늑대 무리장 (8%) | 운봉의 거인이 떨군 회청색 비늘. 단단하면서도 가볍다. |
| `unbong_ore` | 운봉석 | 32 G | NO | 운봉의 거인 보스 (확정 ×2) / 바위 두꺼비 (4%) | 협곡 깊숙한 광맥에서만 캐낼 수 있는 반짝이는 광석. |
| `sancho_blossom` | 산초꽃 | 14 G | NO | 산양 (8%) / 절벽 늑대 (3%) | 산기슭에서만 피는 작고 매운 꽃. 약초로 쓴다. |

> **MaterialId 타입 자동 갱신** — 컴파일러가 다른 곳 참조 누락을 잡아준다.

---

## 6. 신규 장비 (5종) — 운봉 무기 라인

`src/adventure/data/items.ts`. 마정석 라인의 한 단계 상위 — atk +8 공통 + 보조 스탯 +4.

### 6.1 무기 4종 + 장신구 1종

| ID | 이름 | slot | bonus | description |
|---|---|---|---|---|
| `peak_sword` | 운봉 대검 | weapon | atk +8, str +4 | 운봉의 거인 뼛조각으로 단련한 한손 대검. 무게가 손에 그대로 실린다. |
| `peak_shield` | 운봉 방벽 | weapon | atk +8, vit +4 | 거인의 비늘을 그대로 두른 방패형 무기. 막으며 쳐낸다. |
| `peak_spear` | 운봉 장창 | weapon | atk +8, dex +4 | 운봉석 끝을 깎아 박은 긴 창. 멀리서도 정확하다. |
| `peak_claw` | 운봉 발톱 | weapon | atk +8, luk +4 | 거인의 손가락뼈를 갈아 만든 발톱형 너클. 한 방 한 방이 운에 맡겨진다. |
| `peak_mantle` | 운봉 견갑 | accessory | vit +4, spd +3 | 운봉의 거인 어깨 비늘을 깎아 만든 견갑. 두르면 우직해지면서 발이 가벼워진다. |

> **마정석 대비 패턴** — atk +7 → +8, 보조 +3 → +4. accessory도 vit +3/spd +2 → vit +4/spd +3 로 한 단계.

### 6.2 description 톤

운봉 라인은 **거인·뼈·비늘·돌**의 무게감을 강조. 마정석 라인이 "묘하게 정확/가볍다" 같은 마법성에 기댔다면, 운봉은 "두 손에 묵직" 같은 물리적 묵직함.

---

## 7. 신규 제작서 (5종)

`src/adventure/data/recipes.ts`. 마정석 패턴 그대로.

| ID | 결과 | 재료 | 비고 |
|---|---|---|---|
| `peak_sword` | 운봉 대검 | 거인 비늘 ×2 + 운봉석 ×3 + 단단한 수정 ×5 | weapon |
| `peak_shield` | 운봉 방벽 | 거인 비늘 ×2 + 운봉석 ×3 + 단단한 수정 ×5 | weapon |
| `peak_spear` | 운봉 장창 | 거인 비늘 ×2 + 운봉석 ×3 + 단단한 수정 ×5 | weapon |
| `peak_claw` | 운봉 발톱 | 거인 비늘 ×2 + 운봉석 ×3 + 단단한 수정 ×5 | weapon |
| `peak_mantle` | 운봉 견갑 | 거인 비늘 ×3 + 운봉석 ×2 | accessory |

> **재료 비용 패턴** — 마정석 라인(마정석 ×2 + 단단한 수정 ×5) 대비 신규 ×5 + 기존 ×5 → 한 단계 깊은 재료 의존성. 단단한 수정은 **호환재**로 그대로 둬서 동굴이 다시 의미 있게 됨 (역설계 동기 강화).

---

## 8. 몬스터 (잡몹 5종 + 보스 1체)

`src/adventure/data/monsters.ts`.

### 8.1 잡몹

| 이름 | 지역 | tags | hp | atk | def | spd | 특수 | exp | 드랍 |
|---|---|---|---|---|---|---|---|---|---|
| 산양 | highland | beast | **180** | **22** | **7** | 5 | — | 24 | sancho_blossom 8%, wilddog_hide 5% |
| 바위 두꺼비 | highland | beast | **240** | **19** | **12** | 3 | — | 28 | unbong_ore 4%, hard_crystal 5% |
| 절벽 늑대 | canyon | beast | **280** | **25** | **9** | 7 | — | 32 | wilddog_fang 5%, sancho_blossom 3% |
| 돌풍 정령 | canyon | spirit | **220** | **24** | **9** | 8 | 회피 20% | 35 | fairy_dust 4% |
| 늑대 무리장 | canyon | beast | **280** | **25** | **12** | 8 | encounter weight 15% | 50 | wilddog_fang ×2 8%, giant_scale 8%, wraith_cloak 0.5% |

### 8.2 보스

```ts
"운봉의 거인": {
  name: "운봉의 거인",
  tags: ["golem"],   // 또는 신규 "giant" 태그 — 결정 보류
  image: "/images/monster/peakgiant.webp",  // 신규
  hp: 420,
  atk: 25,
  def: 14,
  spd: 4,
  exp: 200,
  drops: [
    { kind: "material", materialId: "giant_scale", chance: 1, amount: 3 },
    { kind: "material", materialId: "unbong_ore", chance: 1, amount: 2 },
    {
      kind: "recipe_one_of",
      recipeIds: ["peak_sword", "peak_shield", "peak_spear", "peak_claw"],
      chance: 1,
    },
    { kind: "recipe", recipeId: "peak_mantle", chance: 0.15 },
  ],
  phaseTrigger: {
    hpFraction: 0.4,
    defBonus: 3,
    message: "거인이 두 발을 단단히 박아 넣는다.",
  },
},
```

> **광맥의 수호자 대비** — hp 380→420, atk 18→25, def 10→14, exp 60→200. 페이즈 hpFraction 0.3→0.4 (더 일찍 단단해짐), defBonus +4→+3 (페이즈 후 데미지 1로 추락하는 걸 방지).

---

## 9. 밸런스 시뮬레이션

### 9.1 가정 — Lv 22 표준 빌드

`baseCharacter` + 21 stat point 분배 (str/vit 위주 전사형) + 권장 장비:

| 항목 | 값 | 산식 |
|---|---|---|
| str | **15** | base 3 + 분배 9 + 마정석 검 +3 |
| dex | **6** | base 3 + 분배 3 |
| vit | **13** | base 3 + 분배 7 + 마정석 팔찌 +3 |
| spd | **2** | base 3 + 분배 0 + 마정석 팔찌 +2 + 골렘갑주 -3 |
| luk | **4** | base 3 + 분배 2 + 골렘갑주 -1 |
| **ATK** | **23** | str 15 + floor(dex 6/5) + 마정석 검 +7 = 15+1+7 |
| **DEF** | **20** | vit 13 + 골렘갑주 +7 |
| **HP** | **178** | 47 + 21×5 + vit 13×2 = 47+105+26 |
| 추가 공격 | 5% | spd 2 × 2.5 |
| 강공격 | 활성 | str 15 ≥ 10 → 3턴마다 atk +2 |
| 분쇄 | 비활성 | str 15 < 20 |
| 크리티컬 확률 | 2% | luk 4 × 0.5 |

> 실제 플레이어는 dex/spd/luk 비중을 더 줄 수도 있지만, 가장 보수적인 "탱-딜러" 빌드 기준.

### 9.2 데미지 모델

- 일반 공격 dmg = `max(1, ATK - 적 def)`
- 강공격 dmg (3턴마다 첫 공격) = `max(1, ATK + 2 - 적 def)`
- **평균 dmg/턴 ≈ 일반 × 2/3 + 강공격 × 1/3** (추가 공격은 5%만 가산되므로 노이즈 수준에서 무시)

### 9.3 잡몹 시뮬

| 몬스터 | dmg/턴 (받) | dmg/턴 (가) | 처치 턴수 | 누적 받는 dmg | 평가 |
|---|---|---|---|---|---|
| 산양 (hp 180/atk 22/def 7) | 2 | 16 / 18 → 16.7 | **11** | 22 | 입문 잡몹 — 약간 단조롭지만 빠름 |
| 바위 두꺼비 (240/19/12) | 1 | 11 / 13 → 11.7 | **21** | 21 | 단단·느림 — 무서움보다 시간 |
| 절벽 늑대 (280/25/9) | 5 | 14 / 16 → 14.7 | **19** | 95 | **본격 위험** — 회복 의식 |
| 돌풍 정령 (220/24/9 회피20%) | 4 | 14.7 × 0.8 → 11.8 | **19** | 76 | 회피 변수 — 운 나쁘면 28턴 |
| 늑대 무리장 (280/25/12) | 5 | 11 / 13 → 11.7 | **24** | 120 | **엘리트 — hp 178 중 67% 소모, 1마리당 회복 1번** |

### 9.4 보스 시뮬 — 운봉의 거인 (hp 420 / atk 25 / def 14, 페이즈 0.4 → def 17)

| 구간 | dmg/턴 (받) | dmg/턴 (가) | 턴수 | 받는 누적 | 비고 |
|---|---|---|---|---|---|
| 페이즈 전 (hp 420 → 168) | 5 | 9 / 11 → 9.7 | **27** | 135 | hp 252 깎는 동안 |
| 페이즈 후 (hp 168 → 0) | 5 | 6 / 8 → 6.7 | **25** | 125 | def +3 발동 후 |
| **총** | — | — | **52** | **260** | — |

**플레이어 생존성:**
- 시작 hp 178 → 누적 받는 260 → **포션 4개** 필요 (포션 1개 +20 hp 가정)
- 포션 한도 10 + 산하 의뢰로 +1 = 11 → **여유 있음**
- **첫 클리어 가능** — 빠듯하지만 회복 운영하면 Lv 22 standard 빌드로 가능
- 장비가 **마정석 셋** 일부만 갖춘 Lv 22 (예: 마정석 무기 1종 + 골렘갑주만, 팔찌 없음) 인 경우 hp 152 시작 → 포션 6개 → 빠듯 → **2~3회차 도전에서 클리어**

### 9.5 일일 도전 사이클

`dailyEntryLimit: 3` 기준:

| 회차 | 시작 hp | 회복 자원 | 결과 |
|---|---|---|---|
| 1회차 | 풀 | 포션 8개 | 클리어 (포션 4 소비, hp 0~50 마무리) |
| 2회차 | 풀 회복 후 풀 | 포션 4개 | 빠듯 — 페이즈 후 사망 가능성 |
| 3회차 | 풀 회복 후 풀 | 포션 0~2개 | 회복 의존 — 사망 위험 |

→ **하루 1회 안정 클리어, 2~3회차는 도박**. 광맥의 수호자 대비 한 단계 더 빡빡한 도전감.

### 9.6 비교: 광맥의 수호자 vs 운봉의 거인

| 항목 | 광맥의 수호자 | 운봉의 거인 |
|---|---|---|
| 권장 진입 Lv | 6 (사실상 12+) | 22 |
| hp | 380 | 420 (+11%) |
| atk | 18 | 25 (+39%) |
| def | 10 → 14 (+4) | 14 → 17 (+3) |
| 페이즈 트리거 | hp 30% | hp 40% |
| exp | 60 | 200 (+233%) |
| 1회 클리어 평균 턴수 | ~30~40 (마정석 무기 + 일부 장비) | ~52 (Lv 22 풀빌드) |
| 일일 클리어 기대치 | 1.5~2회 | 1회 |

→ **체감 난이도 한 단계 위로 안착**. exp 보상이 큰 폭으로 올라 3회 클리어 시 상당한 레벨 진척.

---

## 10. 도시 시설 (운향)

기존 `TownScreen.tsx` 가 `tags: ["town"]` 만으로 자동 시설 6종 (치료소·상점·훈련장·신전·대장간·길드) 노출 → **별도 작업 없이 자동 활성화**.

운향 특화 요소:

| 시설 | 운향 차별점 |
|---|---|
| 치료소 | 비용 동일 (1G/50G 기준) |
| 상점 | 신규 재료 (산초꽃 등) 일부 입고 — 보로/메르 패턴 따라 도감 완성도 잠금 |
| 훈련장 | 동일 — 단련 포인트 |
| 성장의 신전 | 동일 — 능력치 분배 |
| 대장간 | **운봉 무기 5종 제작 가능** (제작서 학습 후) |
| 모험가 길드 | 운향 region 의 kill 퀘스트만 게시 — 백운 정기 토벌 + 도연 늑대 |

---

## 11. 스토리 플래그 (신규 4종)

`src/adventure/storyFlags/` 는 단순 string 배열이므로 ID만 정의하면 됨.

| 상수 | 발급 위치 | 용도 |
|---|---|---|
| `unhyang_elder_intro` | BaekunDialogue 첫 인사 | 노촌장 첫 만남 표식 (분기 깊이) |
| `unhyang_giant_quest_accepted` | BaekunDialogue 의뢰 수락 | 메인 라인 진행 추적 |
| `peak_giant_defeated` | **보스 처치 처리부 (`onBattleEnd`)** | 운향 도시 진입 해금 (edge story flag) |
| `peak_weapon_first_crafted` | 첫 운봉 무기 제작 시 | 만월 대화 분기 |

> **보스 처치 시 자동 set** 메커니즘은 신규 — 광맥의 수호자에는 없음. `src/adventure/battle/onBattleEnd.ts` 에 `if (enemyName === "운봉의 거인") storyFlags.set("peak_giant_defeated")` 한 줄 추가 정도면 충분. 광맥의 수호자에도 같은 패턴 적용 가능 (별 라인).

---

## 12. docs/items.md 갱신

신규 8개 행 추가 (메모리 컨벤션 준수):

### 12.1 무기 섹션 추가

```md
| 운봉 대검 | 공격력 +8, 힘 +4 | 운봉의 거인 뼛조각으로 단련한 한손 대검. (제작서: 운봉의 거인 25%, 4종 중 1) |
| 운봉 방벽 | 공격력 +8, 활력 +4 | 거인의 비늘을 두른 방패형 무기. (제작서: 운봉의 거인 25%, 4종 중 1) |
| 운봉 장창 | 공격력 +8, 민첩 +4 | 운봉석 끝을 깎아 박은 긴 창. (제작서: 운봉의 거인 25%, 4종 중 1) |
| 운봉 발톱 | 공격력 +8, 행운 +4 | 거인의 손가락뼈를 갈아 만든 너클. (제작서: 운봉의 거인 25%, 4종 중 1) |
```

### 12.2 장신구 섹션 추가

```md
| 운봉 견갑 | 활력 +4, 속도 +3 | 운봉의 거인 어깨 비늘을 깎아 만든 견갑. (제작서: 운봉의 거인 15%) |
```

### 12.3 재료 섹션 추가

```md
| 거인 비늘 | 28 G | 운봉의 거인(100%, ×3) / 늑대 무리장(8%) | 운봉의 거인이 떨군 회청색 비늘. 단단하면서도 가볍다. |
| 운봉석 | 32 G | 운봉의 거인(100%, ×2) / 바위 두꺼비(4%) | 협곡 깊숙한 광맥의 반짝이는 광석. |
| 산초꽃 | 14 G | 산양(8%) / 절벽 늑대(3%) | 산기슭에서만 피는 작고 매운 꽃. 약초로 쓴다. |
```

---

## 13. 구현 체크리스트

### 13.1 데이터 파일 (수정 5)

- [ ] `src/adventure/data/world.ts` — RegionId +3, regions +3, edges +3
- [ ] `src/adventure/data/monsters.ts` — 잡몹 5 + 보스 1 추가
- [ ] `src/adventure/data/materials.ts` — 재료 3 추가
- [ ] `src/adventure/data/items.ts` — 장비 5 추가
- [ ] `src/adventure/data/recipes.ts` — 제작서 5 추가
- [ ] `src/adventure/data/quests.ts` — 퀘스트 5 추가 (메인 2 + 사이드 3)
- [ ] `src/adventure/data/npcs.ts` — NpcId +5, NPCS +5

### 13.2 대화 컴포넌트 (신규 5)

- [ ] `src/adventure/town/dialogues/BaekunDialogue.tsx` — 5단계 분기
- [ ] `src/adventure/town/dialogues/ManwolDialogue.tsx` — 3단계
- [ ] `src/adventure/town/dialogues/DoyeonDialogue.tsx` — kill 퀘스트 패턴 (디올라 도연 NPC 패턴 follow)
- [ ] `src/adventure/town/dialogues/SanhaDialogue.tsx` — deliver 패턴 (NoraDialogue 참고)
- [ ] `src/adventure/town/dialogues/PilgrimDialogue.tsx` — greeting only

### 13.3 라우팅 (수정 1)

- [ ] `src/adventure/AdventureScreen.tsx` `renderNpcDialogue` — 5개 NPC 분기 추가

### 13.4 보스 처치 훅 (수정 1)

- [ ] `src/adventure/battle/onBattleEnd.ts` — 운봉의 거인 처치 시 `peak_giant_defeated` storyFlag set

### 13.5 이미지 (신규)

- [ ] `public/images/npc/baekun.webp` × 5장 (NPC 초상화)
- [ ] `public/images/monster/peakgiant.webp` (보스)
- [ ] `public/images/monster/{mountaingoat,toad,cliffwolf,galewisp,alphawolf}.webp` (잡몹 5)
- [ ] `public/images/ui/{highland,canyon,unhyang}.webp` (region 배경 — `RegionBackground` 자동 매핑)

> 새 이미지는 `npm run dev` 시 `optimize-images` + `check-images` 가 자동 처리/검증.

### 13.6 도감

- [ ] `docs/items.md` — 무기 4 + 장신구 1 + 재료 3 행 추가

### 13.7 테스트 (선택)

- [ ] `src/adventure/battle/engine.test.ts` 에 운봉의 거인 시뮬 테스트 1~2건 — 페이즈 발동 확인, atk/def 모순 없음 등
- [ ] (있다면) offlineSim 으로 일일 3회 도전 시뮬 — 평균 클리어 회수 검증

---

## 14. 결정 보류 항목

| # | 항목 | 옵션 A | 옵션 B | 추천 |
|---|---|---|---|---|
| 1 | biome | 기존 `plains`/`ruins` 재활용 | 신규 `mountain` (Biome 타입 +1, MapNode 색 2개, 이미지 4장 추가) | **B** — 산악 무드는 시각적으로 구분 필요 |
| 2 | viewBox 확장 | 그대로 우겨넣기 (x 880/1080/1280 인데 800 width 면 잘림) | width 800→1400, 기존 region 좌표 그대로 | **B** — 폐허 동쪽 3칸 배치라 width 확장 필수 |
| 3 | 거인 태그 | 기존 `golem` 재활용 | 신규 `"giant"` 태그 추가 | **A** — golem 도감 통계 그대로, 추가 분류 필요 시 나중에 |
| 4 | 운봉 무기 atk | +8 (마정석 +1) | +9 (분명한 한 단계 차이) | **A** — 곡선이 너무 가파르면 후속 지역 설계 막힘 |
| 5 | 보스 보상 비율 | 무기 25% × 4 + 견갑 15% (마정석 동일) | 무기 20% × 4 + 견갑 20% | **A** — 검증된 패턴 |
| 6 | 진입 trial 수 | 5전 (폐허 동일) | 7전 (Lv 차이 반영) | **A** — 일관성, 자칫 답답함 |
| 7 | 정기 토벌 보상 | gold 350 / fame 12 / exp 450 | 더 높이 (gold 500 / exp 700) | **A** — exp 200 × 3 = 600 + 보상 → 합 1050. 적당 |
| 8 | 산하 약초 의뢰 보너스 | 포션 한도 +1 (1회만) | 골드만 | **A** — 보스 도전 회복 자원 확보 동기 |
| 9 | 순례자 NPC 콘텐츠 | greeting + 떡밥 한 줄 | 통째로 다음 PR로 | **A** — 가벼운 떡밥은 분위기 |
| 10 | 운봉 대검 등 4종 description 통일성 | 마정석처럼 기능 중심 ("힘이 손에") | 거인 lore 중심 ("거인이 떨군 ~") | **혼합** — 기능 1줄 + lore 1줄 |

---

## 15. 작업 순서 제안

분할 PR 권장 (각 단계 독립 동작):

1. **PR #1 — 지역·잡몹·재료·이미지 (콘텐츠 토대)**
   - world.ts / monsters.ts / materials.ts + 잡몹 이미지 5장 + region 배경 3장
   - 마을 NPC 0명이라도 town 시설 자동 노출됨 → 진입 가능 상태로 일단 완성
   - **biome·viewBox 결정 여기서**
2. **PR #2 — 보스 + 장비/제작서 라인**
   - 운봉의 거인 + 5종 장비 + 5종 제작서 + storyFlag 발급 훅 + items.md
3. **PR #3 — 운향 NPC + 퀘스트 라인**
   - npcs.ts + 5개 Dialogue + quests.ts + AdventureScreen 라우팅 + NPC 초상화 5장
4. **PR #4 (선택) — 시뮬 테스트 + 문서 정리**
   - engine.test.ts 보스 시뮬 + content-roadmap.md 갱신

각 PR 종료 시 게임 그대로 동작 — 중간 머지 안전.

---

## 16. 컨텐츠 확장 여지

운향이 종착점이 아니라 **다음 컨텐츠 도약대**가 되도록 남겨둔 훅:

- 순례자 미상 NPC → 운향 너머 (북방 폐허·고원 등) 떡밥
- 운봉석 / 거인 비늘이 호환재로 남아 차차차 지역에서 새 무기 제작에 재활용 가능
- 정기 토벌이 운봉의 거인 단일이라 단조로움 — 후속에 "운봉의 분신" 같은 변종 추가 여지
- 운향 도시 자체에 **거인 봉인의 비밀** 라인 → 별도 메인 퀘스트 시리즈로 확장 가능

---

## 17. 참고 — 기존 시스템 패턴 출처

이 계획은 다음 기존 패턴을 그대로 따른 것:

| 패턴 | 출처 |
|---|---|
| 보스 region 정의 + dailyEntryLimit | `world.ts` deep_cave |
| 보스 보상 recipe_one_of + 페이즈 트리거 | `monsters.ts` 광맥의 수호자 |
| 무기 4종 라인 + 액세서리 1종 | `items.ts` 마정석 라인 |
| 제작서 재료 비용 (보스 재료 ×N + 호환재 ×N) | `recipes.ts` mana_sword 등 |
| 정기 토벌 의뢰 (kill 보스 ×3, 6h 쿨다운) | `quests.ts` village-deep-cave-recurring |
| 마을 진입 storyFlag + edge requires | `world.ts` cave→deep_cave (jimmy_deep_cave_quest) |
| NPC 5명 내외 마을 + dialogue 컴포넌트 | `town/dialogues/*` 디올라 라인 |
| trial edge (적 5전) | `world.ts` plains→cave 등 |
| docs/items.md 동시 갱신 | 메모리 (feedback_items_doc) |
