import type { Quest } from "./types";

export const DIOLA_QUESTS: Quest[] = [
  // 후드 손님이 폐허로 안내하기 전에 디올라 사람들의 신뢰를 얻어야 한다.
  // 세 의뢰는 마을·동굴·숲을 거쳐 디올라까지 이른 모험가가 그 동선을 다시
  // 한 번 훑게 하는 가벼운 콜백, 자료 채집형(deliver)으로 진행.
  {
    id: "diola-rio-nails",
    regionId: "diola",
    title: "리오의 수집",
    description:
      "낡은 못을 모은다는 동네 형/누나가 있다더니, 진짜 모험가였구나! 20개만 모아주면 신기한 거 알려줄게.",
    requiredLevel: 1,
    target: { kind: "deliver", materialId: "rusty_nail", count: 20 },
    reward: { potionCapacityBonus: 1, gold: 90, fame: 9 },
    repeatable: false,
    giverNpcId: "diola_kid",
    // 다이얼로그 게이트: storyFlags.has(STRANGER_FLAG_TRIAL_STARTED) → hidden.
    hidden: true,
  },
  {
    id: "diola-nora-bat-eyes",
    regionId: "diola",
    title: "여관 다락의 박쥐",
    description:
      "여관 다락에 박쥐가 자꾸 들어와서 큰일이에요. 잡아서 눈알 10개만 가져다 주시면, 손님이 두고 간 부적을 드릴게요.",
    requiredLevel: 3,
    target: { kind: "deliver", materialId: "bat_eye", count: 10 },
    reward: { gold: 120, fame: 12, exp: 240 },
    repeatable: false,
    giverNpcId: "diola_innkeeper",
    // 다이얼로그 게이트: storyFlags.has(STRANGER_FLAG_TRIAL_STARTED) → hidden.
    hidden: true,
  },
  {
    id: "diola-boro-spider-silk",
    regionId: "diola",
    title: "보로의 거미줄",
    description:
      "거미줄 재고가 자꾸 모자랍니다. 10개만 모아 주시면, 답례로 골드와 명성을 두둑이 드리지요.",
    requiredLevel: 5,
    target: { kind: "deliver", materialId: "spider_silk", count: 10 },
    reward: { gold: 180, fame: 15, exp: 300 },
    repeatable: false,
    giverNpcId: "diola_merchant",
    // 다이얼로그 게이트: storyFlags.has(STRANGER_FLAG_TRIAL_STARTED) → hidden.
    hidden: true,
  },
  // 마린, 트라이얼 통과 후 폐허가 열리고 나서야 진행 가능 (영혼 결정은 망령 드롭).
  // 완료 시 '디올라의 친구' 칭호를 부여하는 라인의 클로저.
  {
    id: "diola-marin-soul-crystals",
    regionId: "diola",
    title: "촌장의 청: 영혼 결정",
    description:
      "폐허에서 나온 영혼 결정 3개만 가져다주시오. 옛 기록에 따르면, 이 마을과 폐허의 매듭을 푸는 데 그게 필요하다고 했소. …그리고 그 결정으로 칼을 벼리는 법도 적혀 있더군. 도면도 함께 가져가시오.",
    requiredLevel: 9,
    target: { kind: "deliver", materialId: "soul_crystal", count: 3 },
    reward: { gold: 300, fame: 15, exp: 600, recipes: ["soul_blade"] },
    repeatable: false,
    giverNpcId: "diola_elder",
    // 다이얼로그 게이트: storyFlags.has(STRANGER_FLAG_RUINS_GUIDE) → hidden.
    hidden: true,
  },
  // 마린 ↔ 백운, 산정 교역로 개통(§7.2). 운향 백운 라인의 mountain_trade_open flag 가
  // 켜진 뒤 MarinDialogue 에서 노출. 완료 시 diola_unhyang_trade_done flag → 양 마을 갱신.
  {
    id: "diola-marin-mountain-trade",
    regionId: "diola",
    title: "산정과의 거래",
    description:
      "산정 길이 다시 안전해졌다고 들었소. 그렇다면 거래를 트지. 우리 쪽 길목도 정리가 필요하오. 폐허 어귀 늑대 서른 마리만 솎아 주시오. 그러면 디올라와 운향 사이로 짐수레가 다시 오갈 게요.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "폐허 늑대", count: 30 },
    reward: { gold: 700, fame: 26, exp: 1100, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "diola_elder",
    requiresQuestCompleted: "unhyang-baekun-highland-goats",
    // 다이얼로그 게이트: storyFlags.has("mountain_trade_open"), goats + cliff-wolves
    // 둘 다 완료해야 켜지는데 prereq 는 goats 만 검사하므로 false positive 방지 위해 hidden.
    hidden: true,
  },
  // ── 디올라 길드 게시판, 반복 의뢰 ────────────────────────────────────
  // 호수·폐허 두 인접 지역의 적을 디올라 거점에서 처리. 폐허 적 3종은 트라이얼
  // 통과 후에야 실제로 잡을 수 있어, 길드판 노출이 트라이얼 동기 강화에도 기여.
  {
    id: "diola-lake-nymph",
    regionId: "diola",
    title: "호숫가의 노랫소리",
    description:
      "안개 너머에서 노랫소리가 짙어지고 있어요. 어부들이 그물을 거두지 못하고 있습니다. 호수 님프 45를 잠재워 주세요.",
    requiredLevel: 7,
    target: { kind: "kill", monsterName: "호수 님프", count: 45 },
    reward: { gold: 180, fame: 10, exp: 380 },
    repeatable: true,
  },
  {
    id: "diola-ruin-wolves",
    regionId: "diola",
    title: "폐허의 야성",
    description:
      "폐허 어귀에서 늑대들이 떼를 지어 마을 쪽으로 내려옵니다. 45마리를 정리해 주세요.",
    requiredLevel: 9,
    target: { kind: "kill", monsterName: "폐허 늑대", count: 45 },
    reward: { gold: 220, fame: 12, exp: 400 },
    repeatable: true,
  },
  {
    id: "diola-wandering-wraiths",
    regionId: "diola",
    title: "떠도는 자들",
    description:
      "안개 짙은 밤마다 폐허에서 새어 나온 망령이 디올라까지 흘러옵니다. 36체를 잠재워 주세요.",
    requiredLevel: 9,
    target: { kind: "kill", monsterName: "떠도는 망령", count: 36 },
    reward: { gold: 230, fame: 13, exp: 400 },
    repeatable: true,
  },
  {
    id: "diola-broken-golems",
    regionId: "diola",
    title: "잊힌 수호자",
    description:
      "폐허를 지키던 골렘들이 깨어나 무너진 돌담을 짓밟고 있습니다. 30체를 부숴 주세요.",
    requiredLevel: 9,
    target: { kind: "kill", monsterName: "부서진 골렘", count: 30 },
    reward: { gold: 280, fame: 14, exp: 380 },
    repeatable: true,
  },
  // ── 디올라, 새 quest kind 의뢰 5종 ─────────────────────────────────────
  // 트라이얼 통과 후 라인을 한 번씩 마친 NPC 들이 각자 결에 맞춰 한 단계 더 내준다.
  {
    // talk_to_npc, 리오의 라인 마무리. 어부 카이를 세 번 들러줘라.
    id: "diola-rio-listen-kai",
    regionId: "diola",
    title: "리오의 청: 카이 아저씨한테 가 줘",
    description:
      "카이 아저씨가 요즘 밤마다 호숫가만 봐요. 새벽에도. 엄마가 가서 한번 들어주랬는데. 나 무서워. 형/누나가 세 번만 들러줘요. 진짜로!",
    requiredLevel: 5,
    target: { kind: "talk_to_npc", npcId: "diola_fisher", count: 3 },
    reward: { gold: 140, fame: 9, exp: 220 },
    repeatable: false,
    giverNpcId: "diola_kid",
    requiresQuestCompleted: "diola-rio-nails",
  },
  {
    // talk_to_npc, 노라의 라인 마무리. 리오를 세 번 들러줘라.
    id: "diola-nora-listen-rio",
    regionId: "diola",
    title: "노라의 청: 리오 들어주기",
    description:
      "리오가 요즘 다 큰 척만 해요. 후드 손님 흉내 내면서요. 어린애가 어른 흉내 내는 게 마음 쓰여서요. 형/누나가 세 번만 들러줘요. 차 한 잔 끓여 둘게요.",
    requiredLevel: 5,
    target: { kind: "talk_to_npc", npcId: "diola_kid", count: 3 },
    reward: { gold: 160, fame: 10, exp: 240, potions: [{ id: "potion_heal_s", count: 4 }] },
    repeatable: false,
    giverNpcId: "diola_innkeeper",
    requiresQuestCompleted: "diola-nora-bat-eyes",
  },
  {
    // equip_item, 보로의 라인 마무리. 산적 단검 한 번이라도 차고 와라.
    id: "diola-boro-bandit-dagger-bear",
    regionId: "diola",
    title: "보로의 청: 손에 자루를",
    description:
      "다음에 거래소에 오실 땐. 산적 단검 한 자루라도 차고 와 주세요. 다른 손님이 그 모습을 보면 따라 거래하거든요. 거래는 양쪽이 다 좋아야 거래라잖아요?",
    requiredLevel: 6,
    target: { kind: "equip_item", itemId: "bandit_dagger" },
    reward: { gold: 220, fame: 12, exp: 320 },
    repeatable: false,
    giverNpcId: "diola_merchant",
    requiresQuestCompleted: "diola-boro-spider-silk",
  },
  {
    // kill_within_hp, 카이가 마지막에 내주는 일상 도전. 호수 님프를 흠 없이 다섯.
    // 카이의 결("그 노랫소리에 만져지기 전에 끝내야 해")을 그대로 잇는다.
    id: "diola-kai-pristine-nymphs",
    regionId: "diola",
    title: "카이의 청: 흠 없는 호수 사냥",
    description:
      "그 노랫소리에 만져지기 전에 끝내야 해요. 호수 님프 다섯을. HP 70% 이상으로. 흠 없이 잡고 오세요. 그래야 새벽 그물을 다시 걷을 수 있을 거예요.",
    requiredLevel: 8,
    target: {
      kind: "kill_within_hp",
      monsterName: "호수 님프",
      minHpFraction: 0.7,
      count: 5,
    },
    reward: { gold: 260, fame: 13, exp: 420 },
    repeatable: false,
    giverNpcId: "diola_fisher",
    // 후드 손님이 호수 떡밥을 카이에게 흘린 뒤에야 노출 (Kai 라인 클로저 flag 활용).
    // KaiDialogue 의 lakeHint(KAI_FLAG_LAKE_HINT) 단계까지 진행해야 의뢰가 노출되도록,
    // requiresQuestCompleted 가 아니라 storyFlag 로 게이팅 → hidden.
    hidden: true,
  },
  {
    // equip_set, 마린의 라인 마무리. 자네가 처음 손에 든 것 한 복으로 차고 와라.
    // 시작 장비 3 종(branch_stick·cloth_clothes·mom_amulet)을 동시에 장착하면 진행.
    id: "diola-marin-first-gear-set",
    regionId: "diola",
    title: "촌장의 청: 첫 모험가의 의장",
    description:
      "자네가 처음 손에 든 것. 나뭇가지·천 옷·어머니의 부적. 한 번이라도 다시 한 복으로 차고 와 보게. 우리 마을 사람들도 한 번 봐야 해. 자네가 어디서 시작했는지를.",
    requiredLevel: 10,
    target: {
      kind: "equip_set",
      itemIds: ["branch_stick", "cloth_clothes", "mom_amulet"],
    },
    reward: { gold: 320, fame: 15, exp: 500 },
    repeatable: false,
    giverNpcId: "diola_elder",
    requiresQuestCompleted: "diola-marin-soul-crystals",
  },
];
