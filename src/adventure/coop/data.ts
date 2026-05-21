// 협동 보스 정의 — region 별 어떤 보스가 등장하는지 + maxHp 오버라이드.
// 보스 stat (atk/def/spd/페이즈 등) 은 monsters.ts 의 정의 그대로 사용.
// hp 만 협동용으로 부풀려 (monsters.ts 솔로 hp 보다 큰 maxHp).

import type { RegionId } from "@/adventure/data/world";

export type CoopBossDef = {
  /** monsters.ts 의 키. 시뮬 시 같은 stat 사용. */
  monsterName: string;
  /** 협동 버전 maxHp — monsters.ts 의 솔로 hp 와 별개로 정의. */
  maxHp: number;
  /** 보스 등장 후 만료까지 (ms). */
  expirationMs: number;
  /** 처치 또는 만료 후 다음 등장까지 (ms). */
  respawnMs: number;
  /** 보스 처치 시 set 할 storyFlag. */
  onDefeatFlag?: string;
  /** 보스에 1회 이상 attack 한 시점에 set 할 storyFlag (참여 unlock 용). */
  onAttackFlag?: string;
  /** 진입 조건 storyFlag — 셋팅 안 됐으면 보스 카드 잠금 (게이트 의뢰 완료로 풀림). */
  requiredFlag?: string;
  /** 잠금 상태에서 보여줄 메시지 (어떤 의뢰가 자격을 여는지 안내). */
  lockedMessage?: string;
  /**
   * 분당 자연회복량 — 0/미설정 이면 회복 없음 (일반 coop 보스 default).
   * 월드 보스용: GET/attack 시 lazy 로 elapsed × regen 만큼 hp 회복 (max_hp cap).
   * baseline sustain — "꾸준히 깎아야 잡힌다" 를 다인 누적 데미지에 강제.
   */
  regenPerMin?: number;
  /** true 면 보스 카드 UI 에 "월드 보스" 라벨/스타일 적용. lore drop 표시 톤 강화. */
  isWorldBoss?: boolean;
};

// 2026-05-19: 스토리 7종 (canyon/starspire/skyfolk_ruins/apex_throne/3 starlit 잔영) 솔로
// region.boss 로 전환 — 스토리 진행 시 협동 매칭 불편함 해소. 협동은 dragon_nest 월드
// 보스 1종만 유지 (엔드 농사 결). legend 1% unique 드랍·칭호는 monster.drops /
// onDefeatTitleId 로 마이그레이션. coop UI / 보상 표(rewards.ts) 는 dragon 만 노출.
export const COOP_BOSSES: Partial<Record<RegionId, CoopBossDef>> = {
  // 월드 보스 — 용비늘 묘지 너머. apex_throne 의 약 10배 HP + 7일 휴면.
  // expirationMs 는 사실상 만료 없음 (1년) — 죽을 때까지 살아있다는 의미.
  // 자연회복 없음: 누적 데미지만 유효, 며칠 비웠다 와도 진척이 보존된다.
  dragon_nest: {
    monsterName: "태고의 노룡",
    maxHp: 750_000, // 500_000 × 1.5
    expirationMs: 365 * 24 * 60 * 60 * 1000, // 1y (실질 무한)
    respawnMs: 7 * 24 * 60 * 60 * 1000, // 7d 휴면
    isWorldBoss: true,
    onDefeatFlag: "primordial_dragon_felled",
    onAttackFlag: "primordial_dragon_engaged",
    // 진입 자격 — 뼈비늘 노룡 처치 이력 (wyrm_warden_felled). 같은 flag 가 region edge
    // 통행 조건이라 사실상 region 에 들어선 자는 곧 자격자 — 안전망으로 한 번 더 박는다.
    requiredFlag: "wyrm_warden_felled",
    lockedMessage:
      "뼈비늘 노룡을 한 번 쓰러뜨려야 둥지의 어미가 자네를 알아본다. 묘지의 보스를 먼저 잡고 다시 오라.",
  },
  // 6막 「별을 잊은 것」 — 잊힌 봉인의 상시 협동(월드) 레이드. 별빛 교차로 아래.
  // 누적 데미지 비동기(매칭 불필요) + 자연회복 없음(꾸준히 깎으면 진척 보존). 한기 기믹은
  // monster("별을 잊은 것") 의 chill 스킬. 자격 게이트 = 별빛 잔영(성채) 정리 — 별빛 권역을
  // 깊이 정리한 자에게만 봉인이 반응한다는 의미(튜닝 시 잔영 3종 종합 플래그로 강화 가능).
  forgotten_seal: {
    monsterName: "별을 잊은 것",
    maxHp: 150_000, // 2h 리스폰 상시 레이드 — 활성 소수가 리스폰 주기 안에 처치 가능한 양 (튜닝 포인트)
    expirationMs: 365 * 24 * 60 * 60 * 1000, // 1y (실질 무한 — 죽을 때까지)
    respawnMs: 2 * 60 * 60 * 1000, // 2h — 처치 후 2시간이면 다시 깨어난다 (상시 레이드)
    isWorldBoss: true,
    onDefeatFlag: "forgotten_star_felled",
    onAttackFlag: "forgotten_star_engaged",
    requiredFlag: "starlit_gate_quelled",
    lockedMessage:
      "별빛 잔영을 깊이 잠재운 자에게만 봉인이 숨을 내준다. 별빛 권역의 잔영을 먼저 정리하고 다시 오라.",
  },
};

// 5단계 reward tier — 누적 데미지 / maxHp 비율 임계.
export type CoopRewardTier = "bronze" | "silver" | "gold" | "epic" | "legend";

export const COOP_TIER_ORDER: CoopRewardTier[] = [
  "bronze",
  "silver",
  "gold",
  "epic",
  "legend",
];

export const COOP_TIER_THRESHOLDS: Record<CoopRewardTier, number> = {
  bronze: 0.03,
  silver: 0.1,
  gold: 0.2,
  epic: 0.4,
  legend: 0.6,
};

export const COOP_TIER_LABEL: Record<CoopRewardTier, string> = {
  bronze: "BRONZE",
  silver: "SILVER",
  gold: "GOLD",
  epic: "EPIC",
  legend: "LEGEND",
};

/**
 * 누적 데미지 비율 (0~1) → 도달한 최고 티어.
 * bronze 미달이면 null.
 */
export function coopTierForRatio(ratio: number): CoopRewardTier | null {
  let achieved: CoopRewardTier | null = null;
  for (const tier of COOP_TIER_ORDER) {
    if (ratio >= COOP_TIER_THRESHOLDS[tier]) achieved = tier;
    else break;
  }
  return achieved;
}

// 1회 공격 시뮬 턴 수 + 공격 간 쿨다운.
export const COOP_ATTACK_TURNS = 20;
export const COOP_ATTACK_COOLDOWN_MS = 10 * 60 * 1000; // 10분 (전역 — 모든 협동 보스 공통)
