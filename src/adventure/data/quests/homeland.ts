import type { Quest } from "./types";

export const HOMELAND_QUESTS: Quest[] = [
  {
    id: "village-beggars",
    regionId: "village",
    title: "마을의 거지들",
    description:
      "마을에 주정뱅이가 너무 많다는 민원이 들어오고있어요. 주정뱅이 30명을 혼내주세요.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"주정뱅이", count: 30 },
    reward: { gold: 45, fame: 3, exp: 35 },
    repeatable: true,
  },
  {
    id: "village-slime-extermination",
    regionId: "village",
    title: "슬라임 퇴치",
    description:
      "평야에 슬라임이 갑자기 너무 많아져서 농부들이 피해를 보고있어요. 슬라임 60마리를 처치해주세요.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"슬라임", count: 60 },
    reward: { gold: 60, fame: 4, exp: 120 },
    repeatable: true,
  },
  {
    id: "village-dog-extermination",
    regionId: "village",
    title: "들개 퇴치",
    description:
      "마을 외곽에서 들개가 가축을 노린다는 신고가 들어왔어요. 들개 45마리를 처치해주세요.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"들개", count: 45 },
    reward: { gold: 70, fame: 4, exp: 135 },
    repeatable: true,
  },
  {
    id: "village-mole-extermination",
    regionId: "village",
    title: "두더지 퇴치",
    description:
      "두더지가 밭을 헤집어 놓아 농작물 피해가 심해요. 두더지 60마리를 처치해주세요.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"두더지", count: 60 },
    reward: { gold: 55, fame: 4, exp: 120 },
    repeatable: true,
  },
  {
    id: "village-trainer-slimes",
    regionId: "village",
    title: "훈련: 슬라임 5마리",
    description: "훈련 교관 스미스의 첫 과제. 평야의 슬라임 5마리를 처치한다.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"슬라임", count: 5 },
    reward: {
      potions: [{ id: "potion_heal_s", count: 5 }],
    },
    repeatable: false,
    giverNpcId: "village_trainer_smith",
  },
  {
    id: "village-trainer-dogs",
    regionId: "village",
    title: "훈련: 들개 10마리",
    description: "훈련 교관 스미스의 두 번째 과제. 들개 10마리를 처치한다.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"들개", count: 10 },
    reward: { exp: 30, gold: 15, fame: 3 },
    repeatable: false,
    giverNpcId: "village_trainer_smith",
    requiresQuestCompleted: "village-trainer-slimes",
  },
  {
    id: "village-trainer-moles",
    regionId: "village",
    title: "훈련: 두더지 10마리",
    description: "훈련 교관 스미스의 마지막 과제. 두더지 10마리를 처치한다.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName:"두더지", count: 10 },
    reward: {
      items: [{ id: "vitality_ring", count: 1 }],
    },
    repeatable: false,
    giverNpcId: "village_trainer_smith",
    requiresQuestCompleted: "village-trainer-dogs",
  },
  {
    id: "village-jimmy-bandits",
    regionId: "village",
    title: "나무꾼 지미의 부탁",
    description:
      "요즘 숲에 산적이 너무 많이 나와서 벌목하러 가질 못하고있어요. 산적들좀 처리해주세요.",
    requiredLevel: 1,
    target: { kind: "kill", monsterName: "산적", count: 20 },
    reward: {
      items: [{ id: "spare_hatchet", count: 1 }],
      potionCapacityBonus: 1,
    },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    // 다이얼로그 게이트: crafting.state.boldQuestComplete. 데이터로 표현 불가 → hidden.
    hidden: true,
  },
  // 지미 — 산적 의뢰 완료 후 받는 깊은 동굴 조사 의뢰. 보스 1회 처치.
  // 수락 시 'jimmy_deep_cave_quest' story flag 설정 → 동굴 → 깊은 동굴 통로 해금.
  {
    id: "village-jimmy-deep-cave",
    regionId: "village",
    title: "동굴 안쪽의 무언가",
    description:
      "요즘 동굴 더 안쪽까지 들어가다가 큰 광맥 하나를 봤는데, 그 너머에서 영 안 좋은 기운이 풍기더라고. 무서워서 도망쳐 나왔어. 모험가 양반이 한 번 가서 무엇이 있는지 확인해 주쇼.",
    requiredLevel: 5,
    target: { kind: "kill", monsterName: "광맥의 수호자", count: 1 },
    reward: { gold: 900, fame: 30, exp: 1050, potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    requiresQuestCompleted: "village-jimmy-bandits",
  },
  // 시작 마을 길드판 반복 의뢰 — 메인 깊은 동굴 의뢰 완료 후에만 노출.
  // 보스 일일 3회 제한이라 1일에 1회 완료 가능. 누적 파밍 동기.
  // count 는 일일 캡(3)에 묶여 있어 다른 반복 의뢰처럼 ×3 하지 않고 보상만 키운다.
  {
    id: "village-deep-cave-recurring",
    regionId: "village",
    title: "광맥의 수호자 토벌 ─ 정기",
    description:
      "동굴 안쪽 광맥에서 다시 깨어나는 그놈을 정기적으로 잠재워 주시오. 세 번이면 한동안은 잠잠할 것이오.",
    requiredLevel: 6,
    target: { kind: "kill", monsterName: "광맥의 수호자", count: 3 },
    reward: { gold: 400, fame: 12, exp: 480 },
    repeatable: true,
    requiresQuestCompleted: "village-jimmy-deep-cave",
  },
  // 볼드 — 마정석 무기 라인 보조(§10.1). 광맥의 수호자 드롭(마정석)을 볼드가 시연 → 팔찌 제작서.
  // BlacksmithDialogue 에서 노출 (jimmy_deep_cave_quest flag 가 켜진 뒤 — 동굴 안쪽을 안다는 신호).
  {
    id: "village-bold-mana-crystal",
    regionId: "village",
    title: "마정석을 다루는 법",
    description:
      "광맥의 수호자가 떨군 마정석, 그거 제대로 다루려면 손이 익어야 해. 다섯 덩이만 가져와 봐. 그걸로 시연을 보여주지. 보고 나면 자네도 마정석 무기를 벼릴 수 있을 거야.",
    requiredLevel: 6,
    target: { kind: "deliver", materialId: "mana_crystal", count: 5 },
    reward: { gold: 600, exp: 500, recipes: ["mana_bracelet"], potionCapacityBonus: 1 },
    repeatable: false,
    giverNpcId: "village_blacksmith_bold",
    // 다이얼로그 게이트: storyFlags.has("jimmy_deep_cave_quest"). 데이터로 표현 불가 → hidden.
    hidden: true,
  },
  // ── 시작 마을 — 새 quest kind 의뢰 3종 ─────────────────────────────────
  // 각 인트로 라인의 4 번째 단계로 매단다. 라인 어휘를 잇는 자연스러운 결.
  {
    // equip_item — 트레이너 라인 마무리. 활력의 반지 한 번이라도 차고 와 봐.
    id: "village-trainer-equip-vitality-ring",
    regionId: "village",
    title: "스미스의 청: 반지를 차고 와",
    description:
      "내가 준 활력의 반지. 끼고 다녀? 한 번이라도 차고 와 보게. 그래야 자네가 평야 졸업이라고 인정해 주지.",
    requiredLevel: 1,
    target: { kind: "equip_item", itemId: "vitality_ring" },
    reward: { gold: 60, fame: 5, exp: 90 },
    repeatable: false,
    giverNpcId: "village_trainer_smith",
    requiresQuestCompleted: "village-trainer-moles",
  },
  {
    // visit_region — 지미의 깊은 동굴 라인 마무리. 광맥 자리를 다섯 번 더 봐 두고 와라.
    id: "village-jimmy-deep-cave-tour",
    regionId: "village",
    title: "나무꾼 지미의 청: 광맥 자리 다시 보기",
    description:
      "사람들이 안 믿어요. 자네가 봤다는 그 광맥 자리, 한 번 더 가서 확인하고 와 주쇼. 다섯 번이면 마을 사람들도 자네 말을 믿을 게요.",
    requiredLevel: 6,
    target: { kind: "visit_region", regionId: "deep_cave", count: 5 },
    reward: { gold: 320, fame: 14, exp: 480 },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    requiresQuestCompleted: "village-jimmy-deep-cave",
  },
  {
    // craft_item — 볼드의 마정석 라인 마무리. 자네 손으로 한 자루 짜 봐.
    id: "village-bold-mana-sword-craft",
    regionId: "village",
    title: "대장장이 볼드의 청: 자네 손으로 한 자루",
    description:
      "팔찌까지 짜 봤으니, 이젠 칼이야. 마정석 검. 자네 손으로 한 자루 짜 봐. 그래야 그 마정석이 손에 어떻게 익는지 알지.",
    requiredLevel: 7,
    target: { kind: "craft_item", itemId: "mana_sword", count: 1 },
    reward: { gold: 400, fame: 16, exp: 600 },
    repeatable: false,
    giverNpcId: "village_blacksmith_bold",
    requiresQuestCompleted: "village-bold-mana-crystal",
  },
  // ── 디올라 — "안개 너머의 길" 트라이얼 라인 ──────────────────────────────
];
