// 칭호 정의. 새 칭호 추가 시:
// 1) TITLES 에 항목 추가 (id, name, description, condition, category)
// 2) 조건이 만족되는 시점에 adventureLog.markTitleObtained(id) 호출
//    (예: 보스 처치 직후, 퀘스트 완료 후, 레벨업 콜백 등)
// 3) docs/items.md 같은 도감 표가 있으면 함께 갱신
//
// category 는 도감(TitlesTab) 의 섹션 그루핑에 사용된다. 새 카테고리를 만들면
// TITLE_CATEGORY_ORDER 에도 등록.

export type TitleId = string;

// 도감의 칭호 섹션 분류. 추가 시 TITLE_CATEGORY_ORDER 에 라벨/순서 등록.
export type TitleCategory =
  | "battle"
  | "quest"
  | "exploration"
  | "town"
  | "training"
  | "economy"
  | "character"
  | "guild"
  | "tower"
  | "endgame"
  | "pvp"
  | "fishing"
  | "treasure"
  | "collection";

export type Title = {
  id: TitleId;
  name: string;
  description: string;
  /** 사용자가 도감에서 보게 될 획득 조건 설명. */
  condition: string;
  /** 도감 섹션 그루핑용. */
  category: TitleCategory;
};

// 도감에서의 섹션 순서 + 한글 라벨. 위에서 아래로 노출.
export const TITLE_CATEGORY_ORDER: readonly {
  id: TitleCategory;
  label: string;
}[] = [
  { id: "battle", label: "전투" },
  { id: "quest", label: "의뢰" },
  { id: "exploration", label: "탐험" },
  { id: "town", label: "마을" },
  { id: "training", label: "단련" },
  { id: "economy", label: "경제" },
  { id: "character", label: "캐릭터" },
  { id: "guild", label: "길드" },
  { id: "tower", label: "탑" },
  { id: "endgame", label: "별의 옥좌" },
  { id: "pvp", label: "투기장" },
  { id: "fishing", label: "낚시" },
  { id: "treasure", label: "발굴" },
  { id: "collection", label: "수집" },
];

export const TITLES: Record<TitleId, Title> = {
  first_blood: {
    id: "first_blood",
    name: "초보 사냥꾼",
    description: "처음으로 몬스터를 쓰러뜨린 자.",
    condition: "몬스터 1마리 처치",
    category: "battle",
  },
  frail: {
    id: "frail",
    name: "약골",
    description: "수 차례 쓰러져도 다시 일어선 자. 자랑은 아니다.",
    condition: "전투 패배 10회",
    category: "battle",
  },
  chatterbox: {
    id: "chatterbox",
    name: "수다쟁이",
    description: "광장에 말을 자주 얹는 자.",
    condition: "글로벌 채팅 100회 발화",
    category: "town",
  },
  patient: {
    id: "patient",
    name: "환자",
    description: "치료소 단골. 의사와 안면을 텄다.",
    condition: "치료소 50회 이용",
    category: "town",
  },
  early_bird: {
    id: "early_bird",
    name: "새벽반",
    description: "남들이 잘 때 모험을 떠나는 자.",
    condition: "새벽 3~5시 접속",
    category: "exploration",
  },
  training_apprentice: {
    id: "training_apprentice",
    name: "수련생",
    description: "훈련의 첫 호흡을 익힌 자.",
    condition: "훈련 50회 완료",
    category: "training",
  },
  training_blackbelt: {
    id: "training_blackbelt",
    name: "유단자",
    description: "땀으로 다져진 몸. 가벼운 한 걸음에도 무게가 실린다.",
    condition: "훈련 100회 완료",
    category: "training",
  },
  merchant: {
    id: "merchant",
    name: "상인",
    description: "상점에 같은 물건을 잔뜩 넘겨 단골이 된 자.",
    condition: "한 종류의 재료를 상점에 100개 이상 판매",
    category: "town",
  },
  unfilial: {
    id: "unfilial",
    name: "불효자",
    description: "어머니가 손수 챙겨 준 부적을 두 푼 돈에 넘긴 자.",
    condition: "엄마가 준 부적을 상점에 판매",
    category: "town",
  },
  diola_friend: {
    id: "diola_friend",
    name: "디올라의 친구",
    description: "안개 호숫가의 작은 어촌이 그를 식구처럼 받아들였다.",
    condition: "촌장 마린의 의뢰까지 모두 완수",
    category: "quest",
  },
  mountain_friend: {
    id: "mountain_friend",
    name: "산정의 벗",
    description: "잠들지 않던 것을 잠재우고, 구름 위 마을의 숨을 되돌린 자.",
    condition: "운향: 노촌장 백운의 '운봉의 거인' 의뢰 완수",
    category: "quest",
  },
  saltmarsh_friend: {
    id: "saltmarsh_friend",
    name: "소만의 식구",
    description: "암초 밑에서 뒤척이던 것을 가라앉히고, 마른 그물을 다시 채운 자.",
    condition: "소만: 원로 여울의 '수심의 것' 의뢰 완수",
    category: "quest",
  },
  dustford_friend: {
    id: "dustford_friend",
    name: "마른나루의 식구",
    description: "한 세대 동안 빈 벽을 지키던 옛 성문지기를 잠재우고, 메마른 포구가 성채를 되찾게 한 자.",
    condition: "마른나루: 옛 수비대장 무진의 '옛 성문지기' 의뢰 완수",
    category: "quest",
  },
  pristine_warden: {
    id: "pristine_warden",
    name: "흠 없는 수문장",
    description: "빗장 한 번 닿지 않고 옛 성문지기를 잠재운 자. 옛 수비대도 그렇게 했다 한다.",
    condition: "마른나루: 무진의 '흠 없는 한 수' 의뢰 완수 (HP 70% 이상 유지하며 처치)",
    category: "quest",
  },
  bare_hands_warden: {
    id: "bare_hands_warden",
    name: "맨몸의 수문장",
    description: "약 주머니에 손도 대지 않고 옛 성문지기를 잠재운 자. 가진 것만으로 한 식구가 된다.",
    condition: "마른나루: 무진의 '맨몸의 한 수' 의뢰 완수 (포션 사용 없이 처치)",
    category: "quest",
  },
  last_garrison: {
    id: "last_garrison",
    name: "마지막 수비대",
    description: "수비대 도검·사슬갑옷·성문지기의 핵을 한 복으로 갖춘 자. 한 세대 뒤에 옛 수비대가 다시 섰다.",
    condition: "마른나루: 무진의 '수비대 한 복' 의뢰 완수",
    category: "quest",
  },
  pristine_diver: {
    id: "pristine_diver",
    name: "흠 없는 잠수부",
    description: "소용돌이가 등을 핥기 전에 수심의 것을 가라앉힌 자. 옛 잠수부도 그렇게 들어갔다 한다.",
    condition: "소만: 여울의 '흠 없는 한 잠수' 의뢰 완수 (HP 70% 이상 유지하며 처치)",
    category: "quest",
  },
  dry_diver: {
    id: "dry_diver",
    name: "마른 잠수부",
    description: "약 주머니에 손도 대지 않고 수심의 것을 가라앉힌 자. 가진 숨만으로 깊이를 견딘다.",
    condition: "소만: 여울의 '마른 한 잠수' 의뢰 완수 (포션 사용 없이 처치)",
    category: "quest",
  },
  abyssal_envoy: {
    id: "abyssal_envoy",
    name: "심연의 사절",
    description: "심연 칼날·사이렌 노래 망토·수심의 핵을 한 복으로 갖춘 자. 한 세대 뒤에 옛 잠수부가 다시 섰다.",
    condition: "소만: 여울의 '심연의 한 복' 의뢰 완수",
    category: "quest",
  },
  ridge_crosser: {
    id: "ridge_crosser",
    name: "능선을 넘은 자",
    description: "화염 능선을 넘어 천공 성지의 마지막 봉인을 다시 채운 자.",
    condition: "천공 성지: 원로 해무의 봉인 라인('마지막 자물쇠') 완수",
    category: "quest",
  },
  herbalists_courier: {
    id: "herbalists_courier",
    name: "약초꾼의 전령",
    description: "산정의 약초를 안개 호숫가까지 실어 나른 자. 두 약초꾼이 그를 기억한다.",
    condition: "운향 약초꾼 산하의 '디올라로 보내는 약초' 완수",
    category: "quest",
  },
  boss_hunter: {
    id: "boss_hunter",
    name: "보스 사냥꾼",
    description: "광맥의 수호자, 운봉의 거인, 화산의 심장. 세 거대한 것을 각각 열 번 잠재운 자.",
    condition: "세 보스 누적 사냥 의뢰(지미·백운·검) 모두 완수",
    category: "quest",
  },
  caravan_warden: {
    id: "caravan_warden",
    name: "대상의 수호자",
    description: "바람골 대상의 짐수레가 운저 평원을 무사히 건너게 한 자.",
    condition: "바람골 상인 노을의 호위 의뢰(약탈자·초원 매) 모두 완수",
    category: "quest",
  },
  lucky_finder: {
    id: "lucky_finder",
    name: "운 좋은 손",
    description: "유실된 명품을 둘 이상 그러모은 자. 옛 노래대로 행운이 따라붙는다.",
    condition: "유실된 명품(unique 등급) 2종 보유 후 바람골 음유시인과 대화",
    category: "exploration",
  },
  cipher_bearer: {
    id: "cipher_bearer",
    name: "표식을 든 자",
    description: "후드 쓴 손님과 북쪽 순례자가 같은 손이 그은 표식을 따른다는 걸 알아낸 자.",
    condition: "디올라 후드 손님과 운향 순례자 사이의 표식을 잇는다",
    category: "exploration",
  },
  hero_sword_heir: {
    id: "hero_sword_heir",
    name: "영웅검의 계승자",
    description: "폐허에 묻혀 있던 부러진 윗동강을, 산정의 대장장이 손에서 한 자루로 되살려 든 자.",
    condition: "운향 만월의 '부러진 영웅검' 복원 의뢰 완수",
    category: "quest",
  },
  beggar: {
    id: "beggar",
    name: "거지",
    description: "한 푼 없는 신세를 한 번이라도 겪은 자.",
    condition: "보유 골드 0 도달",
    category: "economy",
  },
  phisher: {
    id: "phisher",
    name: "보이스피싱범",
    description: "한 사람을 붙들고 백 번을 캐물은 자. 의심받기 충분하다.",
    condition: "동일 NPC 와 100회 대화",
    category: "town",
  },
  guild_founder: {
    id: "guild_founder",
    name: "창립자",
    description: "직접 깃발을 세워 길드를 연 자.",
    condition: "길드 창설",
    category: "guild",
  },
  guild_member: {
    id: "guild_member",
    name: "사원",
    description: "어느 깃발 아래 처음 이름을 올린 자.",
    condition: "길드 가입",
    category: "guild",
  },
  unknown_soldier: {
    id: "unknown_soldier",
    name: "무명소졸",
    description: "이름 없는 자리에서 거듭 쓰러져도 또 일어선 자.",
    condition: "전투 패배 100회",
    category: "battle",
  },
  one_track: {
    id: "one_track",
    name: "외골수",
    description: "한 길에만 모든 것을 쏟아부은 자. 다른 길은 보이지 않았다.",
    condition: "한 스탯 30 이상, 나머지 모두 10 이하",
    category: "character",
  },
  giant_slayer: {
    id: "giant_slayer",
    name: "거인살해자",
    description: "운봉의 거인을 자기 손으로 베어낸 자. 산정의 메아리가 그를 기억한다.",
    condition: "운봉의 거인 처치",
    category: "battle",
  },
  star_keeper: {
    id: "star_keeper",
    name: "별을 지킨 자",
    description: "별의 첨탑 정상에 잠든 수호자를 자기 손으로 베어낸 자. 별빛이 그를 기억한다.",
    condition: "별을 지키는 자 처치",
    category: "battle",
  },
  skyfolk_slayer: {
    id: "skyfolk_slayer",
    name: "선인의 폐도 마지막 자",
    description: "옛 천공인의 마지막 왕을 자기 손으로 베어낸 자. 폐도에 남은 별빛이 그를 알아본다.",
    condition: "천공인의 왕 처치",
    category: "battle",
  },
  apex_slayer: {
    id: "apex_slayer",
    name: "창공의 옥좌 마지막 자",
    description: "창공의 주재를 자기 손으로 베어낸 자. 옥좌 위 별빛이 마침내 한 사람의 결을 알아본다.",
    condition: "창공의 주재 처치",
    category: "battle",
  },
  // ── 보스 첫 처치 칭호 (협동 보스 토벌, coopBosses) ────────────────
  v2_boss_mountain: {
    id: "v2_boss_mountain",
    name: "산을 넘은 자",
    description: "산길의 두목을 자기 손으로 쓰러뜨리고 그 너머로 발을 내디딘 자.",
    condition: "산적 두목 보스 처치",
    category: "battle",
  },
  v2_boss_canyon: {
    id: "v2_boss_canyon",
    name: "협곡의 지배자",
    description: "마른 협곡을 지배하던 포식자를 베어내고 그 자리를 대신한 자.",
    condition: "마른 협곡 보스 처치",
    category: "battle",
  },
  v2_boss_lake: {
    id: "v2_boss_lake",
    name: "얼음을 깨뜨린 자",
    description: "얼어붙은 호수 깊은 곳의 군주를 끌어내려 그 한기를 잠재운 자.",
    condition: "얼음 호수 보스 처치",
    category: "battle",
  },
  // ── 5막 잔영 처치 칭호 3종 + 셋 모두 처치 시 컬렉션 칭호 ────────────────────
  starlit_giant_breaker: {
    id: "starlit_giant_breaker",
    name: "거인 잔영을 가라앉힌 자",
    description: "별빛으로 다시 깨어난 운봉의 거인 잔영을 자기 손으로 베어낸 자. 옛 산정의 결이 다시 자기 자리에 가라앉는다.",
    condition: "별빛 거인 잔영 처치",
    category: "endgame",
  },
  starlit_depth_breaker: {
    id: "starlit_depth_breaker",
    name: "수심의 메아리를 가라앉힌 자",
    description: "별빛 한 음절을 새로 부르던 수심의 메아리를 자기 손으로 베어낸 자. 산호초 너머 안개가 다시 한 결로 가라앉는다.",
    condition: "수심의 메아리 처치",
    category: "endgame",
  },
  starlit_gate_breaker: {
    id: "starlit_gate_breaker",
    name: "성문지기 잔영을 가라앉힌 자",
    description: "별빛에 다시 들렸던 성문의 빗장을 마지막으로 내린 자. 옛 변경 성채가 다시 한 결로 가라앉는다.",
    condition: "성문지기 잔영 처치",
    category: "endgame",
  },
  starlit_quietener: {
    id: "starlit_quietener",
    name: "별빛을 가라앉힌 자",
    description: "잔영 셋의 결을 모두 자기 손으로 가라앉힌 자. 흩어졌던 별빛이 한 자리에 모이는 자리에서. 자기 결 위에 가지런히 가라앉는다.",
    condition: "거인 잔영·수심의 메아리·성문지기 잔영 셋 모두 처치",
    category: "endgame",
  },
  apex_sealer: {
    id: "apex_sealer",
    name: "옥좌의 봉인자",
    description: "옥좌 위에 흩어진 빛을 다시 옥좌에 돌려놓은 자. 별빛이 다시 묶이고, 세상이 사람의 자리로 돌아왔다.",
    condition: "창공의 주재 처치 후 별바다 노수호자 유성 앞에서: 옥좌를 다시 봉인한다.",
    category: "endgame",
  },
  apex_inheritor: {
    id: "apex_inheritor",
    name: "새로운 옥좌의 주재",
    description: "옥좌에 앉은 자. 별빛이 다음 주재를 받아 갔다. 이제 부르는 자는 그 자신이다.",
    condition: "창공의 주재 처치 후 별바다 노수호자 유성 앞에서: 옥좌에 앉는다.",
    category: "endgame",
  },
  primordial_slayer: {
    id: "primordial_slayer",
    name: "태고의 노룡 마지막 자",
    description: "태고의 노룡을 홀로 절반 이상 깎아낸 자. 어미의 잿빛 비늘이 마지막에 한 사람의 결을 새긴다.",
    condition: "태고의 노룡 월드 보스 처치에서 누적 데미지 60% 이상 (legend 티어)",
    category: "battle",
  },
  // 6막 「별을 잊은 것」 — 잊힌 봉인 월드 레이드 legend 티어 칭호.
  forgotten_star_slayer: {
    id: "forgotten_star_slayer",
    name: "잊힌 것을 기억한 자",
    description: "별빛도 온기도 잊은 것을, 끝내 잊지 않고 잠재운 자. 시린 결이 한 사람의 이름을 기억한다.",
    condition: "잊힌 봉인 월드 보스에서 누적 데미지 60% 이상 (legend 티어)",
    category: "endgame",
  },
  // ── 후반 3보스 도전 칭호 (3 보스 × 3 종 = 9) — 유성 도전 의뢰 라인 보상.
  // 2026-05-19 협동→솔로 전환 + 카운트 축소(survive ×2→×1) 이후 condition 갱신.
  starlight_witness: {
    id: "starlight_witness",
    name: "별빛의 증인",
    description: "별을 지키는 자에게 깊이 결을 새긴 자. 별빛이 한 번이라도 자네를 알아봤다.",
    condition: "별을 지키는 자 처치",
    category: "endgame",
  },
  starlight_striker: {
    id: "starlight_striker",
    name: "별빛 한 줄기",
    description: "한 결로 별을 흔들었던 자. 한 자루의 손이 빛을 가른다.",
    condition: "HP 70% 이상 유지한 채 별을 지키는 자 처치",
    category: "endgame",
  },
  starlight_steadfast: {
    id: "starlight_steadfast",
    name: "흔들리지 않는 결",
    description: "별을 지키는 자 앞에서도 결을 한 점도 흩지 않은 자.",
    condition: "포션 없이 별을 지키는 자 처치",
    category: "endgame",
  },
  ruin_witness: {
    id: "ruin_witness",
    name: "폐도의 증인",
    description: "천공인의 왕에게 결을 깊이 새긴 자. 폐도가 처음 자네를 알아봤다.",
    condition: "천공인의 왕 처치",
    category: "endgame",
  },
  ruin_striker: {
    id: "ruin_striker",
    name: "폐도의 일격",
    description: "한 결로 폐도의 왕을 흔든 자. 한 자루의 손이 옛 결을 가른다.",
    condition: "HP 70% 이상 유지한 채 천공인의 왕 처치",
    category: "endgame",
  },
  ruin_steadfast: {
    id: "ruin_steadfast",
    name: "폐도를 견디는 자",
    description: "천공인의 왕 앞에서도 단 한 점의 결도 흩지 않은 자.",
    condition: "포션 없이 천공인의 왕 처치",
    category: "endgame",
  },
  throne_witness: {
    id: "throne_witness",
    name: "옥좌의 증인",
    description: "창공의 주재에게 결을 깊이 새긴 자. 옥좌가 처음 자네를 알아봤다.",
    condition: "창공의 주재 처치",
    category: "endgame",
  },
  throne_striker: {
    id: "throne_striker",
    name: "옥좌의 일격",
    description: "한 결로 옥좌를 흔든 자. 한 자루의 손이 별빛의 끝을 가른다.",
    condition: "HP 70% 이상 유지한 채 창공의 주재 처치",
    category: "endgame",
  },
  throne_steadfast: {
    id: "throne_steadfast",
    name: "옥좌를 견디는 자",
    description: "창공의 주재 앞에서도 단 한 점의 결도 흩지 않은 자. 옥좌가 자네를 기억한다.",
    condition: "포션 없이 창공의 주재 처치",
    category: "endgame",
  },
  level_30: {
    id: "level_30",
    name: "베테랑",
    description: "수많은 전장에서 살아남은 자. 한 발 한 발이 가볍지 않다.",
    condition: "레벨 30 도달",
    category: "character",
  },
  level_50: {
    id: "level_50",
    name: "전설",
    description: "묘비에도 이름이 새겨질 자. 전장마다 흔적이 남는다.",
    condition: "레벨 50 도달",
    category: "character",
  },
  level_70: {
    id: "level_70",
    name: "신화",
    description: "이야기가 전설이 되고, 전설이 신화가 된 자.",
    condition: "레벨 70 도달",
    category: "character",
  },
  level_100: {
    id: "level_100",
    name: "초월",
    description: "신화 너머에 발을 디딘 자. 사람의 한계를 넘어선 자.",
    condition: "레벨 100 도달 (만렙)",
    category: "character",
  },
  wealthy: {
    id: "wealthy",
    name: "부자",
    description: "지갑이 두툼해진 자. 호주머니의 무게가 발걸음을 늦춘다.",
    condition: "보유 골드 10,000 도달",
    category: "economy",
  },
  closed_shop: {
    id: "closed_shop",
    name: "폐업점주",
    description: "직접 세운 깃발을 직접 내린 자. 정리는 시작보다 어렵다.",
    condition: "본인이 마스터인 길드 해체",
    category: "guild",
  },
  stagnant: {
    id: "stagnant",
    name: "고인물",
    description: "맨몸으로도 보스 앞에 선 자. 장비 따위는 거추장스러워졌다.",
    condition: "장비 미착용 상태로 보스 도전",
    category: "battle",
  },
  nouveau_riche: {
    id: "nouveau_riche",
    name: "졸부",
    description: "지갑이 터질 듯하다. 굳이 티는 내지 말자… 라기엔 이미 티가 난다.",
    condition: "보유 골드 1,000,000 도달",
    category: "economy",
  },
  well_rounded: {
    id: "well_rounded",
    name: "골고루",
    description: "이것저것 다 조금씩 찍은 자. 모난 데 없는 게 장점이라면 장점이다.",
    condition: "모든 스탯 15 이상이면서 최댓값과 최솟값 차이 4 이하",
    category: "character",
  },
  devoted_listener: {
    id: "devoted_listener",
    name: "전속 청취자",
    description: "같은 사람을 오백 번 붙들었다. 이젠 그쪽이 먼저 안부를 묻는다.",
    condition: "동일 NPC 와 500회 대화",
    category: "town",
  },
  marathoner: {
    id: "marathoner",
    name: "마라토너",
    description: "천 번을 훈련한 자. 운동이 일상을 지나 인생이 됐다.",
    condition: "훈련 1,000회 완료",
    category: "training",
  },
  town_broadcaster: {
    id: "town_broadcaster",
    name: "마을 방송국",
    description: "광장 채팅창이 곧 그의 일기장. 마을 사람 모두가 그의 근황을 안다.",
    condition: "글로벌 채팅 3,000회 발화",
    category: "town",
  },
  head_patient: {
    id: "head_patient",
    name: "수석 환자",
    description: "치료소가 명예의 전당 헌액을 진지하게 검토 중이다.",
    condition: "치료소 500회 이용",
    category: "town",
  },
  close_call: {
    id: "close_call",
    name: "구사일생",
    description: "체력 한 칸을 부여잡고 살아남은 자. 이건 어디 가서 자랑해도 된다.",
    condition: "체력 1 남긴 채로 전투 승리",
    category: "battle",
  },
  potion_overload: {
    id: "potion_overload",
    name: "포션 폭격기",
    description: "한 전투에서 포션을 다섯 병이나 들이부은 자. 회복 효율보단 손맛이다.",
    condition: "한 전투에서 포션 5병 이상 사용",
    category: "battle",
  },
  night_owl: {
    id: "night_owl",
    name: "야행성",
    description: "남들 다 잘 때 칼을 휘두르는 자. 해는 적이다.",
    condition: "자정~새벽 3시 사이 접속",
    category: "exploration",
  },
  globetrotter: {
    id: "globetrotter",
    name: "방방곡곡",
    description: "세상 끝에서 끝까지 발자국을 남긴 자. 발바닥에 굳은살이 박였다.",
    condition: "모든 지역 방문",
    category: "exploration",
  },
  masterwork: {
    id: "masterwork",
    name: "명장",
    description: "망치질에 신이 깃든 자. 손끝에서 걸작이 나왔다.",
    condition: "제작으로 '걸작' 등급 장비 획득",
    category: "economy",
  },
  botched: {
    id: "botched",
    name: "불량품 제작자",
    description: "최선을 다했는데 불량품이 나왔다. 누구에게나 그런 날이 있다.",
    condition: "제작으로 '불량' 등급 장비 획득",
    category: "economy",
  },
  young_rich: {
    id: "young_rich",
    name: "어린 부자",
    description: "레벨은 낮은데 지갑만 두툼하다. 운이 좋았거나, 안 자고 했거나.",
    condition: "레벨 10 미만 + 보유 골드 100,000 도달",
    category: "economy",
  },
  // 고탑 주간 백분위 — 매주 마감 시 cron 이 batch 부여. F30 이상 자격.
  tower_weekly_top_1: {
    id: "tower_weekly_top_1",
    name: "고탑의 최상위",
    description:
      "한 주의 고탑 정상에 발을 디딘 자. 다른 모험가들이 올려다보는 자리에 섰다.",
    condition: "주간 고탑 최고층 상위 1% (F30 이상 자격)",
    category: "tower",
  },
  tower_weekly_top_5: {
    id: "tower_weekly_top_5",
    name: "고탑의 정상권",
    description: "한 주의 고탑 상위 5%. 끝까지 올라가 본 자만 아는 풍경.",
    condition: "주간 고탑 최고층 상위 5% (F30 이상 자격)",
    category: "tower",
  },
  tower_weekly_top_10: {
    id: "tower_weekly_top_10",
    name: "고탑의 상위",
    description: "한 주의 고탑 상위 10%. 꾸준히 위를 본 자.",
    condition: "주간 고탑 최고층 상위 10% (F30 이상 자격)",
    category: "tower",
  },
  tower_weekly_top_25: {
    id: "tower_weekly_top_25",
    name: "고탑의 추격자",
    description: "한 주의 고탑 상위 25%. 위만 보고 한 주를 쫓아 올라간 자.",
    condition: "주간 고탑 최고층 상위 25% (F30 이상 자격)",
    category: "tower",
  },
  tower_weekly_top_50: {
    id: "tower_weekly_top_50",
    name: "고탑의 등반가",
    description: "한 주의 고탑 상위 절반. 그 주의 절반보다는 앞에 섰다.",
    condition: "주간 고탑 최고층 상위 50% (F30 이상 자격)",
    category: "tower",
  },
  // 고탑 도전 모드 — F50 보스 클리어 단일 칭호. 1.5× 고정 스케일링, 매번 F1 부터, 칭호만 보상.
  tower_challenge_f50: {
    id: "tower_challenge_f50",
    name: "고탑의 도전자",
    description:
      "1.5배의 무게가 얹힌 고탑을, 발판도 없이 50층까지 올라간 자. 같은 자리에서 다시 시작해 끝내 그 층의 보스 앞에 섰고. 잠재웠다.",
    condition: "도전 모드 고탑 F50 보스 클리어",
    category: "tower",
  },
  // ── 5막 「빈 옥좌의 시대」 종착 칭호 ───────────────────────────────────────
  starfall_keeper: {
    id: "starfall_keeper",
    name: "별빛을 놓은 자",
    description:
      "옛 봉인 자리에 떨어진 별빛 셋을 거두어, 누구의 것도 아닌 자리에 놓아 준 자. 옥좌의 환영을 자기 손에서 풀어 주었고, 별바다의 노수호자가 마지막 한 잔을 따라 준 자리에 그를 두고 떠났다.",
    condition: "Ch 30 「별을 놓는 자」 완료: 5막 종착 의식",
    category: "endgame",
  },
  // ── 투기장 상점 칭호 (투기장 코인으로 구매) ──────────────────────────────
  pvp_gladiator: {
    id: "pvp_gladiator",
    name: "검투사",
    description: "투기장의 모래밭에 첫발을 디딘 자.",
    condition: "투기장 상점에서 투기장 코인 200으로 구매",
    category: "pvp",
  },
  pvp_veteran: {
    id: "pvp_veteran",
    name: "맹장",
    description: "수많은 결투를 헤쳐 온 맹렬한 투사.",
    condition: "투기장 상점에서 투기장 코인 600으로 구매",
    category: "pvp",
  },
  pvp_overlord: {
    id: "pvp_overlord",
    name: "패왕",
    description: "투기장을 호령하며 모든 도전을 짓밟은 지배자.",
    condition: "투기장 상점에서 투기장 코인 1200으로 구매",
    category: "pvp",
  },
  pvp_legend: {
    id: "pvp_legend",
    name: "전설",
    description: "투기장의 전설로 길이 회자되는 자.",
    condition: "투기장 상점에서 투기장 코인 2500으로 구매",
    category: "pvp",
  },
  // ── 낚시 코인 상점 칭호 (낚시 코인으로 구매) ──────────────────────────────
  fishing_taegong: {
    id: "fishing_taegong",
    name: "강태공",
    description: "물가에 앉아 세월을 낚는 느긋한 손맛의 주인.",
    condition: "낚시 코인 상점에서 낚시 코인 150으로 구매",
    category: "fishing",
  },
  fishing_trophy: {
    id: "fishing_trophy",
    name: "월척 사냥꾼",
    description: "한 자가 넘는 대물만 노리는 집념의 낚시꾼.",
    condition: "낚시 코인 상점에서 낚시 코인 600으로 구매",
    category: "fishing",
  },
  fishing_deepsea: {
    id: "fishing_deepsea",
    name: "심해의 어부",
    description: "깊고 어두운 바다의 괴물조차 끌어올리는 자.",
    condition: "낚시 코인 상점에서 낚시 코인 1500으로 구매",
    category: "fishing",
  },
  fishing_legend: {
    id: "fishing_legend",
    name: "바다의 전설",
    description: "어보의 모든 페이지에 이름을 남긴 낚시의 전설.",
    condition: "낚시 코인 상점에서 낚시 코인 3500으로 구매",
    category: "fishing",
  },
  fishing_dawnangler: {
    id: "fishing_dawnangler",
    name: "여명의 낚시꾼",
    description: "동트는 물가에서 첫 입질을 기다리는 부지런한 손.",
    condition: "낚시 코인 상점에서 낚시 코인 250으로 구매",
    category: "fishing",
  },
  fishing_tidereader: {
    id: "fishing_tidereader",
    name: "물때를 읽는 자",
    description: "물때의 흐름을 꿰어, 손님이 드는 때를 놓치지 않는 자.",
    condition: "낚시 코인 상점에서 낚시 코인 900으로 구매",
    category: "fishing",
  },
  fishing_specialguest: {
    id: "fishing_specialguest",
    name: "특별한 손님의 벗",
    description: "여명과 별빛, 물안개와 폭풍, 모든 물때의 손님과 인사를 나눈 자.",
    condition: "낚시 코인 상점에서 낚시 코인 2200으로 구매",
    category: "fishing",
  },
  treasure_digger: {
    id: "treasure_digger",
    name: "흙먼지 사냥꾼",
    description: "흙을 뒤져 옛 시대의 부스러기를 모으는 부지런한 손.",
    condition: "발굴 코인 상점에서 발굴 코인 60으로 구매",
    category: "treasure",
  },
  treasure_curator: {
    id: "treasure_curator",
    name: "골동품 수집가",
    description: "남들이 흘려보낸 물건의 가치를 알아보는 눈.",
    condition: "발굴 코인 상점에서 발굴 코인 250으로 구매",
    category: "treasure",
  },
  treasure_relic: {
    id: "treasure_relic",
    name: "유물 추적자",
    description: "지도 한 조각으로 잊힌 보물의 행방을 좇는 자.",
    condition: "발굴 코인 상점에서 발굴 코인 700으로 구매",
    category: "treasure",
  },
  treasure_legend: {
    id: "treasure_legend",
    name: "트레져 헌터",
    description: "전설로만 전하던 유물을 끝내 땅속에서 끌어올린 발굴의 대가.",
    condition: "발굴 코인 상점에서 발굴 코인 2000으로 구매",
    category: "treasure",
  },
  // 수집 칭호 — ⚠️ 레거시(2026-06: 수집 포인트/칭호 상점 폐지·불필요한 복잡도). 신규 획득 경로
  //   없음. 옛 상점에서 구매한 보유분이 정상 표시되도록 정의만 보존(비파괴). 새 칭호로 재사용 금지.
  coll_wanderer: {
    id: "coll_wanderer",
    name: "여러 길을 걷는 자",
    description: "여러 직업의 길을 두루 거쳐온 자.",
    condition: "수집 칭호 상점에서 수집 포인트 2로 획득",
    category: "collection",
  },
  coll_jack: {
    id: "coll_jack",
    name: "재간꾼",
    description: "어느 길에서도 한몫하는 재간을 갖춘 자.",
    condition: "수집 칭호 상점에서 수집 포인트 4로 획득",
    category: "collection",
  },
  coll_collector: {
    id: "coll_collector",
    name: "비기 수집가",
    description: "직업마다의 비기를 차곡차곡 모으는 자.",
    condition: "수집 칭호 상점에서 수집 포인트 6으로 획득",
    category: "collection",
  },
  coll_polymath: {
    id: "coll_polymath",
    name: "백가의 벗",
    description: "온갖 갈래와 어깨를 나란히 한 자.",
    condition: "수집 칭호 상점에서 수집 포인트 8로 획득",
    category: "collection",
  },
  coll_pathmaster: {
    id: "coll_pathmaster",
    name: "길을 손에 쥔 자",
    description: "수많은 길을 제 것으로 삼은 자.",
    condition: "수집 칭호 상점에서 수집 포인트 10으로 획득",
    category: "collection",
  },
};

// 카운터 기반 칭호 — 진행도 source 와 임계값을 한 곳에 정리.
// 1) 임계값 도달 시 자동 등록 (page.tsx 의 useEffect 가 이 표를 돌면서 grantTitle).
// 2) 절반 도달 시 모험의 서에서 조건만 미리 공개 (이름은 여전히 ???).
export type TitleCounterKey =
  | "battleLosses"
  | "trainingCount"
  | "chatCount"
  | "healingCount"
  | "npcTalkCount";

export const COUNTER_TITLES: {
  id: TitleId;
  key: TitleCounterKey;
  target: number;
}[] = [
  { id: "frail", key: "battleLosses", target: 10 },
  { id: "unknown_soldier", key: "battleLosses", target: 100 },
  { id: "training_apprentice", key: "trainingCount", target: 50 },
  { id: "training_blackbelt", key: "trainingCount", target: 100 },
  { id: "marathoner", key: "trainingCount", target: 1000 },
  { id: "chatterbox", key: "chatCount", target: 100 },
  { id: "town_broadcaster", key: "chatCount", target: 3000 },
  { id: "patient", key: "healingCount", target: 50 },
  { id: "head_patient", key: "healingCount", target: 500 },
  // NPC 1인 누적 대화 — 한 사람을 얼마나 붙들었나. 카운터는 NPC 별 talkCount 의 최댓값.
  { id: "phisher", key: "npcTalkCount", target: 100 },
  { id: "devoted_listener", key: "npcTalkCount", target: 500 },
];

export function getTitle(id: TitleId | null | undefined): Title | undefined {
  if (!id) return undefined;
  return TITLES[id];
}

// 옛 칭호 ID 가 옛 임계값에 묶여 있어(임계값이 바뀌어도 ID 가 그대로) 의미 흐트러진
// 케이스를 의미적 ID 로 옮기는 매핑. adventure-log 로드 시 storage.migrateTitles 가
// 적용 — 구 ID 가 보유 상태면 신 ID 로 옮긴다 (idempotent).
export const TITLE_RENAMES: Record<string, string> = {
  training_10: "training_apprentice", // 50회
  training_50: "training_blackbelt", // 100회
  // training_100 → training_master 매핑은 PR-5 에서 training_master 자체가 삭제되며 제거.
  // 옛 보유분은 log.titles 에 dormant key 로 그대로 남는다 (도감에는 안 보임).
};
