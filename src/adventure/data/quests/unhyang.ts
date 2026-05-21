import type { Quest } from "./types";

export const UNHYANG_QUESTS: Quest[] = [
  // ── 운향 — 메인 라인 "잠들지 않는 산" (노촌장 백운) ──────────────────────
  // 운향 도달(= 운봉의 거인과 한 번 맞붙음, peak_giant_engaged) → 협곡 정찰 →
  // 운봉의 거인 처치 → 교역로 정리 2종 → 정기 토벌. 백운 대사 분기는 BaekunDialogue.
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
    // 다이얼로그 게이트: storyFlags.has("peak_giant_engaged") (운향 진입 시 거의 켜져 있음).
    // 안전하게 hidden — 운향 도달 전 신규 캐릭터에게 뱃지 노출 방지.
    hidden: true,
  },
  {
    id: "unhyang-baekun-peak-giant",
    regionId: "unhyang",
    title: "운봉의 거인",
    description:
      "이제 알겠네. 산 깊은 곳에 잠들지 않는 것이 버티는 한, 이 산정은 평온할 수 없어. 운봉의 거인. 혼자선 어림없는 상대지. 동료를 모아 그놈을 잠재워 주게. 산정의 명운이 거기 달렸다네.",
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
      "거인이 잠든 지금이 기회야. 협곡 길에 절벽 늑대가 너무 많아 짐꾼들이 다니질 못해. 서른 마리만 솎아 주게. 디올라와 다시 거래를 트려면 길부터 안전해야 하니.",
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
      "산기슭 비탈은 산양 떼가 바위를 굴려대서 위험하다네. 마흔 마리만 정리해 주게. 그래야 아랫마을 짐수레가 비탈을 오를 수 있어.",
    requiredLevel: 22,
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
  // 만월 — "운봉석을 벼리는 법"(견갑 확정) → 후속 "운봉 네 자루"(무기 4종 제작서 확정).
  // 운봉 무기 4종은 운봉의 거인 보스 드롭(recipe_one_of)으로도 풀리지만, 이 의뢰가 확정 루트.
  {
    id: "unhyang-manwol-ore-demo",
    regionId: "unhyang",
    title: "운봉석을 벼리는 법",
    description:
      "운봉석은 제대로 다룰 줄 아는 손이 드물어. 자네가 운봉석 여섯 덩이만 가져오면, 그걸로 시연을 보여줌세. 거인 어깨 비늘로 견갑을 어떻게 짜는지. 보고 나면 자네 손에도 새겨질 거야.",
    requiredLevel: 22,
    target: { kind: "deliver", materialId: "unbong_ore", count: 6 },
    reward: { gold: 500, exp: 800, recipes: ["peak_mantle"], potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "unhyang_smith",
    // 다이얼로그 게이트: storyFlags.has("peak_giant_defeated") → hidden.
    hidden: true,
  },
  {
    id: "unhyang-manwol-weapons",
    regionId: "unhyang",
    title: "운봉 네 자루",
    description:
      "견갑은 봤으니 이제 무기 차례야. 운봉석 여덟 덩이면. 대검, 방벽, 장창, 발톱. 네 자루 전부 벼리는 법을 새겨 줌세. 손에 맞는 걸 골라 쓰게.",
    requiredLevel: 22,
    target: { kind: "deliver", materialId: "unbong_ore", count: 8 },
    reward: { gold: 800, exp: 1200, recipes: ["peak_sword", "peak_shield", "peak_spear", "peak_claw"] },
    repeatable: false,
    giverNpcId: "unhyang_smith",
    requiresQuestCompleted: "unhyang-manwol-ore-demo",
  },
  // ── 운향 — 사이드 의뢰 (도연 / 산하) ────────────────────────────────────
  {
    id: "unhyang-sanha-herbs",
    regionId: "unhyang",
    title: "산초꽃 채집",
    description:
      "산기슭에 피는 산초꽃이 필요해요. 8송이만 모아다 주시면, 약 만드는 솜씨로 보답할게요. 산초꽃을 누벼 만드는 조끼, 그 만드는 법도 적어 드릴게요.",
    requiredLevel: 18,
    target: { kind: "deliver", materialId: "sancho_blossom", count: 8 },
    reward: { gold: 300, exp: 450, potionCapacityBonus: 1, recipes: ["sancho_vest"] },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  {
    id: "unhyang-sanha-bones",
    regionId: "unhyang",
    title: "거인 비늘 다섯",
    description:
      "거인의 비늘은 약을 갈무리하기에 그만이에요. 5개만 모아다 주시면 회복약을 가득 챙겨드릴게요.",
    requiredLevel: 20,
    target: { kind: "deliver", materialId: "giant_scale", count: 5 },
    reward: {
      gold: 600,
      exp: 750,
      potions: [{ id: "potion_heal_s", count: 3 }],
    },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  // ── 운향 — 사이드 의뢰 추가 (도연 / 산하 / 백운) ────────────────────────
  {
    id: "unhyang-doyeon-stone-frogs",
    regionId: "unhyang",
    title: "산기슭의 바위 두꺼비",
    description:
      "산기슭 바위 두꺼비, 그놈들 등껍데기가 길을 막아. 열다섯 마리만 치워 주면 짐꾼들 발이 좀 편해질 거야.. 가는 김에 협곡 무리장 늑대도 한 마리 봐 두면 굵은 송곳니가 나올 거야. 그게 나오면 단검 만드는 법도 함께 알려줄게.",
    requiredLevel: 18,
    target: { kind: "kill", monsterName: "바위 두꺼비", count: 15 },
    reward: { gold: 360, fame: 18, exp: 600, recipes: ["wolfking_fang_dagger"] },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  {
    id: "unhyang-guide-bison-down",
    regionId: "unhyang",
    title: "산정 아래 들소 떼",
    description:
      "산정 아래 들판 가봤어? 들소 떼가 길을 떡 막아. 스무 마리만 솎아 주면 짐수레가 좀 다닐 거야.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "들소", count: 20 },
    reward: { gold: 450, fame: 20, exp: 700 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  {
    id: "unhyang-sanha-tough-hide",
    regionId: "unhyang",
    title: "단단한 가죽 여섯",
    description:
      "단단한 가죽으로 약 보따리를 싸야 하거든요. 여섯 장만 모아다 주시면 회복약으로 보답할게요.",
    requiredLevel: 18,
    target: { kind: "deliver", materialId: "tough_hide", count: 6 },
    reward: { gold: 420, exp: 600, potions: [{ id: "potion_heal_s", count: 3 }] },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  {
    id: "unhyang-sanha-windstone",
    regionId: "unhyang",
    title: "바람 마석 넷",
    description:
      "바람 마석은 약을 오래 갈무리하는 데 그만이에요. 넷만 구해다 주시면 약 주머니를 더 크게 만들어 드릴게요.",
    requiredLevel: 20,
    target: { kind: "deliver", materialId: "wind_mana_stone", count: 4 },
    reward: { gold: 500, exp: 700, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  {
    id: "unhyang-sanha-bison-hide",
    regionId: "unhyang",
    title: "들소 가죽 여섯",
    description:
      "들소 가죽으로 약상자를 짜야겠어요. 여섯 장만 모아다 주시면 회복약으로 보답할게요.",
    requiredLevel: 28,
    target: { kind: "deliver", materialId: "bison_hide", count: 6 },
    reward: { gold: 550, exp: 800, potions: [{ id: "potion_heal_s", count: 3 }] },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  {
    id: "unhyang-baekun-pilgrim-escort",
    regionId: "unhyang",
    title: "순례자의 길",
    description:
      "북쪽에서 온 순례자가 운저 평원을 지나 다시 떠난다네. 거기 떠돌이 약탈자 무리가 자리를 잡았다더군. 열다섯만 손봐 주겠나? 순례자가 무사히 지나가게.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "떠돌이 약탈자", count: 15 },
    reward: { gold: 450, fame: 20, exp: 800 },
    repeatable: false,
    giverNpcId: "unhyang_elder",
    requiresQuestCompleted: "unhyang-baekun-peak-giant",
  },
  // 산하 ↔ 노라(디올라 여관) — 산정 약초 배송(§7.2). 완료 시 sanha_nora_herbs_sent flag
  // + herbalists_courier 칭호 (page.tsx). 디올라 노라 다이얼로그가 갱신된다.
  {
    id: "unhyang-sanha-nora-herbs",
    regionId: "unhyang",
    title: "디올라로 보내는 약초",
    description:
      "디올라 여관 주인 노라한테 산정 약초를 좀 보내고 싶어요. 산초꽃 열 송이만 모아다 주시면 제가 부쳐 드릴게요. 답례는 노라가 직접 챙겨 줄 거예요. 디올라 들르면 인사 한번 하시고요.",
    requiredLevel: 18,
    target: { kind: "deliver", materialId: "sancho_blossom", count: 10 },
    reward: { gold: 400, exp: 600, potions: [{ id: "potion_heal_s", count: 5 }], potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  // 나무꾼 지미 ↔ 산악 가이드 도연(§7.1). 지미가 운을 떼고, 도연이 실제 의뢰를 준다.
  // 완료 시 jimmy_doyeon_timber_done flag → 시작 마을 지미 다이얼로그 갱신.
  {
    id: "village-jimmy-doyeon-timber",
    regionId: "unhyang",
    title: "산정의 단단한 목재",
    description:
      "시작 마을 나무꾼 지미가 산정 협곡의 목재 이야기를 하더라고. 그건 절벽 늑대 소굴 안쪽에 있어. 열다섯 마리만 정리하면 안전하게 베어 와서 지미한테 부쳐 줄게.",
    requiredLevel: 20,
    target: { kind: "kill", monsterName: "절벽 늑대", count: 15 },
    reward: { gold: 400, fame: 16, exp: 600, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  // ── 운향 모험가 길드 게시판 (정식 로스터) ──────────────────────────────
  {
    id: "unhyang-board-goats",
    regionId: "unhyang",
    title: "산기슭: 산양 정리",
    description: "산기슭 비탈에 산양 떼가 다시 늘었습니다. 45마리를 정리해 주세요.",
    requiredLevel: 18,
    target: { kind: "kill", monsterName: "산양", count: 45 },
    reward: { gold: 320, fame: 14, exp: 650 },
    repeatable: true,
  },
  {
    id: "unhyang-board-goats-large",
    regionId: "unhyang",
    title: "산기슭: 산양 대규모 정리",
    description: "산양 떼가 비탈 전체를 뒤덮었습니다. 80마리를 정리해 주세요.",
    requiredLevel: 19,
    target: { kind: "kill", monsterName: "산양", count: 80 },
    reward: { gold: 620, fame: 24, exp: 1250 },
    repeatable: true,
  },
  {
    id: "unhyang-board-stone-frogs",
    regionId: "unhyang",
    title: "산기슭: 바위 두꺼비 구제",
    description: "산기슭 길목을 바위 두꺼비가 메우고 있습니다. 40마리를 구제해 주세요.",
    requiredLevel: 18,
    target: { kind: "kill", monsterName: "바위 두꺼비", count: 40 },
    reward: { gold: 360, fame: 16, exp: 700 },
    repeatable: true,
  },
  {
    id: "unhyang-board-cliff-wolves",
    regionId: "unhyang",
    title: "협곡: 절벽 늑대 사냥",
    description: "협곡 길에 절벽 늑대가 떼를 이뤘습니다. 40마리를 사냥해 주세요.",
    requiredLevel: 20,
    target: { kind: "kill", monsterName: "절벽 늑대", count: 40 },
    reward: { gold: 360, fame: 16, exp: 700 },
    repeatable: true,
  },
  {
    id: "unhyang-board-cliff-wolves-large",
    regionId: "unhyang",
    title: "협곡: 절벽 늑대 대규모 사냥",
    description: "절벽 늑대가 협곡 전체를 장악했습니다. 75마리를 사냥해 주세요.",
    requiredLevel: 21,
    target: { kind: "kill", monsterName: "절벽 늑대", count: 75 },
    reward: { gold: 700, fame: 26, exp: 1300 },
    repeatable: true,
  },
  {
    id: "unhyang-board-windspirits",
    regionId: "unhyang",
    title: "협곡: 돌풍 정령 진정",
    description: "협곡에 돌풍 정령이 몰려 길이 위태롭습니다. 35체를 진정시켜 주세요.",
    requiredLevel: 20,
    target: { kind: "kill", monsterName: "돌풍 정령", count: 35 },
    reward: { gold: 380, fame: 17, exp: 720 },
    repeatable: true,
  },
  {
    id: "unhyang-board-wolf-chieftain",
    regionId: "unhyang",
    title: "협곡: 무리장 솎아내기",
    description:
      "협곡 무리장 늑대들의 패턴이 파악됐습니다. 6마리를 솎아내면 길목이 한결 안전해질 거요.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "늑대 무리장", count: 6 },
    reward: { gold: 500, fame: 20, exp: 1100 },
    repeatable: true,
    requiresQuestCompleted: "unhyang-baekun-canyon-survey",
  },
  {
    id: "unhyang-board-grand-hunt",
    regionId: "unhyang",
    title: "운봉: 대규모 무리장 토벌",
    description:
      "산정이 잠잠해진 지금이 기회입니다. 무리장 늑대 12마리를 토벌해 산정의 노래에 이름을 남기세요.",
    requiredLevel: 24,
    target: { kind: "kill", monsterName: "늑대 무리장", count: 12 },
    reward: { gold: 1100, fame: 36, exp: 2400 },
    repeatable: true,
    requiresQuestCompleted: "unhyang-baekun-peak-giant",
  },
  {
    id: "unhyang-board-supply-escort",
    regionId: "unhyang",
    title: "디올라행 짐수레 호위",
    description:
      "디올라와의 교역로가 열렸습니다. 폐허 어귀 늑대 40마리를 정리해 디올라행 짐수레 길을 지켜 주세요.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "폐허 늑대", count: 40 },
    reward: { gold: 500, fame: 18, exp: 950 },
    repeatable: true,
    requiresQuestCompleted: "diola-marin-mountain-trade",
  },
  // ── 다리 구간 — 운저 평원 (운향에서 받는 첫 의뢰) ───────────────────────
  {
    id: "unhyang-guide-cloud-raiders",
    regionId: "unhyang",
    title: "평원의 약탈자",
    description:
      "운향 아래로 내려가면 너른 들판이 펼쳐져 있어. 요즘 거기 떠돌이 약탈자 무리가 자리를 잡았다더군. 15명만 손봐 주겠나?",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "떠돌이 약탈자", count: 15 },
    reward: { gold: 450, fame: 20, exp: 700 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  // 운향 길드 게시판 — 운저 평원 정기 의뢰 (바람골 게시판에서 이관, 운향 바로 아래 들녘).
  // id 의 windvale- 접두는 플레이어 진행도 보존을 위해 그대로 유지.
  {
    id: "windvale-bison-cull",
    regionId: "unhyang",
    title: "운저 평원: 들소 정리",
    description:
      "운저 평원 들소가 다시 떼를 이뤘습니다. 40마리를 정리해 주세요.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "들소", count: 40 },
    reward: { gold: 400, fame: 16, exp: 700 },
    repeatable: true,
  },
  {
    id: "windvale-board-bison-large",
    regionId: "unhyang",
    title: "운저 평원: 들소 대규모 정리",
    description: "들소가 평원 전체를 뒤덮었습니다. 75마리를 정리해 주세요.",
    requiredLevel: 29,
    target: { kind: "kill", monsterName: "들소", count: 75 },
    reward: { gold: 760, fame: 26, exp: 1350 },
    repeatable: true,
  },
  {
    id: "windvale-board-hawks",
    regionId: "unhyang",
    title: "운저 평원: 초원 매 사냥",
    description: "초원 매가 평원 짐수레를 노립니다. 35마리를 사냥해 주세요.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "초원 매", count: 35 },
    reward: { gold: 380, fame: 14, exp: 650 },
    repeatable: true,
  },
  {
    id: "windvale-board-raiders",
    regionId: "unhyang",
    title: "운저 평원: 약탈자 소탕",
    description: "떠돌이 약탈자가 평원 길목에 자리 잡았습니다. 30명을 소탕해 주세요.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "떠돌이 약탈자", count: 30 },
    reward: { gold: 420, fame: 16, exp: 700 },
    repeatable: true,
  },
  // ── 다리 구간 — 바람골 역참 ─────────────────────────────────────────────
  {
    id: "windvale-keeper-bison",
    regionId: "windvale",
    title: "들소 떼 솎아내기",
    description:
      "들소 떼가 역참 울타리를 자꾸 들이받아서 못 살겠소. 20마리만 솎아 주시면 사례하리다.",
    requiredLevel: 28,
    target: { kind: "kill", monsterName: "들소", count: 20 },
    reward: { gold: 550, fame: 22, exp: 850 },
    repeatable: false,
    giverNpcId: "windvale_keeper",
  },
  {
    id: "windvale-merchant-hawk-feathers",
    regionId: "windvale",
    title: "초원 매 깃털 다섯 장",
    description:
      "초원 매 깃털이 세공에 그만이거든. 5장만 모아다 주면 길에서 주운 좋은 걸 나눠 드리지. 깃털로 가벼운 망토를 짜는 법도 함께 알려 줌세.",
    requiredLevel: 28,
    target: { kind: "deliver", materialId: "hawk_feather", count: 5 },
    reward: { gold: 500, exp: 600, potionCapacityBonus: 1, recipes: ["hawkfeather_cloak"] },
    repeatable: false,
    giverNpcId: "windvale_merchant",
  },
  {
    id: "windvale-pathfinder-golems",
    regionId: "windvale",
    title: "잿빛 협로의 길막이",
    description:
      "봉황령으로 길을 내려는데 재먼지 골렘이 길목을 막고 있어요. 15체만 부숴 주시면 그 너머로 가는 길을 알려드릴게요.",
    requiredLevel: 34,
    target: { kind: "kill", monsterName: "재먼지 골렘", count: 15 },
    reward: { gold: 650, fame: 24, exp: 950 },
    repeatable: false,
    giverNpcId: "windvale_pathfinder",
  },
  // 바람골 역참 길드 게시판 — 잿빛 협로(다리 동쪽) 반복 의뢰.
  // 운저 평원(서쪽 들녘) 의뢰는 운향 게시판으로 이관 — 운향 바로 아래 사냥터라.
  // (id 의 windvale- 접두는 플레이어 진행도 보존을 위해 그대로 두고 regionId 만 옮긴 케이스가 아래로 이어진다.)
  {
    id: "windvale-ash-hounds",
    regionId: "windvale",
    title: "잿빛 협로: 들개 사냥",
    description:
      "잿빛 협로에 잿빛 들개가 들끓고 있습니다. 35마리를 사냥해 주세요.",
    requiredLevel: 34,
    target: { kind: "kill", monsterName: "잿빛 들개", count: 35 },
    reward: { gold: 500, fame: 18, exp: 850 },
    repeatable: true,
  },
  // 바람골 역참 — 봉황령 너머(화산 지대) 의뢰. 길잡이 한솔이 잿빛 협로 의뢰 후 풀어주는 후속.
  // 보스 의뢰는 화산 지대 진입 시점에 미리 받을 수 있어, 천공 성지가 열리기 전부터 보스 도전 동기를 준다.
  {
    id: "windvale-volcano-boss",
    regionId: "windvale",
    title: "능선 너머의 불덩이",
    description:
      "잿빛 협로를 지나 봉황령을 넘으면 화산 지대가 나와요. 거기 깊은 곳에. 사람들이 화산의 심장이라 부르는 게 깨어났습니다. 그놈을 잠재워야 그 너머 천공 성지로 가는 길이 열려요. 부탁 좀 드릴게요.",
    requiredLevel: 55,
    target: { kind: "kill", monsterName: "화산의 심장", count: 1 },
    reward: { gold: 2500, fame: 60, exp: 4500 },
    repeatable: false,
    giverNpcId: "windvale_pathfinder",
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },
  // 화산 지대 정기 의뢰 — 천공 성지 게시판으로 이관(성지 발치 사냥터). 진행도 보존 위해
  // id 의 windvale- 접두는 그대로. requires 도 윈드밸 길잡이 한솔 라인 그대로 유지.
  {
    id: "windvale-lava-slimes",
    regionId: "skyreach",
    title: "화산 지대: 용암 슬라임 정화",
    description:
      "봉황령 너머 화산 지대에 용암 슬라임이 들끓는다는 소식이 들어왔습니다. 45마리를 정화해 주세요.",
    requiredLevel: 52,
    target: { kind: "kill", monsterName: "용암 슬라임", count: 45 },
    reward: { gold: 900, fame: 24, exp: 2700 },
    repeatable: true,
    requiresQuestCompleted: "windvale-pathfinder-golems",
  },
  // ── 운향 — 봉황령 입구 의뢰 ─────────────────────────────────────────────
  // 도연이 봉황령 너머를 경계해 파견 의뢰를 내는 NPC 라인 첫 번째.
  {
    id: "unhyang-guide-phoenix-hunt",
    regionId: "unhyang",
    title: "봉황령의 불꽃 독수리",
    description:
      "봉황령에 불꽃 독수리가 너무 많아. 15마리만 정리해 주면 능선이 좀 안전해질 거야.",
    requiredLevel: 35,
    target: { kind: "kill", monsterName: "불꽃 독수리", count: 15 },
    reward: { gold: 800, fame: 26, exp: 1200 },
    repeatable: false,
    giverNpcId: "unhyang_guide",
  },
  {
    id: "unhyang-herbalist-flame-scale",
    regionId: "unhyang",
    title: "화염 비늘 여덟",
    description:
      "봉황령 화염 도마뱀의 비늘이 약 달이는 데 쓸 만해요. 8개만 모아다 주시면, 포션 한 보따리 드릴게요.",
    requiredLevel: 35,
    target: { kind: "deliver", materialId: "flame_scale", count: 8 },
    reward: {
      gold: 700,
      exp: 1000,
      potionCapacityBonus: 1,
    },
    repeatable: false,
    giverNpcId: "unhyang_herbalist",
  },
  // 봉황령 정기 의뢰는 바람골 게시판 단독 — 운향은 자기 사냥터·운저 평원에 집중.
  // (옛 unhyang-phoenix-ridge-patrol / unhyang-board-phoenix-ridge-grand 는 분담 정리로 제거.)

];
