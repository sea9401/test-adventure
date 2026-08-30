// 스킬북 — 사용하면 AP 스킬을 학습 (캐릭터의 learnedAPSkills 추가) 후 소비되는 아이템.
// 한 번 학습한 스킬은 같은 책을 또 써도 효과 X (UI 가 사용 차단). 거래 정책:
// - 드랍·NPC 판매로 풀린 책: 마켓 거래 가능
// - 히든 퀘스트·업적 보상: 귀속 (tradable: false)

import type { APSkillId } from "@/adventure/character/apSkills";

export type SkillBookId =
  | "book_shadow_cut"
  | "book_extra_evade"
  | "book_mending"
  | "book_heaven_slay"
  | "book_deep_wound"
  | "book_resolve"
  | "book_expose_weakness"
  | "book_madness"
  | "book_slow"
  | "book_frenzy"
  | "book_focused_breath"
  | "book_combo_strike"
  | "book_storm_strike"
  | "book_mad_slash"
  | "book_thunder_strike"
  | "book_light_glide"
  | "book_purify"
  | "book_afterimage"
  | "book_lifesteal"
  // 5막 「빈 옥좌의 시대」 — 별빛 깃든 기예 6종. 노수호자 유성 보상. 귀속.
  | "book_starlit_mending"
  | "book_starlit_cut"
  | "book_starlit_knot"
  | "book_starlit_chill"
  | "book_starlit_sever"
  | "book_starlit_scatter";

export type SkillBook = {
  id: SkillBookId;
  name: string;
  description: string;
  /** 학습 대상 AP 스킬 (apSkills.ts 의 id). */
  learnsSkillId: APSkillId;
  /** NPC 판매가. NPC 가 안 팔면 undefined. */
  price?: number;
  /** 마켓 거래 가능 여부. 히든·업적 보상은 false. */
  tradable: boolean;
};

export const SKILL_BOOKS: Record<SkillBookId, SkillBook> = {
  book_shadow_cut: {
    id: "book_shadow_cut",
    name: "스킬북: 그림자 베기",
    description:
      "검광이 그림자처럼 미끄러져 적의 갑옷을 비껴간다. 사용하면 '그림자 베기' (AP 3) 를 학습한다.",
    learnsSkillId: "shadow_cut",
    price: 1500,
    tradable: true,
  },
  book_extra_evade: {
    id: "book_extra_evade",
    name: "스킬북: 추가 회피",
    description:
      "산적이 흘리고 간 너덜너덜한 보법서. 사용하면 '추가 회피' (AP 1) 를 학습한다.",
    learnsSkillId: "extra_evade",
    tradable: true,
  },
  book_mending: {
    id: "book_mending",
    name: "스킬북: 회복술",
    description:
      "낡은 약초학 필사본. 사용하면 '회복술' (AP 3) 을 학습한다.",
    learnsSkillId: "mending",
    price: 800,
    tradable: true,
  },
  book_heaven_slay: {
    id: "book_heaven_slay",
    name: "스킬북: 천살",
    description:
      "구름 위에서 내려온 검결의 잔편. 사용하면 '천살' (AP 5) 을 학습한다. 귀속.",
    learnsSkillId: "heaven_slay",
    tradable: false,
  },
  book_deep_wound: {
    id: "book_deep_wound",
    name: "스킬북: 깊은 상처",
    description:
      "수많은 보스를 베어 넘긴 자에게만 보이는 핏빛 비전서. 사용하면 '깊은 상처' (AP 3) 를 학습한다. 귀속.",
    learnsSkillId: "deep_wound",
    tradable: false,
  },
  book_resolve: {
    id: "book_resolve",
    name: "스킬북: 결의",
    description:
      "수비대 노수병이 후학에게 남긴 호흡법. 사용하면 '결의' (AP 2) 를 학습한다.",
    learnsSkillId: "resolve",
    price: 600,
    tradable: true,
  },
  book_expose_weakness: {
    id: "book_expose_weakness",
    name: "스킬북: 약점 노출",
    description:
      "사냥꾼이 짐승의 결을 읽는 법. 사용하면 '약점 노출' (AP 2) 을 학습한다.",
    learnsSkillId: "expose_weakness",
    price: 700,
    tradable: true,
  },
  book_madness: {
    id: "book_madness",
    name: "스킬북: 광기",
    description:
      "광폭화한 산적 두목이 쥐고 있던 핏물 절은 노트. 사용하면 '광기' (AP 3) 를 학습한다.",
    learnsSkillId: "madness",
    tradable: true,
  },
  book_slow: {
    id: "book_slow",
    name: "스킬북: 둔화",
    description:
      "거미줄에 휘감긴 채 발견된 사냥 비전. 사용하면 '둔화' (AP 2) 를 학습한다.",
    learnsSkillId: "slow",
    tradable: true,
  },
  book_frenzy: {
    id: "book_frenzy",
    name: "스킬북: 폭주",
    description:
      "천 마리를 잡은 자의 손이 익히는 호흡. 사용하면 '폭주' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "frenzy",
    tradable: false,
  },
  book_focused_breath: {
    id: "book_focused_breath",
    name: "스킬북: 집중의 호흡",
    description:
      "음유시인의 노래 한 구절이 호흡법으로 정리된 잔편. 사용하면 '집중의 호흡' (AP 2) 을 학습한다. 귀속.",
    learnsSkillId: "focused_breath",
    tradable: false,
  },
  book_combo_strike: {
    id: "book_combo_strike",
    name: "스킬북: 연환격",
    description:
      "늑대 무리장이 익혔던 연환의 결. 사용하면 '연환격' (AP 2) 을 학습한다.",
    learnsSkillId: "combo_strike",
    tradable: true,
  },
  book_storm_strike: {
    id: "book_storm_strike",
    name: "스킬북: 폭풍 일격",
    description:
      "구름 위 바람을 검결로 옮긴 비전서. 사용하면 '폭풍 일격' (AP 3) 을 학습한다. 귀속.",
    learnsSkillId: "storm_strike",
    tradable: false,
  },
  book_mad_slash: {
    id: "book_mad_slash",
    name: "스킬북: 광살참",
    description:
      "흠 없이 백 번을 잡아낸 자에게만 보이는 광폭의 결. 사용하면 '광살참' (AP 4) 을 학습한다. 귀속.",
    learnsSkillId: "mad_slash",
    tradable: false,
  },
  book_thunder_strike: {
    id: "book_thunder_strike",
    name: "스킬북: 천뢰 일격",
    description:
      "거인을 열 번 잠재운 자의 손이 익히는 천둥 결. 사용하면 '천뢰 일격' (AP 5) 을 학습한다. 귀속.",
    learnsSkillId: "thunder_strike",
    tradable: false,
  },
  book_light_glide: {
    id: "book_light_glide",
    name: "스킬북: 빛의 활공",
    description:
      "별바다 보스를 잠재운 자에게 별빛이 전한 결. 사용하면 '빛의 활공' (AP 5) 을 학습한다. 귀속.",
    learnsSkillId: "light_glide",
    tradable: false,
  },
  book_purify: {
    id: "book_purify",
    name: "스킬북: 정화",
    description:
      "떠도는 망령이 남긴 빛바랜 호흡법. 사용하면 '정화' (AP 1) 를 학습한다.",
    learnsSkillId: "purify",
    tradable: true,
  },
  book_afterimage: {
    id: "book_afterimage",
    name: "스킬북: 잔상",
    description:
      "그림자만 남기고 빠져나가는 보법의 결. 사용하면 '잔상' (AP 3) 을 학습한다. 귀속.",
    learnsSkillId: "afterimage",
    tradable: false,
  },
  // 5막 「빈 옥좌의 시대」 깊이 — 별빛 광맥 수호자 누적 5회 처치 보상 (지미 히든 의뢰). 귀속.
  book_lifesteal: {
    id: "book_lifesteal",
    name: "스킬북: 흡령",
    description:
      "별빛이 데워진 광맥 안에서 잔영이 데미지를 한 점씩 자기 결로 옮겨 가는 호흡법. 사용하면 '흡령' (AP 4) 을 학습한다. 귀속.",
    learnsSkillId: "lifesteal",
    tradable: false,
  },
  // ── 5막 「빈 옥좌의 시대」 — 별빛 깃든 기예 6권. 노수호자 유성의 그릇 빚기 의뢰 보상. ─
  // 별빛 조각 30 deliver 한 자에게 한꺼번에 묶음 보상 — 6권 모두 인벤에 들어간다. 귀속.
  book_starlit_mending: {
    id: "book_starlit_mending",
    name: "스킬북: 별빛 회수",
    description:
      "별빛 한 점을 가슴에 모아 옛 상처를 데우는 결. 사용하면 '별빛 회수' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "starlit_mending",
    tradable: false,
  },
  book_starlit_cut: {
    id: "book_starlit_cut",
    name: "스킬북: 잔영 베기",
    description:
      "잔영의 가장자리까지 따라가 베어 내는 결. 사용하면 '잔영 베기' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "starlit_cut",
    tradable: false,
  },
  book_starlit_knot: {
    id: "book_starlit_knot",
    name: "스킬북: 별빛 매듭",
    description:
      "별빛 한 가닥을 자기 둘레에 묶어 두 박자 동안 풀지 않는 결. 사용하면 '별빛 매듭' (AP 3) 을 학습한다. 귀속.",
    learnsSkillId: "starlit_knot",
    tradable: false,
  },
  book_starlit_chill: {
    id: "book_starlit_chill",
    name: "스킬북: 별빛 한기",
    description:
      "별빛에 데워진 한기를 상처 자리에 일곱 결로 새겨 두는 결. 사용하면 '별빛 한기' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "starlit_chill",
    tradable: false,
  },
  book_starlit_sever: {
    id: "book_starlit_sever",
    name: "스킬북: 별빛 끊기",
    description:
      "달려드는 자의 결을 별빛으로 두 번 끊어 두는 결. 사용하면 '별빛 끊기' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "starlit_sever",
    tradable: false,
  },
  book_starlit_scatter: {
    id: "book_starlit_scatter",
    name: "스킬북: 별빛 흩기",
    description:
      "별빛이 흩어지듯, 갑주도 회피도 거두지 않는 결. 사용하면 '별빛 흩기' (AP 4) 를 학습한다. 귀속.",
    learnsSkillId: "starlit_scatter",
    tradable: false,
  },
};
