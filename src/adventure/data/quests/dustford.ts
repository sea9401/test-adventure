import type { Quest } from "./types";

export const DUSTFORD_QUESTS: Quest[] = [
  // ── 마른나루 (서편 옛길) ─────────────────────────────────────────────────
  // 옛길(Lv3) 잡몹 의뢰 → 마른나루 신임(무진 보증) → 무진 옛길 정리(oldwall_keep_unsealed)
  // → 옛 변경 성채(Lv13) 정찰 → 옛 성문지기 처치. 두루/나래/솔개는 QuestLineDialogue, 무진은 커스텀.
  // 옛 변경 성채 적을 대상으로 하는 의뢰는 모두 무진의 옛길 정리(clear-road) 완료를 선행으로 둔다.
  {
    id: "dustford-duru-fangs",
    regionId: "dustford",
    title: "두루의 수집: 들고양이 송곳니",
    description:
      "옛길 들고양이가 통발을 헤집어 놓아 큰일이에요. 들고양이 송곳니 10개만 모아 주면 사례하지요. 노상강도 단검 손질하는 법도 알려드릴게요.",
    requiredLevel: 3,
    target: { kind: "deliver", materialId: "wilddog_fang", count: 10 },
    reward: { gold: 80, fame: 7, exp: 130, recipes: ["roadbandit_shortsword"] },
    repeatable: false,
    giverNpcId: "dustford_scavenger",
  },
  {
    id: "dustford-duru-feathers",
    regionId: "dustford",
    title: "두루의 수집: 까마귀 깃",
    description:
      "두건이며 안감이며 까마귀 깃이 자꾸 모자랍니다. 12장만 모아 주면 후하게 쳐드리지요.",
    requiredLevel: 3,
    target: { kind: "deliver", materialId: "raven_feather", count: 12 },
    reward: { gold: 95, fame: 8, exp: 150 },
    repeatable: false,
    giverNpcId: "dustford_scavenger",
  },
  {
    id: "dustford-duru-scrap",
    regionId: "dustford",
    title: "두루의 청: 녹슨 쇳조각",
    description:
      "녹슨 쇳조각은 다시 벼리면 갑옷이고 무기고 다 됩니다. 옛 성채에서 8덩이만 들여와 주면 후하게 쳐드리지요.",
    requiredLevel: 13,
    target: { kind: "deliver", materialId: "scrap_iron", count: 8 },
    reward: { gold: 330, fame: 16, exp: 560 },
    repeatable: false,
    giverNpcId: "dustford_scavenger",
    requiresQuestCompleted: "dustford-mujin-clear-road",
  },
  {
    id: "dustford-narae-feathers",
    regionId: "dustford",
    title: "나래의 베갯속: 까마귀 깃",
    description:
      "손님 베개 속 채울 깃이 영 모자라네요. 까마귀 깃 10장만 들여와 주면 잠자리가 한결 나을 텐데. 손님이 두고 간 회복약도 챙겨 드릴게요.",
    requiredLevel: 3,
    target: { kind: "deliver", materialId: "raven_feather", count: 10 },
    reward: { gold: 75, fame: 6, exp: 120, potions: [{ id: "potion_heal_s", count: 5 }] },
    repeatable: false,
    giverNpcId: "dustford_innkeeper",
  },
  {
    id: "dustford-narae-larder",
    regionId: "dustford",
    title: "나래의 겨우살이",
    description:
      "찬바람 들 철이라 깃을 넉넉히 둬야 해요. 까마귀 깃 15장만 더 들여와 주면. 손님이 두고 간 약 주머니를 손봐서 드릴게요.",
    requiredLevel: 4,
    target: { kind: "deliver", materialId: "raven_feather", count: 15 },
    reward: { gold: 120, fame: 8, exp: 180, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "dustford_innkeeper",
  },
  {
    id: "dustford-narae-keep-stew",
    regionId: "dustford",
    title: "나래의 솥: 탈영 약탈자",
    description:
      "옛 성채에 눌러앉은 탈영병들이 옛길 행상까지 따라붙는대요. 15만 정리해 주면 행상이 다시 다닐 거예요.",
    requiredLevel: 13,
    target: { kind: "kill", monsterName: "탈영 약탈자", count: 15 },
    reward: { gold: 350, fame: 17, exp: 600 },
    repeatable: false,
    giverNpcId: "dustford_innkeeper",
    requiresQuestCompleted: "dustford-mujin-clear-road",
  },
  {
    id: "dustford-solgae-wildcats",
    regionId: "dustford",
    title: "솔개의 사냥: 갈대 살쾡이",
    description:
      "갈대 살쾡이가 둥지를 헤집고 다녀 밭 가는 사람들이 못 살아요. 18마리만 정리해 주면 까마귀깃 두건 짓는 법을 알려드리지요.",
    requiredLevel: 3,
    target: { kind: "kill", monsterName: "갈대 살쾡이", count: 18 },
    reward: { gold: 85, fame: 7, exp: 140, recipes: ["crow_feather_cap"] },
    repeatable: false,
    giverNpcId: "dustford_hunter",
  },
  {
    id: "dustford-solgae-ravens",
    regionId: "dustford",
    title: "솔개의 사냥: 들까마귀 떼",
    description:
      "들까마귀 떼가 옛길 위를 빙빙 돌며 행상 짐을 노립니다. 18마리만 떨어뜨려 주세요.",
    requiredLevel: 3,
    target: { kind: "kill", monsterName: "들까마귀 떼", count: 18 },
    reward: { gold: 90, fame: 7, exp: 140 },
    repeatable: false,
    giverNpcId: "dustford_hunter",
  },
  {
    id: "dustford-mujin-clear-road",
    regionId: "dustford",
    title: "옛길 트기",
    description:
      "옛 성채로 일꾼을 데려가려면 옛길에 눌러앉은 노상강도부터 솎아야 해. 15만 정리해 주게. 그러면 무너진 북쪽 벽으로 가는 길을 열고, 자네도 데려가지.",
    requiredLevel: 7,
    target: { kind: "kill", monsterName: "노상강도", count: 15 },
    reward: { gold: 220, fame: 12, exp: 380 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    // 다이얼로그 게이트: storyFlags.has(DUSTFORD_FLAG_VOUCHED) → hidden.
    hidden: true,
  },
  {
    id: "dustford-mujin-keep-survey",
    regionId: "dustford",
    title: "무진의 청: 성채 살피기",
    description:
      "성채에 일꾼들을 데리고 들어가 봤네. 다만 안에 녹슨 쇳조각이 얼마나 쌓였는지 봐 와 주게. 10덩이면 재건에 쓸 만한지 알 수 있소.",
    requiredLevel: 12,
    target: { kind: "deliver", materialId: "scrap_iron", count: 10 },
    reward: { gold: 380, fame: 18, exp: 700 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-clear-road",
  },
  {
    id: "dustford-mujin-gatekeeper",
    regionId: "dustford",
    title: "옛 성문지기",
    description:
      "성채는 멀쩡해. 한 가지만 빼면. 성문지기. 사람을 막으라 만든 게 아니야, 군대를 막으라 세운 거지. 군대는 오지 않았고 그것만 남아 빈 벽을 지켜. 단단히 준비해 가서 그것을 잠재워 주게. 마른나루의 명운이 거기 달렸소.",
    requiredLevel: 13,
    target: { kind: "kill", monsterName: "옛 성문지기", count: 1 },
    reward: {
      gold: 700,
      fame: 22,
      exp: 1000,
      potions: [{ id: "potion_heal_s", count: 8 }],
      recipes: ["gatekeeper_core"],
    },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-keep-survey",
  },
  {
    id: "dustford-gatekeeper-recurring",
    regionId: "dustford",
    title: "옛 성문지기: 다시 깨어날 때",
    description:
      "한 번 잠재웠다고 끝이 아니야. 또 성문이 깨어나거든. 옛 성문지기를 세 번 더 잠재워 주게. 마른나루가 자네를 잊지 않을 게요.",
    requiredLevel: 13,
    target: { kind: "kill", monsterName: "옛 성문지기", count: 3 },
    reward: { gold: 850, fame: 24, exp: 1200 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-gatekeeper",
  },
  // 옛 성문지기 도전 의뢰 3종 — 보스 처치 후 무진이 추가로 내준다.
  // kill_within_hp / no_potion_boss / equip_set 세 가지 새 quest kind 의 인게임 라인.
  // 단순히 "한 번 처치"가 아니라 자세를 보는 의뢰들 — 옛 수비대의 결을 잇는 자에게.
  {
    id: "dustford-mujin-challenge-pristine",
    regionId: "dustford",
    title: "흠 없는 한 수",
    description:
      "성문지기를 한 번 잠재웠다면. 두 번째는 흠 없이 가져갈 수 있나? 빗장이 살갗에 닿기 전에. HP 70% 이상으로 옛 성문지기를 처치.",
    requiredLevel: 13,
    target: { kind: "kill_within_hp", monsterName: "옛 성문지기", minHpFraction: 0.7, count: 1 },
    reward: { gold: 600, fame: 16, exp: 1000 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-gatekeeper",
  },
  {
    id: "dustford-mujin-challenge-no-potion",
    regionId: "dustford",
    title: "맨몸의 한 수",
    description:
      "옛 수비대는 약 주머니 없이 서 있었어. 포션 한 병도 쓰지 않고 옛 성문지기를 잠재워 보게.",
    requiredLevel: 13,
    target: { kind: "no_potion_boss", monsterName: "옛 성문지기", count: 1 },
    reward: { gold: 600, fame: 16, exp: 1000 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-gatekeeper",
  },
  {
    id: "dustford-mujin-challenge-garrison-set",
    regionId: "dustford",
    title: "수비대 한 복",
    description:
      "수비대 도검·사슬갑옷·성문지기의 핵. 셋을 한 복으로 갖춰 한 번이라도 차고 와 주게. 옛 수비대 한 식구가 다시 선 모습을 보고 싶소.",
    requiredLevel: 13,
    target: {
      kind: "equip_set",
      itemIds: ["garrison_blade", "garrison_hauberk", "gatekeeper_core"],
    },
    reward: { gold: 700, fame: 18, exp: 1100 },
    repeatable: false,
    giverNpcId: "dustford_keeper",
    requiresQuestCompleted: "dustford-mujin-gatekeeper",
  },
  // ── 마른나루 옛길 — 새 quest kind 의뢰 ─────────────────────────────────
  // PR A 에서 도입한 craft_item / talk_to_npc / visit_region / kill_within_hp 를
  // 인트로 라인의 자연스러운 4 번째 단계로 매단다. 각 NPC 의 인트로 의뢰를 한 번
  // 마친 뒤에야 노출돼, 라인 어휘를 끊지 않는다.
  {
    // craft_item — 두루 라인 마지막 단계. 옛 군기 망토(군기 한 폭 + 또 한 폭) 1 회 제작.
    // tattered_standard_cloak 은 노상강도가 떨궈 모이고, 합쳐 frontier_standard_cloak.
    id: "dustford-duru-standard-restore",
    regionId: "dustford",
    title: "두루의 청: 옛 군기 복원",
    description:
      "성채까지 다닌다며? 그럼 부탁 하나 더. 옛 변경 군기, 한 폭을 잇대 복원한 걸 한 번이라도 두르고 와 줘. 마른나루 노인들이 그 깃 한 번 보고 싶어 해. 군기 망토(frontier_standard_cloak) 1점 제작.",
    requiredLevel: 9,
    target: { kind: "craft_item", itemId: "frontier_standard_cloak", count: 1 },
    reward: { gold: 360, fame: 14, exp: 520 },
    repeatable: false,
    giverNpcId: "dustford_scavenger",
    requiresQuestCompleted: "dustford-duru-scrap",
  },
  {
    // talk_to_npc — 나래 라인 마지막 단계. 보리(역참 아이)를 N 번 들어주기.
    id: "dustford-narae-listen-bori",
    regionId: "dustford",
    title: "나래의 청: 보리 들어주기",
    description:
      "그 애가 요즘 통 말이 적어요. 밤마다 옛길 끝 쪽을 본대요. 자기는 안 무섭다면서. 들어줄 사람이 있어야지요. 보리와 세 번만 이야기를 나눠 주세요.",
    requiredLevel: 4,
    target: { kind: "talk_to_npc", npcId: "dustford_kid", count: 3 },
    reward: { gold: 200, fame: 10, exp: 240, potions: [{ id: "potion_heal_s", count: 5 }] },
    repeatable: false,
    giverNpcId: "dustford_innkeeper",
    requiresQuestCompleted: "dustford-narae-feathers",
  },
  {
    // visit_region — 보리(역참 아이) 가 처음으로 내주는 의뢰. 성문이 열린 뒤,
    // 옛 성채에 다섯 번 들어갔다 와서 어떻게 생겼는지 이야기해 달라는 어린애의 부탁.
    id: "dustford-bori-keep-tour",
    regionId: "dustford",
    title: "보리의 청: 성채 한 바퀴",
    description:
      "무진 할아버지는 안 데려가 줘요. 아저씨가 다섯 번만 더 갔다 와서, 안이 어떻게 생겼는지 다 말해 줘요. 흉벽도, 우물도, 안마당도. 옛 성채 5회 방문.",
    requiredLevel: 9,
    target: { kind: "visit_region", regionId: "oldwall_keep", count: 5 },
    reward: { gold: 220, fame: 11, exp: 320 },
    repeatable: false,
    giverNpcId: "dustford_kid",
    requiresQuestCompleted: "dustford-mujin-clear-road",
    // 다이얼로그 게이트: gatekeeper_felled && KEEP_FLAG_UNSEALED — prereq 만으로 못 표현 → hidden.
    hidden: true,
  },
  {
    // kill_within_hp — 솔개 라인 마지막 단계. 노상강도 5 마리를 HP 70% 이상으로 처치.
    // 들사냥꾼다운 "흠 없는 한 수" 어휘를 잡몹으로 끌어다 일상 도전으로 둔다.
    id: "dustford-solgae-pristine-bandits",
    regionId: "dustford",
    title: "솔개의 청: 흠 없는 사냥",
    description:
      "들사냥꾼 한 수는 빗장 맞기 전에 끝내는 거야. 노상강도 다섯을. HP 70% 이상으로. 흠 없이 잡아 와 봐. 그게 가능하면 옛길에서 자네 이름이 좀 알려질 거다.",
    requiredLevel: 5,
    target: {
      kind: "kill_within_hp",
      monsterName: "노상강도",
      minHpFraction: 0.7,
      count: 5,
    },
    reward: { gold: 280, fame: 12, exp: 380 },
    repeatable: false,
    giverNpcId: "dustford_hunter",
    requiresQuestCompleted: "dustford-solgae-ravens",
  },
  // ── 마른나루 길드 게시판 — 반복 의뢰 ─────────────────────────────────
  // 옛길 적 3종은 누구나, 옛 변경 성채 적 2종은 무진의 옛길 정리 완료 후 노출.
  {
    id: "dustford-board-wildcats",
    regionId: "dustford",
    title: "갈대밭의 들고양이",
    description:
      "옛길 갈대밭에 들고양이가 떼를 키워 시작 마을 쪽 밭까지 헤집습니다. 갈대 살쾡이 40마리를 정리해 주세요.",
    requiredLevel: 3,
    target: { kind: "kill", monsterName: "갈대 살쾡이", count: 40 },
    reward: { gold: 110, fame: 7, exp: 160 },
    repeatable: true,
  },
  {
    id: "dustford-board-ravens",
    regionId: "dustford",
    title: "옛길의 까마귀",
    description:
      "들까마귀 떼가 옛길을 뒤덮어 행상 짐을 노립니다. 들까마귀 떼 45마리를 정리해 주세요.",
    requiredLevel: 3,
    target: { kind: "kill", monsterName: "들까마귀 떼", count: 45 },
    reward: { gold: 105, fame: 7, exp: 150 },
    repeatable: true,
  },
  {
    id: "dustford-board-bandits",
    regionId: "dustford",
    title: "옛길의 노상강도",
    description:
      "옛길에 눌러앉은 노상강도가 시작 마을과 마른나루 사이 행상을 턴다는 신고가 들어왔습니다. 노상강도 36명을 정리해 주세요.",
    requiredLevel: 3,
    target: { kind: "kill", monsterName: "노상강도", count: 36 },
    reward: { gold: 130, fame: 8, exp: 170 },
    repeatable: true,
  },
  {
    id: "dustford-board-wall-ravens",
    regionId: "dustford",
    title: "흉벽을 도는 것들",
    description:
      "옛 변경 성채 흉벽에 폐성벽 까마귀가 둥지를 틀어 일꾼들이 못 올라갑니다. 폐성벽 까마귀 40마리를 정리해 주세요.",
    requiredLevel: 13,
    target: { kind: "kill", monsterName: "폐성벽 까마귀", count: 40 },
    reward: { gold: 340, fame: 16, exp: 580 },
    repeatable: true,
    requiresQuestCompleted: "dustford-mujin-clear-road",
  },
  {
    id: "dustford-board-automata",
    regionId: "dustford",
    title: "녹슨 보초들",
    description:
      "옛 변경 성채 안마당에 녹슨 자동인형이 아직도 보초를 돕니다. 30체를 부숴 주세요.",
    requiredLevel: 13,
    target: { kind: "kill", monsterName: "녹슨 자동인형", count: 30 },
    reward: { gold: 400, fame: 18, exp: 620 },
    repeatable: true,
    requiresQuestCompleted: "dustford-mujin-clear-road",
  },
];
