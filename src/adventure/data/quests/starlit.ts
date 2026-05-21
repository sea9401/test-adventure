import type { Quest } from "./types";

export const STARLIT_QUESTS: Quest[] = [
  // ── 히든: 순례자의 자취 (§11.1) — 운저 평원→잿빛 협로→봉황령 표식 추적 ──────
  // unhyang_main_cleared 후 순례자가 운향을 떠나며 길마다 표식을 남긴다. 각 지역에서
  // PilgrimMarkDialogue("알림판" 카드 → 다이얼로그)로 surfacing. 4단계(천공 성지 재회)는
  // 의뢰 없이 step-3 완료 + skyreach 도착 시 PilgrimMarkDialogue 가 처리 → pilgrim_revealed.
  // giverNpcId 없음 — 운저 평원·잿빛 협로·봉황령은 게시판이 없는 통과 지역이라 게시판 노출 안 됨.
  {
    id: "hidden-pilgrim-trail-1",
    regionId: "cloud_plain",
    title: "순례자의 자취 ─ 풀밭의 매듭",
    description:
      "풀밭 한가운데 돌무지 위에 낯선 매듭이 묶여 있다. 순례자가 묶은 거다. 옆에는 떠돌이 약탈자들의 야영지. 길을 트지 않으면 다음 표식을 찾을 수 없다. 열 명만 정리하자.",
    requiredLevel: 22,
    target: { kind: "kill", monsterName: "떠돌이 약탈자", count: 10 },
    reward: { gold: 600, fame: 12, exp: 900 },
    repeatable: false,
    requiresQuestCompleted: "unhyang-baekun-peak-giant",
  },
  {
    id: "hidden-pilgrim-trail-2",
    regionId: "ashen_pass",
    title: "순례자의 자취 ─ 잿더미의 매듭",
    description:
      "잿더미에 반쯤 묻힌 같은 매듭. 옆에 식은 모닥불 자리, 그 둘레에 잿돌이 흩어져 있다. 다섯 덩이를 주워 표식 위에 올려놓으면. 잿가루 사이로 순례자가 간 방향이 드러난다.",
    requiredLevel: 34,
    target: { kind: "deliver", materialId: "ash_stone", count: 5 },
    reward: { gold: 800, fame: 14, exp: 1200 },
    repeatable: false,
    requiresQuestCompleted: "hidden-pilgrim-trail-1",
  },
  {
    id: "hidden-pilgrim-trail-3",
    regionId: "phoenix_ridge",
    title: "순례자의 자취 ─ 능선의 매듭",
    description:
      "능선 바위에 새겨진 매듭 문양. 디올라 후드 손님이 준 표식과 같은 모양이다. 순례자가 산악 기사들에게 길을 막혔던 듯. 열둘만 정리하면 능선 너머로 가는 자취가 이어진다.",
    requiredLevel: 38,
    target: { kind: "kill", monsterName: "산악 기사", count: 12 },
    reward: { gold: 1000, fame: 18, exp: 1500 },
    repeatable: false,
    requiresQuestCompleted: "hidden-pilgrim-trail-2",
  },
  // ── 별바다 — 노수호자 유성의 사냥 의뢰 라인 (4단). ────────────────────────
  // 1차 출처: 떠도는 시녀(Lv75) → 별빛 망령(Lv75) → 별궤도 자율기(Lv75) → 황성 호위병(Lv85).
  // 보상: 4단으로 corridor 5종 + road 5종 제작서 전부 풀린다 (5단 craft chain 의 중간 출처).
  {
    id: "star-haven-corridor-scouts",
    regionId: "star_corridor",
    title: "회랑의 흩어진 별빛",
    description:
      "별바다 노수호자 유성의 첫 부탁. 회랑에 떠도는 시녀들의 잔영이 별빛 흐름을 흩어 놓고 있다. 열둘만 가라앉히면 회랑검과 회랑 방패 벼림법을 넘겨준다.",
    requiredLevel: 75,
    target: { kind: "kill", monsterName: "떠도는 시녀", count: 12 },
    reward: { gold: 1200, fame: 18, exp: 2800, recipes: ["corridor_blade", "corridor_aegis"] },
    repeatable: false,
    giverNpcId: "star_haven_elder",
  },
  {
    id: "star-haven-corridor-wraiths",
    regionId: "star_corridor",
    title: "망령을 풀어내라",
    description:
      "회랑 깊은 곳에 별빛 망령들이 옛 흐름을 묶어두고 있다. 열다섯만 풀어주면 회랑창과 회랑 너클 벼림법을 함께 넘겨준다.",
    requiredLevel: 76,
    target: { kind: "kill", monsterName: "별빛 망령", count: 15 },
    reward: { gold: 1500, fame: 20, exp: 3400, recipes: ["corridor_lance", "corridor_grip"] },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-scouts",
  },
  {
    id: "star-haven-corridor-golems",
    regionId: "star_corridor",
    title: "회랑의 봉인",
    description:
      "별궤도 자율기들이 옛 회랑의 봉인을 쥐고 있다. 열만 가라앉히면 회랑 망토 벼림법과 안에 굳어 있는 별의 정수까지 함께 받는다.",
    requiredLevel: 78,
    target: { kind: "kill", monsterName: "별궤도 자율기", count: 10 },
    reward: {
      gold: 1900,
      fame: 24,
      exp: 4200,
      recipes: ["corridor_mantle"],
      materials: [{ id: "stellar_essence", count: 3 }],
    },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-wraiths",
  },
  // 폐도의 봉인 — 천공인의 왕 서사 게이트. 2026-05-19 보스 솔로 전환 이후에도
  // 의뢰는 서사 흐름과 storyFlag `skyfolk_gate_cleared` 설정용으로 유지.
  // 회랑 골렘(Q3) 완수 후 노출 / 완료 시 storyFlag `skyfolk_gate_cleared` 셋.
  {
    id: "star-haven-skyfolk-gate",
    regionId: "skyfolk_ruins",
    title: "폐도의 봉인을 풀어라",
    description:
      "폐도 안쪽 깊이 잘못 굳어 있는 봉인을 더는 둘 수 없다. 천공인 사관의 잔재 열만 정리하면 천공인의 왕이 비로소 자네를 마주할 자격을 인정한다.",
    requiredLevel: 80,
    target: { kind: "kill", monsterName: "천공인 사관", count: 10 },
    reward: { gold: 1700, fame: 22, exp: 3800 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-golems",
  },
  {
    id: "star-haven-throne-guards",
    regionId: "throne_road",
    title: "옥좌의 길목: 황성의 길",
    description:
      "옥좌의 길에서 황성 호위병들이 길을 막고 있다. 열다섯만 정리해 길을 열면 황성 무구 다섯 자루 벼림법을 모두 넘겨준다. 별바다가 줄 수 있는 마지막 선물.",
    requiredLevel: 85,
    target: { kind: "kill", monsterName: "황성 호위병", count: 15 },
    reward: {
      gold: 3500,
      fame: 40,
      exp: 7500,
      recipes: ["road_blade", "road_aegis", "road_lance", "road_grip", "road_mantle"],
    },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-skyfolk-gate",
  },
  // 옥좌의 봉인 — 창공의 주재 서사 게이트. Chapter 24 의 완료 룰이 이 flag 를 본다.
  // 2026-05-19 보스 솔로 전환 이후에도 의뢰는 챕터 진행용으로 필수.
  // 황성 호위병(Q4 throne-guards) 완수 후 노출 / 완료 시 storyFlag `apex_gate_cleared` 셋.
  {
    id: "star-haven-apex-gate",
    regionId: "apex_throne",
    title: "옥좌의 봉인을 풀어라",
    description:
      "옥좌 둘레에 별빛 사도들이 마지막 봉인을 두르고 있다. 열만 가라앉히면 창공의 주재가 자네 앞에 일어선다. 별빛이 그날을 기억할 것이다.",
    requiredLevel: 90,
    target: { kind: "kill", monsterName: "별빛 사도", count: 10 },
    reward: { gold: 3000, fame: 36, exp: 6500 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-throne-guards",
  },
  // ────────────────────────────────────────────────────────────────────────
  // 노수호자 유성 — 후반 3 보스(별을 지키는 자 / 천공인의 왕 / 창공의 주재) 도전 의뢰.
  // 2026-05-19: 세 보스가 협동→솔로 전환되면서 coop_* 타깃 9종을 솔로 전투 가능한
  // kind 로 재구성. 게이트 의뢰 완료(=서사 게이트) 후 잠금 해제.
  //   - witness : kill ×1                          (서사상 첫 베어냄 인증)
  //   - strike  : kill_within_hp 0.7 ×3            (거의 무피로 처치 — 결단의 일격)
  //   - survive : no_potion_boss ×5                (포션 없이 처치 — 흔들림 없는 자세)
  // 보상 fame 양은 보존 (협동→솔로 전환만, 진입장벽 동등).
  // ────────────────────────────────────────────────────────────────────────
  // 별을 지키는 자 (starspire) 3종
  {
    id: "star-haven-keeper-challenge-witness",
    regionId: "starspire",
    title: "별을 지키는 자: 별빛의 증인",
    description:
      "별을 지키는 자를 한 번 거두어 별빛이 자네를 알아보게 하시오. 별빛이 자네를 한 번 깊이 알아본다면. 그 기억은 평생 간다.",
    requiredLevel: 70,
    target: { kind: "kill", monsterName: "별을 지키는 자", count: 1 },
    reward: { fame: 50 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-golems",
  },
  {
    id: "star-haven-keeper-challenge-strike",
    regionId: "starspire",
    title: "별을 지키는 자: 별빛 한 줄기",
    description:
      "별을 지키는 자를 거의 다치지 않은 채로 한 번 거두시오. 한 번에 깊이 가르는 자에게만 보이는 자리가 있다.",
    requiredLevel: 70,
    target: {
      kind: "kill_within_hp",
      monsterName: "별을 지키는 자",
      minHpFraction: 0.7,
      count: 1,
    },
    reward: { fame: 50 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-golems",
  },
  {
    id: "star-haven-keeper-challenge-survive",
    regionId: "starspire",
    title: "별을 지키는 자: 흔들리지 않는 자세",
    description:
      "포션을 단 한 병도 꺼내지 말고 별을 지키는 자를 한 번 거두시오. 흔들리지 않는 자세가 별빛에 새겨질 때까지.",
    requiredLevel: 70,
    target: { kind: "no_potion_boss", monsterName: "별을 지키는 자", count: 1 },
    reward: { fame: 50 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-corridor-golems",
  },
  // 천공인의 왕 (skyfolk_ruins) 3종
  {
    id: "star-haven-king-challenge-witness",
    regionId: "skyfolk_ruins",
    title: "천공인의 왕: 폐도의 증인",
    description:
      "천공인의 왕을 한 번 거두어 폐도가 자네를 알아보게 하시오. 폐도가 자네를 알아보는 첫 표식이다.",
    requiredLevel: 80,
    target: { kind: "kill", monsterName: "천공인의 왕", count: 1 },
    reward: { fame: 60 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-skyfolk-gate",
  },
  {
    id: "star-haven-king-challenge-strike",
    regionId: "skyfolk_ruins",
    title: "천공인의 왕: 폐도의 일격",
    description:
      "천공인의 왕을 거의 다치지 않은 채로 한 번 거두시오. 폐도가 한 자루 칼에도 흔들리는 순간이 있다.",
    requiredLevel: 80,
    target: {
      kind: "kill_within_hp",
      monsterName: "천공인의 왕",
      minHpFraction: 0.7,
      count: 1,
    },
    reward: { fame: 60 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-skyfolk-gate",
  },
  {
    id: "star-haven-king-challenge-survive",
    regionId: "skyfolk_ruins",
    title: "천공인의 왕: 폐도를 견디는 자",
    description:
      "포션을 단 한 병도 꺼내지 말고 천공인의 왕을 한 번 거두시오. 폐도는 견디는 자만이 풀어낼 수 있다.",
    requiredLevel: 80,
    target: { kind: "no_potion_boss", monsterName: "천공인의 왕", count: 1 },
    reward: { fame: 60 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-skyfolk-gate",
  },
  // 창공의 주재 (apex_throne) 3종
  {
    id: "star-haven-arbiter-challenge-witness",
    regionId: "apex_throne",
    title: "창공의 주재: 옥좌의 증인",
    description:
      "창공의 주재를 한 번 거두어 옥좌가 자네를 알아보게 하시오. 옥좌가 자네를 처음으로 깊이 인정하는 표식이다.",
    requiredLevel: 90,
    target: { kind: "kill", monsterName: "창공의 주재", count: 1 },
    reward: { fame: 80 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-apex-gate",
  },
  {
    id: "star-haven-arbiter-challenge-strike",
    regionId: "apex_throne",
    title: "창공의 주재: 옥좌의 일격",
    description:
      "창공의 주재를 거의 다치지 않은 채로 한 번 거두시오. 옥좌도 한 자루 칼에 흔들리는 순간이 있다 들었소.",
    requiredLevel: 90,
    target: {
      kind: "kill_within_hp",
      monsterName: "창공의 주재",
      minHpFraction: 0.7,
      count: 1,
    },
    reward: { fame: 80 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-apex-gate",
  },
  {
    id: "star-haven-arbiter-challenge-survive",
    regionId: "apex_throne",
    title: "창공의 주재: 옥좌를 견디는 자",
    description:
      "포션을 단 한 병도 꺼내지 말고 창공의 주재를 한 번 거두시오. 옥좌를 견디는 자만이 별빛의 끝을 본다.",
    requiredLevel: 90,
    target: { kind: "no_potion_boss", monsterName: "창공의 주재", count: 1 },
    reward: { fame: 80 },
    repeatable: false,
    giverNpcId: "star_haven_elder",
    requiresQuestCompleted: "star-haven-apex-gate",
  },
  // ── 5막 「빈 옥좌의 시대」 PR-C — 별빛을 담을 그릇 ───────────────────────────
  // 노수호자 유성(시작 마을 인스턴스, village_pilgrim_meteor) 의 단일 deliver 의뢰.
  // dialogue 가 endgame_apex_defeated + Ch 27 완료(세 잔영 flag) 를 가드 — 데이터로
  // 표현 불가하므로 hidden:true (게시판 노출 X, NPC 대화로만 발견).
  // 보상: 별빛 깃든 기예 6권 일괄. 의뢰 완료가 Ch 28 「유성의 마지막 부탁」 의 완료 조건.
  {
    id: "village-meteor-vessel",
    regionId: "village",
    title: "별빛을 담을 그릇",
    description:
      "별바다에서 시작 마을까지 직접 찾아온 노수호자 유성. 옛 봉인 자리 셋에서 거두어진 별빛 조각 30점을 가져가면, 누구의 것도 아닌 빛을 누구의 것도 아닌 자리에 두기 위한 마지막 그릇을 빚어 두겠다고 한다.",
    requiredLevel: 100,
    target: { kind: "deliver", materialId: "starfall_shard", count: 30 },
    reward: {
      gold: 5000,
      fame: 50,
      exp: 5000,
      skillBooks: [
        "book_starlit_mending",
        "book_starlit_cut",
        "book_starlit_knot",
        "book_starlit_chill",
        "book_starlit_sever",
        "book_starlit_scatter",
      ],
    },
    repeatable: false,
    giverNpcId: "village_pilgrim_meteor",
    hidden: true,
  },
  // 5막 깊이 — 지미 히든. 별빛 광맥 수호자 5회 처치로 풀리는 호흡법(book_lifesteal).
  // 다이얼로그 게이트: storyFlags.has("starfall_warden_felled") — 별빛 광맥 수호자를
  // 한 번이라도 베어 본 자에게만 지미가 운을 뗀다. 보상은 흡령(귀속).
  {
    id: "village-jimmy-starfall-deepening",
    regionId: "village",
    title: "별빛 광맥의 깊이",
    description:
      "광맥의 수호자가 별빛에 데워져 다시 깨어났다는 말. 자네가 봤다지. 사람들은 안 믿어. 다섯 번이면. 다섯 번을 거두어 와 주면, 노친네가 옛 광맥 호흡법 한 자락을 자네 결에 옮겨 둘 테니까.",
    requiredLevel: 100,
    target: { kind: "kill", monsterName: "별빛 광맥 수호자", count: 5 },
    reward: { gold: 3000, fame: 40, exp: 4000, skillBooks: ["book_lifesteal"] },
    repeatable: false,
    giverNpcId: "village_woodcutter_jimmy",
    hidden: true,
  },
];
