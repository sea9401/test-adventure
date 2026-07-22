import { emptyInventory } from "@/adventure/inventory/state";
import { MAX_STAMINA } from "@/adventure/v2/stamina";

export const HP_LIFT_V1 = "hpLift_v1";
export const STARTER_CHARGE = 100_000;

// 신규 사용자에게 서버가 직접 넣는 신뢰 가능한 초기값. 클라이언트가 보내는 starter
// payload를 받아들이지 않도록 /api/save GET의 idempotent bootstrap과 UI fallback이 공유한다.
export const INITIAL_CHARACTER_SAVE = {
  hp: 97,
  level: 1,
  exp: 0,
  gold: 50,
  fame: 0,
  equippedTitleId: null,
  migrations: { [HP_LIFT_V1]: true },
  stamina: { current: MAX_STAMINA, lastUpdatedAt: 0 },
};

export const INITIAL_INVENTORY_SAVE = {
  ...emptyInventory(),
  hpCharges: STARTER_CHARGE,
  mpCharges: STARTER_CHARGE,
};
