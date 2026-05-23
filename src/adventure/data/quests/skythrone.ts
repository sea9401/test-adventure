import type { Quest } from "./types";

export const SKYTHRONE_QUESTS: Quest[] = [
  // ── 천공 성지, 메인 라인 "능선 너머의 봉인" (원로 해무) ─────────────────
  // 화산의 심장 처치(volcano_heart_defeated, 천공 성지 진입 조건) 후 만나는 라인.
  // 봉황 무구 갑옷·액세서리 확정 제작서 + 성지 "또 다른 봉인" 서사. HaemuDialogue.
  {
    id: "skyreach-haemu-lava-core",
    regionId: "skyreach",
    title: "봉인의 자물쇠",
    description:
      "이 성지에는 화산의 심장 말고도 잠재워 둔 것이 있소. 그 봉인이 아래에서 올라오는 열기에 무뎌졌소. 용암 핵 여섯 개면 자물쇠를 다시 채울 수 있소. 가져다 주면, 봉황 무구를 벼리는 법도 자네 손에 새겨 주리다.",
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
    id: "skyreach-haemu-weapons",
    regionId: "skyreach",
    title: "봉황 네 자루",
    description:
      "봉인이 채워졌으니. 이제 네 손에 무기를 쥐어 줄 차례요. 봉황 깃털 여덟 장이면, 봉황도·봉황패·봉황극·봉황조, 네 자루 전부 벼리는 법을 자네 손에 새겨 주리다. 손에 맞는 걸 골라 쓰시오.",
    requiredLevel: 55,
    target: { kind: "deliver", materialId: "phoenix_feather", count: 8 },
    reward: { gold: 2500, exp: 3500, recipes: ["volcano_sword", "volcano_shield", "volcano_spear", "volcano_claw"] },
    repeatable: false,
    giverNpcId: "skyreach_elder",
    requiresQuestCompleted: "skyreach-haemu-flame-scale",
  },
  {
    id: "skyreach-volcano-heart-recurring",
    regionId: "skyreach",
    title: "화산의 심장 토벌 ─ 정기",
    description:
      "화산의 심장은 다시 달아오릅니다. 세 번 잠재우면 한동안은 성지 아래가 잠잠할 거예요. 동료를 데려가세요.",
    requiredLevel: 55,
    target: { kind: "kill", monsterName: "화산의 심장", count: 3 },
    reward: { gold: 1500, fame: 30, exp: 3000 },
    repeatable: true,
    requiresQuestCompleted: "skyreach-haemu-lava-core",
  },
  // ── 천공 성지 ────────────────────────────────────────────────────────────
  {
    id: "skyreach-guide-knights",
    regionId: "skyreach",
    title: "봉황령 기사 소탕",
    description:
      "봉황령에 모여든 산악 기사들이 성지 순례자들의 발목을 잡고 있어. 20명만 정리해 줘.",
    requiredLevel: 40,
    target: { kind: "kill", monsterName: "산악 기사", count: 20 },
    reward: { gold: 900, fame: 28, exp: 1500 },
    repeatable: false,
    giverNpcId: "skyreach_guide",
  },
  {
    id: "skyreach-alchemist-lava-core",
    regionId: "skyreach",
    title: "용암 핵 다섯",
    description:
      "화산 두꺼비나 불꽃 골렘을 잡으면 가끔 용암 핵이 나와. 5개만 모아다 주면 포션 보유량을 늘려줄게.",
    requiredLevel: 55,
    target: { kind: "deliver", materialId: "lava_core", count: 5 },
    reward: {
      gold: 1200,
      exp: 2900,
      potionCapacityBonus: 1,
    },
    repeatable: false,
    giverNpcId: "skyreach_alchemist",
  },
  // 천공 성지 길드 게시판, 화산 지대 정기 의뢰 (화산의 심장 처치 후 노출).
  {
    id: "skyreach-flame-golems",
    regionId: "skyreach",
    title: "불꽃 골렘 감시",
    description:
      "화산의 심장이 잠들어도 불꽃 골렘들은 여전해요. 30체를 부숴 주세요.",
    requiredLevel: 55,
    target: { kind: "kill", monsterName: "불꽃 골렘", count: 30 },
    reward: { gold: 1000, fame: 26, exp: 2900 },
    repeatable: true,
    requiresQuestCompleted: "windvale-volcano-boss",
  },

  // ════════════════════════════════════════════════════════════════════════
  // 다리 구간 / 봉황령 / 화산, 사이드 의뢰 + 게시판 (§3.1 §3.3 §4 §5)
  // ════════════════════════════════════════════════════════════════════════

  // ── 바람골 역참, NPC 전속 사이드 (마로 / 노을 / 한솔) ───────────────────
  {
    id: "windvale-merchant-escort-raiders",
    regionId: "windvale",
    title: "짐수레를 노리는 자들",
    description:
      "내 짐수레를 노리는 약탈자 놈들 좀 떼어내 줘. 열둘이면 한동안은 길이 조용하지.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "떠돌이 약탈자", count: 12 },
    reward: { gold: 400, fame: 16, exp: 650 },
    repeatable: false,
    giverNpcId: "windvale_merchant",
  },
  {
    id: "windvale-merchant-escort-hawks",
    regionId: "windvale",
    title: "초원 매 쫓아내기",
    description:
      "초원 매가 자꾸 짐 위로 내리꽂혀서 깃털이 모이질 않아. 열 마리만 쫓아 주면 길에서 주운 좋은 걸 나눠 드리지.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "초원 매", count: 10 },
    reward: { gold: 380, exp: 600, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "windvale_merchant",
  },
  {
    id: "windvale-merchant-ash-stone",
    regionId: "windvale",
    title: "잿돌 여덟 덩이",
    description:
      "잿돌이 세공 받침에 그만이거든. 여덟 덩이만 모아다 줘. 잿빛 협로 골렘이 가끔 떨군다더라.",
    requiredLevel: 34,
    target: { kind: "deliver", materialId: "ash_stone", count: 8 },
    reward: { gold: 550, exp: 700 },
    repeatable: false,
    giverNpcId: "windvale_merchant",
  },
  {
    id: "windvale-pathfinder-ridge-scout",
    regionId: "windvale",
    title: "봉황령 첫 발: 능선 정찰",
    description:
      "잿빛 협로를 넘으면 봉황령이야. 거기 불꽃 독수리가 능선을 빙빙 돌아. 열둘만 떨어뜨려 주면 첫 발 디딜 데가 생겨.",
    requiredLevel: 38,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 12 },
    reward: { gold: 750, fame: 24, exp: 1100 },
    repeatable: false,
    giverNpcId: "windvale_pathfinder",
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },

  // ── 바람골 역참 길드 게시판 (잿빛 협로 + 봉황령·화산 입구 다리 구간) ──
  // 운저 평원 정기 의뢰는 운향 게시판으로 이관(아래쪽).
  // 화산 지대 정기 의뢰는 천공 성지 게시판으로 이관(아래쪽).
  {
    id: "windvale-board-ash-golems",
    regionId: "windvale",
    title: "잿빛 협로: 재먼지 골렘 정리",
    description: "잿빛 협로를 재먼지 골렘이 메우고 있습니다. 30체를 정리해 주세요.",
    requiredLevel: 34,
    target: { kind: "kill", monsterName: "재먼지 골렘", count: 30 },
    reward: { gold: 520, fame: 18, exp: 850 },
    repeatable: true,
  },
  {
    id: "windvale-board-ash-salamanders",
    regionId: "windvale",
    title: "잿빛 협로: 불씨 도롱뇽 진화",
    description: "잿빛 협로에 불씨 도롱뇽이 들끓습니다. 35마리를 진화해 주세요.",
    requiredLevel: 34,
    target: { kind: "kill", monsterName: "불씨 도롱뇽", count: 35 },
    reward: { gold: 480, fame: 17, exp: 800 },
    repeatable: true,
  },
  {
    id: "windvale-board-ash-golems-large",
    regionId: "windvale",
    title: "잿빛 협로: 재먼지 골렘 대규모 정리",
    description: "재먼지 골렘이 협로 전체를 막았습니다. 60체를 정리해 주세요.",
    requiredLevel: 35,
    target: { kind: "kill", monsterName: "재먼지 골렘", count: 60 },
    reward: { gold: 980, fame: 28, exp: 1600 },
    repeatable: true,
  },
  {
    id: "windvale-board-ridge-eagles",
    regionId: "windvale",
    title: "봉황령 입구: 능선 길 확보",
    description: "봉황령 능선에 불꽃 독수리가 들끓습니다. 30마리를 떨어뜨려 길을 확보해 주세요.",
    requiredLevel: 38,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 30 },
    reward: { gold: 700, fame: 22, exp: 1300 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },
  {
    id: "windvale-board-volcano-toads",
    regionId: "skyreach",
    title: "화산 입구: 화산 두꺼비 구제",
    description: "화산 지대 어귀에 화산 두꺼비가 들끓습니다. 30마리를 구제해 주세요.",
    requiredLevel: 52,
    target: { kind: "kill", monsterName: "화산 두꺼비", count: 30 },
    reward: { gold: 850, fame: 22, exp: 2400 },
    repeatable: true,
    requiresQuestCompleted: "windvale-volcano-boss",
  },

  // ── 봉황령, 사이드 의뢰 (운향 도연/산하 · 천공 검/시온 출처) ─────────────
  {
    id: "unhyang-guide-flame-lizards",
    regionId: "unhyang",
    title: "봉황령의 화염 도마뱀",
    description:
      "봉황령 능선 바위틈에 화염 도마뱀이 들끓어. 15마리만 정리해 주면 길이 좀 트일 거야.",
    requiredLevel: 38,
    target: { kind: "kill", monsterName: "화염 도마뱀", count: 15 },
    reward: { gold: 800, fame: 26, exp: 1200 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  {
    id: "skyreach-guide-phoenix-eagles",
    regionId: "skyreach",
    title: "봉황령: 불꽃 독수리 솎아내기",
    description:
      "봉황령 능선에 불꽃 독수리가 너무 늘었어. 15마리만 떨어뜨려 줘. 순찰대가 좀 숨통이 트일 거야.",
    requiredLevel: 40,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 15 },
    reward: { gold: 850, fame: 26, exp: 1300 },
    repeatable: false,
    giverNpcId: "skyreach_guide",
  },
  {
    id: "skyreach-alchemist-phoenix-feather",
    regionId: "skyreach",
    title: "봉황 깃털 넷",
    description:
      "봉황 깃털로 점화제를 만들어 봐야겠어. 봉황령 불꽃 독수리에게서 넷만 모아다 줘.",
    requiredLevel: 40,
    target: { kind: "deliver", materialId: "phoenix_feather", count: 4 },
    reward: { gold: 1000, exp: 1800, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "skyreach_alchemist",
  },
  {
    id: "unhyang-herbalist-flame-eagle-cape",
    regionId: "unhyang",
    title: "봉황 망토를 위하여",
    description:
      "봉황령 불꽃 독수리의 깃을 통째로 엮으면 가벼운 망토가 돼요. 20마리만 잡아 주시면, 그 깃으로 짠 봉황 망토를 직접 만들어 드릴게요.",
    requiredLevel: 40,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 20 },
    reward: { gold: 900, exp: 1400, items: [{ id: "flame_eagle_cape", count: 1 }] },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  // 봉황령 정기 의뢰(불꽃 독수리·화염 도마뱀·산악 기사)는 바람골 게시판 단독, 천공은 자기
  // 화산 지대·성지 콘텐츠에 집중. (옛 skyreach-phoenix-ridge-* / skyreach-knight-captain-hunt 제거.)


  // ── 봉황령 → 화산 사이 (reqLv 44~50), 레벨 공백 보강 ───────────────────
  // 봉황령 콘텐츠(reqLv ~40~42)와 화산 콘텐츠(reqLv 52+) 사이 10레벨 구간을 메운다.
  // 호스트는 이 시점에 도달 가능한 곳: 바람골 역참(게시판·길잡이 한솔) + 운향(도연).
  {
    id: "windvale-board-ridge-knights",
    regionId: "windvale",
    title: "봉황령: 산악 기사 정리",
    description: "봉황령 능선에 산악 기사단이 길목을 점거했습니다. 30명을 정리해 능선 길을 트세요.",
    requiredLevel: 44,
    target: { kind: "kill", monsterName: "산악 기사", count: 30 },
    reward: { gold: 780, fame: 22, exp: 1750 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-ridge-scout",
  },
  {
    id: "windvale-board-flame-lizards-large",
    regionId: "windvale",
    title: "봉황령: 화염 도마뱀 대청소",
    description: "봉황령 바위틈마다 화염 도마뱀이 둥지를 텄습니다. 55마리를 정리해 주세요.",
    requiredLevel: 44,
    target: { kind: "kill", monsterName: "화염 도마뱀", count: 55 },
    reward: { gold: 740, fame: 21, exp: 1700 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },
  {
    id: "windvale-board-ridge-eagles-large",
    regionId: "windvale",
    title: "봉황령: 불꽃 독수리 대규모 솎기",
    description: "봉황령 능선을 불꽃 독수리 떼가 뒤덮었습니다. 60마리를 솎아내 하늘 길을 트세요.",
    requiredLevel: 46,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 60 },
    reward: { gold: 1000, fame: 27, exp: 2000 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },
  {
    id: "windvale-board-lava-foothills",
    regionId: "skyreach",
    title: "화산 어귀: 용암 슬라임 정찰",
    description: "봉황령을 넘으면 화산 지대 어귀다. 용암 슬라임 35마리를 정화해 첫 발 디딜 데를 만드세요.",
    requiredLevel: 48,
    target: { kind: "kill", monsterName: "용암 슬라임", count: 35 },
    reward: { gold: 900, fame: 24, exp: 2200 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-ridge-scout",
  },
  // (옛 unhyang-board-phoenix-ridge-grand 는 분담 정리로 제거, 봉황령은 바람골 단독 운영.)
  {
    id: "windvale-pathfinder-deep-ridge",
    regionId: "windvale",
    title: "봉황령: 능선 더 깊은 곳",
    description:
      "능선에 첫 발은 디뎠지. 근데 더 깊이 들어가니 산악 기사단이 진을 제대로 쳤더라. 스무 명만 치워 주면 그 너머로 가는 길이 보여. 약 주머니 더 키워 줄게.",
    requiredLevel: 46,
    target: { kind: "kill", monsterName: "산악 기사", count: 20 },
    reward: { gold: 950, exp: 2000, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "windvale_pathfinder",
    requiresQuestCompleted: "windvale-pathfinder-ridge-scout",
  },
  {
    id: "windvale-pathfinder-foothills",
    regionId: "windvale",
    title: "화산 어귀: 불꽃 골렘",
    description:
      "봉황령 능선을 넘으면 화산 지대 어귀야. 거기 불꽃 골렘이 어슬렁대. 광물째 녹아내리는 놈들이라 까다롭지. 열둘만 부숴 주면 화산 지대로 들어서는 길이 트인다.",
    requiredLevel: 50,
    target: { kind: "kill", monsterName: "불꽃 골렘", count: 12 },
    reward: { gold: 1100, fame: 28, exp: 2400 },
    repeatable: false,
    giverNpcId: "windvale_pathfinder",
    requiresQuestCompleted: "windvale-pathfinder-deep-ridge",
  },
  {
    id: "unhyang-guide-ridge-storm",
    regionId: "unhyang",
    title: "봉황령: 화염 도마뱀 둥지",
    description:
      "봉황령 바위틈에 화염 도마뱀이 또 둥지를 텄어. 열여덟만 정리해 주면 순례길이 한동안 트일 거야.",
    requiredLevel: 44,
    target: { kind: "kill", monsterName: "화염 도마뱀", count: 18 },
    reward: { gold: 850, fame: 22, exp: 1700 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
    requiresQuestCompleted: "unhyang-guide-flame-lizards",
  },

  // ── 화산 지대, 사이드 의뢰 (천공 검/시온 출처) ─────────────────────────
  {
    id: "skyreach-alchemist-flame-scale",
    regionId: "skyreach",
    title: "화염 비늘 여덟 (연금)",
    description:
      "비늘에서 내열제를 추출해야 해. 봉황령 화염 도마뱀의 비늘 여덟 장만 모아다 줘.",
    requiredLevel: 52,
    target: { kind: "deliver", materialId: "flame_scale", count: 8 },
    reward: { gold: 1100, exp: 2600, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "skyreach_alchemist",
  },
  {
    id: "skyreach-volcanic-toads",
    regionId: "skyreach",
    title: "화산 지대 순찰: 화산 두꺼비",
    description: "화산 지대 웅덩이 가에 화산 두꺼비가 다시 들끓습니다. 30마리를 정리해 주세요.",
    requiredLevel: 52,
    target: { kind: "kill", monsterName: "화산 두꺼비", count: 30 },
    reward: { gold: 850, fame: 22, exp: 2400 },
    repeatable: true,
  },
  {
    id: "skyreach-lava-slimes-2",
    regionId: "skyreach",
    title: "화산 지대 순찰: 용암 슬라임",
    description: "화산 지대에 용암 슬라임이 들끓습니다. 40마리를 정화해 주세요.",
    requiredLevel: 52,
    target: { kind: "kill", monsterName: "용암 슬라임", count: 40 },
    reward: { gold: 800, fame: 20, exp: 2300 },
    repeatable: true,
    requiresQuestCompleted: "windvale-volcano-boss",
  },

  // ════════════════════════════════════════════════════════════════════════
  // 보스 누적 사냥 라인 + 액세서리 확정 루트 (§10), "보스 사냥꾼" 칭호
  // 세 hunter 의뢰는 그 보스를 처음 소개한 NPC 가 다시 주는 "개인 도전"(길드판 미노출).
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "deep-cave-hunter",
    regionId: "village",
    title: "광맥의 수호자 ─ 사냥 기록",
    description:
      "그놈을 열 번이나 잠재우면 동굴 안쪽이 한동안 조용하다고들 하더라고. 나야 무서워서 못 가지만, 모험가 양반이라면 기록 한번 채워볼 만하지 않겠어?",
    requiredLevel: 6,
    target: { kind: "kill", monsterName: "광맥의 수호자", count: 10 },
    reward: { gold: 1500, fame: 30, exp: 1800 },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    requiresQuestCompleted: "village-jimmy-deep-cave",
  },
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
  // 백운, 거인 10회 처치 후 풀리는 히든 검결 라인. "산정 검결의 잔편", 봉황 깃털 ×5 deliver.
  // 보상은 book_heaven_slay (귀속). 다이얼로그 게이트: peak-giant-hunter 완료 여부로 노출.
  {
    id: "unhyang-baekun-heaven-slay",
    regionId: "unhyang",
    title: "산정 검결의 잔편",
    description:
      "산정의 노래에 자네 이름이 새겨졌으니, 이제 옛 검결의 잔편을 자네에게 넘길 때가 됐어. 봉황 깃털 다섯. 진짜 불을 머금은 깃이라야 검결을 새길 수 있어. 가져와 주게.",
    requiredLevel: 30,
    target: { kind: "deliver", materialId: "phoenix_feather", count: 5 },
    reward: { fame: 50, skillBooks: ["book_heaven_slay"] },
    repeatable: false,
    giverNpcId: "unhyang_elder",
    requiresQuestCompleted: "peak-giant-hunter",
    hidden: true,
  },
  // 백운, 천살 잔편 이후 두 번째 히든 라인. 폭풍 일격, 돌풍 정령 ×10 처치.
  // 다이얼로그 게이트: unhyang-baekun-heaven-slay 완료 여부.
  {
    id: "unhyang-baekun-storm-strike",
    regionId: "unhyang",
    title: "구름 위의 결",
    description:
      "산정의 바람은 검 한 자루에도 옮길 수 있다. 옛말이지. 돌풍 정령 열을 잠재워 보게. 자네 검에도 그 바람이 옮겨질 거야.",
    requiredLevel: 30,
    target: { kind: "kill", monsterName: "돌풍 정령", count: 10 },
    reward: { fame: 50, skillBooks: ["book_storm_strike"] },
    repeatable: false,
    giverNpcId: "unhyang_elder",
    requiresQuestCompleted: "unhyang-baekun-heaven-slay",
    hidden: true,
  },
  // 음유시인, 유실품 노래(bard_lucky_collected) 이후 히든 호흡 라인. 봉황 깃털 ×3 deliver.
  // 다이얼로그 게이트: bard_lucky_collected 플래그 보유.
  {
    id: "windvale-bard-focused-breath",
    regionId: "windvale",
    title: "한 호흡의 결",
    description:
      "노래는 한 호흡으로 끝나야 맛이 살아. 봉황 깃털 세 개만 가져다 줘. 그걸로 그 호흡을 자네 검에 옮겨 줄게.",
    requiredLevel: 25,
    target: { kind: "deliver", materialId: "phoenix_feather", count: 3 },
    reward: { fame: 40, skillBooks: ["book_focused_breath"] },
    repeatable: false,
    giverNpcId: "windvale_bard",
    hidden: true,
  },
  // 카이, pristine 호수 님프 의뢰 완료 후 풀리는 히든 라인. 요정 가루 ×10 deliver → 잔상.
  {
    id: "diola-kai-afterimage",
    regionId: "diola",
    title: "닿기 전의 결",
    description:
      "노랫소리에 닿기 전에 끝내야 해요. 그게 요령이에요. 요정 가루 열 점만 모아 주시면, 새벽 그물에 비친 잔상의 움직임을 자네 검에 옮겨 줄게요.",
    requiredLevel: 12,
    target: { kind: "deliver", materialId: "fairy_dust", count: 10 },
    reward: { fame: 35, skillBooks: ["book_afterimage"] },
    repeatable: false,
    giverNpcId: "diola_fisher",
    requiresQuestCompleted: "diola-kai-pristine-nymphs",
    hidden: true,
  },
  {
    id: "volcano-heart-hunter",
    regionId: "skyreach",
    title: "화산의 심장 ─ 사냥 기록",
    description:
      "화산의 심장을 열 번이나 잠재운 자가 있었다는 옛 기록이 성지에 남아 있어. 솜씨가 있다면, 자네가 그 기록을 다시 써 보겠어?",
    requiredLevel: 55,
    target: { kind: "kill", monsterName: "화산의 심장", count: 10 },
    reward: { gold: 3500, fame: 50, exp: 6000 },
    repeatable: false,
    giverNpcId: "skyreach_guide",
    requiresQuestCompleted: "windvale-volcano-boss",
  },
  {
    id: "skyreach-alchemist-heart-essence",
    regionId: "skyreach",
    title: "심장에서 나온 것",
    description:
      "화산의 심장을 잠재울 때마다 떨어지는 것들. 용암 핵. 그걸로 봉인 보강제를 만들어 봐야겠어. 열 개만 모아다 줘.",
    requiredLevel: 55,
    target: { kind: "deliver", materialId: "lava_core", count: 10 },
    reward: { gold: 2000, exp: 3500, potionCapacityBonus: 1 },
    repeatable: true,
    cooldownMs: 12 * 60 * 60 * 1000,
    requiresQuestCompleted: "windvale-volcano-boss",
  },

  // ════════════════════════════════════════════════════════════════════════
  // 히든 퀘스트 (§11), 길드 게시판 미노출(giverNpcId 지정). 추가 노출 조건
  // (아이템 보유 / 보스 N회 처치 / flag) 은 해당 NPC 다이얼로그가 직접 가드한다.
  // ════════════════════════════════════════════════════════════════════════
  {
    id: "hidden-mole-king",
    regionId: "village",
    title: "두더지왕의 흔적",
    description:
      "두더지왕이 진짜 있다고? …그 드릴을 들고 다니는 걸 보니 빈말은 아닌 모양이군. 평야 두더지를 백 마리쯤 잡아보면 흔적이 나올지도 모르지.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName: "두더지", count: 100 },
    reward: { gold: 800, fame: 10, exp: 1200, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    hidden: true,
  },
  {
    id: "hidden-deepest-vein",
    regionId: "village",
    title: "광맥의 끝",
    description:
      "광맥의 수호자를 그렇게 여러 번 잠재웠으면, 동굴 안쪽 더 깊은 데서 마정석이 진하게 고였을 거다. 스무 덩이만 가져와 봐. 광맥의 끝이 어디까지 뻗었는지, 그걸로 가늠해 보자.",
    requiredLevel: 6,
    target: { kind: "deliver", materialId: "mana_crystal", count: 20 },
    reward: { gold: 1200, exp: 1800, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "village_blacksmith_bold",
    requiresQuestCompleted: "deep-cave-hunter",
    hidden: true,
  },
  {
    id: "hidden-blacksmith-duel",
    regionId: "village",
    title: "마저 두드린 것",
    description:
      "옛날에 만월이랑 무기 하나를 절반씩 만들다 싸우고 헤어졌지. 둘 다 다시 만났으니… 마저 완성해 볼까 싶어. 단단한 결정 여덟 덩이만 가져와 봐. 완성되면, 그 검은 자네 거야.",
    requiredLevel: 22,
    target: { kind: "deliver", materialId: "hard_crystal", count: 8 },
    reward: { gold: 1500, exp: 2500, items: [{ id: "moonlight_blade", count: 1 }] },
    repeatable: false,
    giverNpcId: "village_blacksmith_bold",
    hidden: true,
  },
  {
    id: "hidden-giants-origin",
    regionId: "unhyang",
    title: "거인은 어디서 왔나",
    description:
      "거인이 어디서 왔는지 알고 싶나? …협곡 가장 깊은 곳, 돌풍 정령이 모이는 자리를 봐라. 예순쯤 흩어 놓으면 그 자리가 드러난다. 그 다음은. 내가 본 것을 말해주지.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "돌풍 정령", count: 60 },
    reward: { gold: 1200, fame: 20, exp: 2000 },
    repeatable: false,
    giverNpcId: "unhyang_pilgrim",
    requiresQuestCompleted: "unhyang-baekun-peak-giant",
    hidden: true,
  },
  {
    id: "hidden-volcano-relic",
    regionId: "skyreach",
    title: "심장이 잠든 자리",
    description:
      "심장이 잠든 자리에 정수가 고였더군. 화산 두꺼비를 충분히 잡으면 그게 흘러나올 거야. 마흔 마리쯤이면 돼. 그걸로 용암 정수를 다듬어 줄게. 자네 몫이야.",
    requiredLevel: 55,
    target: { kind: "kill", monsterName: "화산 두꺼비", count: 40 },
    reward: { gold: 1500, exp: 2500, items: [{ id: "lava_essence", count: 1 }] },
    repeatable: false,
    giverNpcId: "skyreach_alchemist",
    requiresQuestCompleted: "windvale-volcano-boss",
    hidden: true,
  },

];
