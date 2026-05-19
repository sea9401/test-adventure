// 의뢰 완료 시 적용할 사이드이펙트 데이터 — 클라/서버 양쪽에서 import.
// 실제 적용 함수는 questCompletionSideEffects.ts (클라, 레거시) / lib/server/questReward.ts (서버 권위).
// EPIC #3-2 이후 서버 권위가 primary 경로. 클라 적용은 호환 fallback.

export type QuestCompletionEffect =
  | { kind: "grantTitle"; titleId: string }
  | { kind: "setFlag"; flag: string };

// 의뢰 ID → 완료 시 즉시 적용할 효과들 (전제 조건 없음).
export const ON_COMPLETE_DATA: Record<string, readonly QuestCompletionEffect[]> = {
  // 마린의 영혼 결정 의뢰 = "안개 너머의 길" 라인의 클로저.
  "diola-marin-soul-crystals": [{ kind: "grantTitle", titleId: "diola_friend" }],
  // 운향 메인 라인 "잠들지 않는 산" — 백운의 운봉의 거인 의뢰 완수.
  "unhyang-baekun-peak-giant": [
    { kind: "grantTitle", titleId: "mountain_friend" },
    { kind: "setFlag", flag: "unhyang_main_cleared" },
  ],
  // 해안 지선 메인 라인 "수심의 것" — 여울의 보스 의뢰 완수.
  "saltmarsh-yeoul-deep-one": [{ kind: "grantTitle", titleId: "saltmarsh_friend" }],
  // 여울의 보스 재도전 3종 — kill_within_hp / no_potion_boss / equip_set 검증.
  "saltmarsh-yeoul-challenge-pristine": [
    { kind: "grantTitle", titleId: "pristine_diver" },
  ],
  "saltmarsh-yeoul-challenge-no-potion": [
    { kind: "grantTitle", titleId: "dry_diver" },
  ],
  "saltmarsh-yeoul-challenge-abyssal-set": [
    { kind: "grantTitle", titleId: "abyssal_envoy" },
  ],
  // 서편 옛길 메인 라인 "옛 성문지기" — 무진의 보스 의뢰 완수.
  "dustford-mujin-gatekeeper": [{ kind: "grantTitle", titleId: "dustford_friend" }],
  // 무진의 보스 재도전 3종 — 새 quest kind(kill_within_hp/no_potion_boss/equip_set) 검증.
  "dustford-mujin-challenge-pristine": [
    { kind: "grantTitle", titleId: "pristine_warden" },
  ],
  "dustford-mujin-challenge-no-potion": [
    { kind: "grantTitle", titleId: "bare_hands_warden" },
  ],
  "dustford-mujin-challenge-garrison-set": [
    { kind: "grantTitle", titleId: "last_garrison" },
  ],
  // 천공 성지 메인 라인 "능선 너머의 봉인" — 해무의 마지막 자물쇠 완수.
  "skyreach-haemu-flame-scale": [
    { kind: "grantTitle", titleId: "ridge_crosser" },
    { kind: "setFlag", flag: "skyreach_main_cleared" },
  ],
  // 별바다 노수호자 유성 게이트 의뢰 — 천공인의 왕 / 창공의 주재 협동 보스 진입 자격.
  "star-haven-skyfolk-gate": [
    { kind: "setFlag", flag: "skyfolk_gate_cleared" },
  ],
  "star-haven-apex-gate": [{ kind: "setFlag", flag: "apex_gate_cleared" }],
  // 별바다 유성 — 후반 3보스 도전 의뢰 9종 (각 보스 × 3종) → 칭호 9개.
  "star-haven-keeper-challenge-witness": [
    { kind: "grantTitle", titleId: "starlight_witness" },
  ],
  "star-haven-keeper-challenge-strike": [
    { kind: "grantTitle", titleId: "starlight_striker" },
  ],
  "star-haven-keeper-challenge-survive": [
    { kind: "grantTitle", titleId: "starlight_steadfast" },
  ],
  "star-haven-king-challenge-witness": [
    { kind: "grantTitle", titleId: "ruin_witness" },
  ],
  "star-haven-king-challenge-strike": [
    { kind: "grantTitle", titleId: "ruin_striker" },
  ],
  "star-haven-king-challenge-survive": [
    { kind: "grantTitle", titleId: "ruin_steadfast" },
  ],
  "star-haven-arbiter-challenge-witness": [
    { kind: "grantTitle", titleId: "throne_witness" },
  ],
  "star-haven-arbiter-challenge-strike": [
    { kind: "grantTitle", titleId: "throne_striker" },
  ],
  "star-haven-arbiter-challenge-survive": [
    { kind: "grantTitle", titleId: "throne_steadfast" },
  ],
  // 마을 간 연계 — 완료 시 양쪽 NPC 다이얼로그 갱신용 flag (+ 칭호).
  "diola-marin-mountain-trade": [
    { kind: "setFlag", flag: "diola_unhyang_trade_done" },
  ],
  "unhyang-sanha-nora-herbs": [
    { kind: "setFlag", flag: "sanha_nora_herbs_sent" },
    { kind: "grantTitle", titleId: "herbalists_courier" },
  ],
  "village-jimmy-doyeon-timber": [
    { kind: "setFlag", flag: "jimmy_doyeon_timber_done" },
  ],
};

// "이 의뢰들이 모두 completed 되면 효과 적용". claim 직후 호출되므로 방금 완료한 의뢰는
// 멤버에 포함돼 있고, 나머지가 모두 completed 인지로 판정한다.
export const ON_ALL_COMPLETE_DATA: readonly {
  members: readonly string[];
  effects: readonly QuestCompletionEffect[];
}[] = [
  // 교역로 정리 2종(협곡 절벽 늑대 + 산기슭 산양) 둘 다 완료 → 디올라 연계 입구 개방.
  {
    members: ["unhyang-baekun-cliff-wolves", "unhyang-baekun-highland-goats"],
    effects: [{ kind: "setFlag", flag: "mountain_trade_open" }],
  },
  // 보스 누적 사냥 의뢰 3종(광맥의 수호자 / 운봉의 거인 / 화산의 심장) 모두 완수 → 칭호.
  {
    members: ["deep-cave-hunter", "peak-giant-hunter", "volcano-heart-hunter"],
    effects: [{ kind: "grantTitle", titleId: "boss_hunter" }],
  },
  // 바람골 노을의 호위 의뢰 2종 모두 완수 → '대상의 수호자' 칭호.
  {
    members: [
      "windvale-merchant-escort-raiders",
      "windvale-merchant-escort-hawks",
    ],
    effects: [{ kind: "grantTitle", titleId: "caravan_warden" }],
  },
];
