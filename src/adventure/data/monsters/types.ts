import type { MaterialId } from "../materials";
import type { ItemId } from "../items";
import type { SkillBookId } from "../skillBooks";

export type MonsterTag =
  | "humanoid"
  | "beast"
  | "slime"
  | "golem"
  | "spirit"
  | "undead"
  | "dragon";

// 드롭은 일곱 가지 — 재료 / 골드 / 장비 / 장비 풀(랜덤 1) / 제작서 / 제작서 풀(랜덤 1) / 스킬북.
// chance 는 0~1.
// "recipe" 드롭은 해당 제작법을 학습 (이미 알고 있으면 무시).
// "recipe_one_of" 는 chance 가 통과하면 recipeIds 중 하나를 균등 추첨해 학습 시도.
// "equip_one_of" 는 chance 가 통과하면 itemIds 중 하나를 균등 추첨해 인벤에 추가.
//    별빛 사냥터처럼 30종 풀에서 한 자루 떨어지는 패턴용 — 30 entry 박지 않고 풀로.
// "skill_book" 은 책 그 자체가 인벤에 들어간다 — 학습은 사용 시점.
export type MonsterDrop =
  | { kind: "material"; materialId: MaterialId; chance: number; amount?: number }
  | { kind: "gold"; amount: number; chance: number }
  | { kind: "equip"; itemId: ItemId; chance: number }
  | { kind: "equip_one_of"; itemIds: ItemId[]; chance: number }
  | { kind: "recipe"; recipeId: string; chance: number }
  | { kind: "recipe_one_of"; recipeIds: string[]; chance: number }
  | { kind: "skill_book"; bookId: SkillBookId; chance: number };

// 몬스터 페이즈 트리거 — HP가 hpFraction(0~1) 미만으로 떨어지면 1회 발동.
// defBonus 만큼 적의 DEF 가 영구 증가, 로그에 message 가 출력된다. 보스용.
export type MonsterPhaseTrigger = {
  hpFraction: number;
  defBonus: number;
  message: string;
};

// 잡몹 스킬 — 몬스터당 최대 1개(옵셔널). 전투 엔진의 적 페이즈에서 처리.
//  - heavy_blow: everyPhases 번째 적 페이즈마다 그 공격 데미지 ×multiplier (강타).
//  - enrage:     적 HP 가 maxHp×hpFraction 미만으로 떨어지는 순간 1회 발동, ATK +atkBonus (전투 종료까지 유지).
//  - brace:      플레이어가 이 적을 공격할 때 데미지 -damageReduction (최소 1로 클램프).
//  - pierce:     이 적의 공격이 플레이어 DEF 를 armorPierce 만큼 무시.
//  - chill:      이 적의 공격이 적중할 때마다 플레이어에 한기 perHit 스택 누적. 적 페이즈
//                시작 시 스택이 threshold 이상이면 스택당 dmgPerStack 고정 피해 (DEF·보호막 무시).
//                deepHpFraction 지정 시 적 HP 가 그 비율 미만이면 perHit 가 2배 (깊은 한기).
//                무한 탱킹을 막는 시간압 기믹 — 「별을 잊은 것」(6막) 의 정체.
// name 은 전투 로그에 [name] 으로 찍힌다.
export type MonsterSkill =
  | { kind: "heavy_blow"; name: string; everyPhases: number; multiplier: number }
  | { kind: "enrage"; name: string; hpFraction: number; atkBonus: number }
  | { kind: "brace"; name: string; damageReduction: number }
  | { kind: "pierce"; name: string; armorPierce: number }
  | {
      kind: "chill";
      name: string;
      perHit: number;
      dmgPerStack: number;
      threshold: number;
      deepHpFraction?: number;
      /** 한기 스택 상한. 미지정 = 무제한. 폭주(무한 누적) 방지 — DoT 최대치를 dmgPerStack×maxStacks 로 고정. */
      maxStacks?: number;
      /**
       * DEF 부분감산 계수(0~1). 한기 틱에서 플레이어 DEF×이 값만큼 피해를 깎는다. 하한 1.
       * 미지정/0 = DEF 무시(순수 고정피해, 기존 동작). DEF 에 약간의 보람을 주되 무효화는 막는 노브.
       */
      defMitigationFraction?: number;
      /**
       * 한기 스택당 플레이어 회피율 감소(%p) — 슬로우 느낌(추울수록 굼떠져 못 피함).
       * 미지정/0 = 효과 없음. 적 공격 회피 굴림 때 stacks×이 값만큼 차감(회피 0 하한).
       */
      evasionPenaltyPerStack?: number;
    };

export type Monster = {
  name: string;
  tags: MonsterTag[];
  image?: string;
  hp: number;
  atk: number;
  def: number;
  spd: number;
  /** 0~100. 플레이어 공격을 % 확률로 회피. 0/undefined = 항상 피격. */
  evasionPct?: number;
  exp: number;
  drops?: MonsterDrop[];
  phaseTrigger?: MonsterPhaseTrigger;
  /** 잡몹 스킬 — 적 페이즈에서 처리되는 단순 능력 1개. */
  skill?: MonsterSkill;
  /**
   * 드랍 장비 품질 등급(정교한/빼어난) 가중치 배수. 기본 1. 미니보스 ≈2 / 지역 보스 ≈3 /
   * 레이드급 ≈4 권장 — 비-기본 등급 가중치(raw 4/1)에 곱해진 뒤 정규화된다(dropQuality.ts).
   */
  dropQualityBias?: number;
  /**
   * 0~1. 이 몬스터를 공격할 때 무시되는 자신의 DEF 비율 (페이즈로 오른 DEF 포함). 미지정/0 = 정상 감산.
   * "스펀지 보스" 방지 노브 — 그 시대 정석 장비면 적정 시간 안에 잡히게. 보스 ≈ 0.25~0.35 권장.
   * 정확 스킬(armorPierceFraction) 과 곱셈으로 겹치고, 분쇄(고정 감산)는 이 뒤에 적용된다.
   */
  armorVulnerable?: number;
  /**
   * 0~1. 이 몬스터의 공격이 무시하는 플레이어 DEF 비율. 잡몹 pierce 스킬(고정값)과 별개 — 풀탱이
   * 보스를 무피격으로 농락하지 못하게. 미지정/0 = 정상. 보스 ≈ 0.2~0.3 권장.
   */
  playerDefVulnerable?: number;
  /** 처치 시 set 할 storyFlag id — 보스용. 두 번째 처치부터는 useStoryFlags.set 이 idempotent 라 무시. */
  onDefeatFlag?: string;
  /**
   * 보스에 도전(첫 일격)하는 순간 set 할 storyFlag id — 처치까진 안 가도 set 되는 "참여" 플래그.
   * 옛 coop 시절 onAttackFlag 를 솔로 region.boss 로 옮긴 것. 진입로가 "맞붙으면 열림" 인
   * 길목(canyon→unhyang)을 위해 BossSubView.onBossAttempt 가 도전 클릭 시 set.
   */
  onEngageFlag?: string;
  /**
   * 처치 시 grant 할 titleId — 솔로 region.boss 의 legend 칭호 자동 부여용
   * (옛 coop 시절의 50% 데미지 임계 대신, 솔로 처치 = 칭호 획득).
   * grantTitle 자체가 idempotent — 두 번째 처치부터 무시.
   */
  onDefeatTitleId?: string;
  /**
   * 5막 「빈 옥좌의 시대」 별빛 변종 표식. "starfall" — 황제가 쓰러진 뒤 별빛이 떨어진
   * 자리에서 깨어난 변종. 향후 별빛 깃든 기예 발동 조건·드랍 풀 식별·도감 그룹화 등에
   * 쓰일 분류 태그. PR-A 시점에서는 메타데이터로만 보존(전투 로직에 영향 없음).
   */
  auraKind?: "starfall";
  /**
   * 몬스터 추가 공격 확률(%). 100% 초과는 정수 부분만큼 확정 추가타 (engine.ts enemy phase).
   * 0/undefined = 1대 고정(잡몹). 100 = +1대 확정, 200 = +2대 확정, 300 = +3대 확정.
   * 플레이어 회피 100% 무적 빌드 견제 + 보스전 압박감을 위한 다대시 수단.
   */
  bonusAttackChancePct?: number;
};

// ── 5막 별빛 사냥터 drop 풀 상수 — 일반 몹 12종에 inline 으로 반복 박지 않도록 추출 ──
// 사냥터별 30종을 8/7/8/7 묶음으로 분배 (메인스탯 X 무기/방어구 골고루).
// 부여서 5종/보스는 inline (5장이라 충분히 짧다).
export const STARFALL_CAVE_RECIPES: readonly string[] = [
  "starlit_greatsword_str", "starlit_greatsword_dex", "starlit_lance_str",
  "starlit_lance_dex", "starlit_shield_str", "starlit_twinblades_str",
  "starlit_dagger_str", "starlit_armor_str",
];
export const STARLIT_CANYON_RECIPES: readonly string[] = [
  "starlit_greatsword_vit", "starlit_lance_vit", "starlit_shield_dex",
  "starlit_shield_vit", "starlit_twinblades_dex", "starlit_dagger_dex",
  "starlit_armor_dex", "starlit_armor_vit",
];
export const STARLIT_REEF_RECIPES: readonly string[] = [
  "starlit_greatsword_spd", "starlit_lance_spd", "starlit_shield_spd",
  "starlit_twinblades_vit", "starlit_twinblades_spd", "starlit_dagger_vit",
  "starlit_armor_spd",
];
export const STARLIT_KEEP_RECIPES: readonly string[] = [
  "starlit_greatsword_luk", "starlit_lance_luk", "starlit_shield_luk",
  "starlit_twinblades_luk", "starlit_dagger_spd", "starlit_dagger_luk",
  "starlit_armor_luk",
];

