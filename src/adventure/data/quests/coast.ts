import type { Quest } from "./types";

export const COAST_QUESTS: Quest[] = [
  // ── 소만 (해안 지선) ─────────────────────────────────────────────────────
  // 갯벌(Lv10) 잡몹 의뢰 → 소만 신임(여울 보증) → 뱃사공 해랑 선저 덧대기(ferryman_reef_passage)
  // → 산호초 섬(Lv16~) 정찰 → 수심의 것 처치. 갈매/보말은 QuestLineDialogue, 해랑/여울은 커스텀.
  // 산호초 섬 적을 대상으로 하는 의뢰는 모두 해랑의 선저 덧대기(hull-plating) 완료를 선행으로 둔다.
  {
    id: "saltmarsh-galmae-crabs",
    regionId: "saltmarsh",
    title: "갈매의 통발: 집게발 게",
    description:
      "갯벌에 집게발 게가 너무 불어 통발이며 그물이 남아나질 않아요. 집게발 게 20마리를 솎아 주세요. (게딱지 손방패와 갯벌 각반 짜는 법을 알려줍니다)",
    requiredLevel: 10,
    target: { kind: "kill", monsterName: "집게발 게", count: 20 },
    reward: { gold: 200, fame: 12, exp: 380, recipes: ["crab_shell_buckler", "tideflats_waders"] },
    repeatable: false,
    giverNpcId: "saltmarsh_salter",
  },
  {
    id: "saltmarsh-galmae-reef-coral",
    regionId: "saltmarsh",
    title: "갈매의 청: 산호 가시",
    description:
      "산호 가시는 송곳이며 통발 미늘로 두루 쓰여요. 암초에서 부러진 산호 가시 8개만 들여와 주면 사례하지요.",
    requiredLevel: 16,
    target: { kind: "deliver", materialId: "coral_spine", count: 8 },
    reward: { gold: 360, fame: 17, exp: 700 },
    repeatable: false,
    giverNpcId: "saltmarsh_salter",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  {
    id: "saltmarsh-bomal-crab-shells",
    regionId: "saltmarsh",
    title: "보말의 게장: 게딱지",
    description:
      "손님상에 올릴 게장을 담그려는데 게딱지가 모자라네요. 게딱지 10개만 들여와 주면 섭섭잖게 사례할게요.",
    requiredLevel: 10,
    target: { kind: "deliver", materialId: "crab_shell", count: 10 },
    reward: { gold: 150, fame: 10, exp: 320, potions: [{ id: "potion_heal_s", count: 5 }] },
    repeatable: false,
    giverNpcId: "saltmarsh_innkeeper",
  },
  {
    id: "saltmarsh-bomal-galley-larder",
    regionId: "saltmarsh",
    title: "보말의 곳간 채우기",
    description:
      "대상 길손이 줄줄이 들이닥칠 철이라 곳간을 단단히 채워야 해요. 게딱지 15개만 더 들여와 주면. 손님이 두고 간 약 주머니를 손봐서 드릴게요.",
    requiredLevel: 11,
    target: { kind: "deliver", materialId: "crab_shell", count: 15 },
    reward: { gold: 240, fame: 13, exp: 420, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "saltmarsh_innkeeper",
  },
  {
    id: "saltmarsh-bomal-reef-stew",
    regionId: "saltmarsh",
    title: "보말의 솥: 갑각 약탈자",
    description:
      "난바다에서 갑각 약탈자들이 어선까지 따라붙는대요. 15만 정리해 주면 어선이 다시 나갈 거예요.",
    requiredLevel: 16,
    target: { kind: "kill", monsterName: "갑각 약탈자", count: 15 },
    reward: { gold: 380, fame: 18, exp: 760 },
    repeatable: false,
    giverNpcId: "saltmarsh_innkeeper",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  {
    id: "saltmarsh-haerang-hull-plating",
    regionId: "saltmarsh",
    title: "선저 덧대기",
    description:
      "암초 사이를 지나려면 배 밑을 게딱지 갑판으로 덧대야 해. 게딱지 15개만 모아다 줘. 그러면 난바다로 데려가 주지.",
    requiredLevel: 13,
    target: { kind: "deliver", materialId: "crab_shell", count: 15 },
    reward: { gold: 320, fame: 16, exp: 600 },
    repeatable: false,
    giverNpcId: "saltmarsh_ferryman",
    // 다이얼로그 게이트: storyFlags.has("saltmarsh_vouched") → hidden.
    hidden: true,
  },
  {
    id: "saltmarsh-haerang-reef-runs",
    regionId: "saltmarsh",
    title: "건넨 김에: 사이렌 쫓기",
    description:
      "난바다를 건널 때마다 사이렌 노랫소리가 뱃머리를 돌려세워. 산호초 사이렌 20만 쫓아 주면 뱃길이 한결 수월하겠어.",
    requiredLevel: 16,
    target: { kind: "kill", monsterName: "산호초 사이렌", count: 20 },
    reward: { gold: 400, fame: 18, exp: 800 },
    repeatable: false,
    giverNpcId: "saltmarsh_ferryman",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  {
    id: "saltmarsh-yeoul-reef-survey",
    regionId: "saltmarsh",
    title: "여울의 청: 암초 살피기",
    description:
      "해랑이 자네를 난바다로 데려갔다고 들었네. 그렇다면 부탁이 있어. 암초 둘레의 산호가 어떻게 자라는지 봐 주게. 심해 비늘 10조각이면 충분해. 그걸 보면 밑에서 자는 것이 얼마나 깨어났는지 알 수 있네.",
    requiredLevel: 16,
    target: { kind: "deliver", materialId: "deep_scale", count: 10 },
    reward: { gold: 460, fame: 20, exp: 900 },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  {
    id: "saltmarsh-yeoul-deep-one",
    regionId: "saltmarsh",
    title: "수심의 것",
    description:
      "이제 알겠네. 암초 밑에서 뒤척이는 그것이 잠잠해지지 않는 한, 이 포구는 다시 일어서지 못해. 수심의 것. 단단히 준비해 가서 그것을 가라앉혀 주게. 소만의 명운이 거기 달렸네.",
    requiredLevel: 18,
    target: { kind: "kill", monsterName: "수심의 것", count: 1 },
    reward: {
      gold: 900,
      fame: 26,
      exp: 1300,
      potions: [{ id: "potion_heal_m", count: 5 }],
      recipes: ["abyssal_heart"],
    },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-yeoul-reef-survey",
  },
  {
    id: "saltmarsh-deep-one-recurring",
    regionId: "saltmarsh",
    title: "수심의 것: 다시 뒤척일 때",
    description:
      "한 번 가라앉혔다고 끝이 아니야. 또 물이 차거든. 수심의 것을 세 번 더 가라앉혀 주게. 소만이 자네를 기억할 게요.",
    requiredLevel: 18,
    target: { kind: "kill", monsterName: "수심의 것", count: 3 },
    reward: { gold: 1100, fame: 28, exp: 1500 },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-yeoul-deep-one",
  },
  // ── 소만 — 새 quest kind 의뢰 ─────────────────────────────────────────
  // craft_item / talk_to_npc / visit_region / equip_item / equip_set / kill_within_hp
  // / no_potion_boss 를 자연스러운 4 번째 단계로 매단다. 보스 후 도전 3 종은 무진 패턴
  // 그대로 — kill_within_hp / no_potion_boss / equip_set 을 한 라인에서 검증.
  {
    // craft_item — 갈매 라인 마지막 단계. 게딱지 손방패 2 점 제작.
    // 게딱지 손방패 제작서는 갈매의 첫 의뢰(crabs) 보상으로 받는다.
    id: "saltmarsh-galmae-shell-forge",
    regionId: "saltmarsh",
    title: "갈매의 청: 게딱지 손방패 두 점",
    description:
      "이번엔 통발 손질이 아니라 자네 손을 빌려야겠어. 게딱지 손방패, 두 점만 새로 짜서 가져와 줘. 갯벌 다니는 일꾼 둘에게 한 점씩 들려 보내려고. 솜씨 좋게.",
    requiredLevel: 11,
    target: { kind: "craft_item", itemId: "crab_shell_buckler", count: 2 },
    reward: { gold: 320, fame: 13, exp: 480 },
    repeatable: false,
    giverNpcId: "saltmarsh_salter",
    requiresQuestCompleted: "saltmarsh-galmae-crabs",
  },
  {
    // talk_to_npc — 보말 라인 마지막 단계. 미르(갯마을 아이)를 N 번 들어주기.
    id: "saltmarsh-bomal-listen-mireu",
    regionId: "saltmarsh",
    title: "보말의 청: 미르 들어주기",
    description:
      "그 애가 요즘 통 말이 적어요. 한낮에도 갯벌만 보고 있고요. 들어줄 사람이 있어야지요. 미르와 세 번만 이야기를 나눠 주세요. 사례는 손님이 두고 간 회복약으로요.",
    requiredLevel: 11,
    target: { kind: "talk_to_npc", npcId: "saltmarsh_kid", count: 3 },
    reward: { gold: 220, fame: 11, exp: 280, potions: [{ id: "potion_heal_s", count: 5 }] },
    repeatable: false,
    giverNpcId: "saltmarsh_innkeeper",
    requiresQuestCompleted: "saltmarsh-bomal-crab-shells",
  },
  {
    // visit_region — 미르(갯마을 아이) 가 처음으로 내주는 의뢰. 해랑이 배를 내준 뒤,
    // 산호초 섬에 다섯 번 다녀와 어떻게 생겼는지 이야기해 달라는 어린애의 부탁.
    id: "saltmarsh-mireu-reef-tour",
    regionId: "saltmarsh",
    title: "미르의 청: 산호초 섬 한 바퀴",
    description:
      "해랑 아저씨는 안 데려가 줘요. 아저씨가 다섯 번만 더 갔다 와서, 산호초 섬이 어떻게 생겼는지 다 말해 줘요. 안개도, 사이렌 노래도, 가시 산호도. 산호초 섬 5회 방문.",
    requiredLevel: 16,
    target: { kind: "visit_region", regionId: "reef_isle", count: 5 },
    reward: { gold: 280, fame: 13, exp: 460 },
    repeatable: false,
    giverNpcId: "saltmarsh_kid",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
    // 다이얼로그 게이트: stilled(deep_one_stilled) && crossed — prereq 만으론 표현 불가 → hidden.
    hidden: true,
  },
  {
    // equip_item — 해랑 라인 마지막 단계. 산호 가시 단검을 한 번이라도 차고 와라.
    // 뱃사공이 "산호 가시쯤은 익숙해야 난바다를 건너지" 라고 말하는 결.
    id: "saltmarsh-haerang-coral-bear",
    regionId: "saltmarsh",
    title: "해랑의 청: 산호 가시 자루",
    description:
      "암초를 자주 건너는 사람은 산호 가시쯤은 손에 익숙해야 해. 산호 가시 단검. 한 번이라도 차고 와 줘. 그래야 뱃삯도 깎아 주지.",
    requiredLevel: 16,
    target: { kind: "equip_item", itemId: "coral_spine_dagger" },
    reward: { gold: 260, fame: 12, exp: 420 },
    repeatable: false,
    giverNpcId: "saltmarsh_ferryman",
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  // ── 소만 — 수심의 것 보스 재도전 3 종 ──────────────────────────────────
  // kill_within_hp / no_potion_boss / equip_set 의 인게임 검증. 무진 라인과 짝.
  // 보스 처치(saltmarsh-yeoul-deep-one) 완료 후에만 노출되며, YeoulDialogue 가 한
  // 번에 한 단계씩 차례로 제안한다.
  {
    id: "saltmarsh-yeoul-challenge-pristine",
    regionId: "saltmarsh",
    title: "흠 없는 한 잠수",
    description:
      "수심의 것을 한 번 가라앉혔다면. 두 번째는 흠 없이 가져갈 수 있나? 소용돌이가 등을 핥기 전에. HP 70% 이상으로 수심의 것을 처치.",
    requiredLevel: 18,
    target: {
      kind: "kill_within_hp",
      monsterName: "수심의 것",
      minHpFraction: 0.7,
      count: 1,
    },
    reward: { gold: 700, fame: 18, exp: 1100 },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-yeoul-deep-one",
  },
  {
    id: "saltmarsh-yeoul-challenge-no-potion",
    regionId: "saltmarsh",
    title: "마른 한 잠수",
    description:
      "옛 잠수부는 약 주머니 없이 물에 들었어. 포션 한 병도 쓰지 않고 수심의 것을 가라앉혀 보게.",
    requiredLevel: 18,
    target: { kind: "no_potion_boss", monsterName: "수심의 것", count: 1 },
    reward: { gold: 700, fame: 18, exp: 1100 },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-yeoul-deep-one",
  },
  {
    // equip_set — 무기 / 갑옷 / 액세서리 슬롯이 겹치지 않게 골랐다. 셋을 동시에 차야 진행.
    id: "saltmarsh-yeoul-challenge-abyssal-set",
    regionId: "saltmarsh",
    title: "심연의 한 복",
    description:
      "심연 칼날·사이렌 노래 망토·수심의 핵. 셋을 한 복으로 갖춰 한 번이라도 차고 와 주게. 옛 잠수부 한 식구가 다시 선 모습을 보고 싶소.",
    requiredLevel: 18,
    target: {
      kind: "equip_set",
      itemIds: ["abyssal_edge", "siren_song_mantle", "abyssal_heart"],
    },
    reward: { gold: 800, fame: 20, exp: 1200 },
    repeatable: false,
    giverNpcId: "saltmarsh_elder",
    requiresQuestCompleted: "saltmarsh-yeoul-deep-one",
  },
  // ── 소만 길드 게시판 — 반복 의뢰 ──────────────────────────────────────
  // 갯벌 적 3종은 누구나, 산호초 섬 적 2종은 해랑의 선저 덧대기 완료 후 노출.
  {
    id: "saltmarsh-board-crabs",
    regionId: "saltmarsh",
    title: "갯벌의 집게발",
    description:
      "썰물 때마다 집게발 게가 갯벌 길을 막아 디올라 어부들이 건너오질 못합니다. 집게발 게 45마리를 정리해 주세요.",
    requiredLevel: 10,
    target: { kind: "kill", monsterName: "집게발 게", count: 45 },
    reward: { gold: 220, fame: 12, exp: 400 },
    repeatable: true,
  },
  {
    id: "saltmarsh-board-shore-birds",
    regionId: "saltmarsh",
    title: "갯도요 떼",
    description:
      "갯도요 떼가 소만 어판장 생선을 노립니다. 40마리를 쫓아내 주세요.",
    requiredLevel: 10,
    target: { kind: "kill", monsterName: "갯도요", count: 40 },
    reward: { gold: 230, fame: 12, exp: 400 },
    repeatable: true,
  },
  {
    id: "saltmarsh-board-mudfish",
    regionId: "saltmarsh",
    title: "진창의 미꾸라지",
    description:
      "진흙 미꾸라지가 소금밭 수로를 헤집어 놓습니다. 40마리를 정리해 주세요.",
    requiredLevel: 10,
    target: { kind: "kill", monsterName: "진흙 미꾸라지", count: 40 },
    reward: { gold: 210, fame: 11, exp: 380 },
    repeatable: true,
  },
  {
    id: "saltmarsh-board-sirens",
    regionId: "saltmarsh",
    title: "안개 너머의 노랫소리",
    description:
      "산호초 섬 둘레로 사이렌 노랫소리가 짙어져 어선이 나가질 못합니다. 산호초 사이렌 45를 잠재워 주세요.",
    requiredLevel: 16,
    target: { kind: "kill", monsterName: "산호초 사이렌", count: 45 },
    reward: { gold: 380, fame: 18, exp: 760 },
    repeatable: true,
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
  {
    id: "saltmarsh-board-coral-golems",
    regionId: "saltmarsh",
    title: "암초를 걷는 것들",
    description:
      "가시 산호 골렘이 암초 사이 뱃길을 막아섭니다. 30체를 부숴 주세요.",
    requiredLevel: 16,
    target: { kind: "kill", monsterName: "가시 산호 골렘", count: 30 },
    reward: { gold: 420, fame: 19, exp: 780 },
    repeatable: true,
    requiresQuestCompleted: "saltmarsh-haerang-hull-plating",
  },
];
