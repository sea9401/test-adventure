import { FARM_ITEMS, type FarmItemId } from "@/adventure/v2/farm";

export const GUILD_DINING_USER_SAVE_KEY = "guild-dining-user.v1";
export const GUILD_DINING_POINTS_PER_TICKET = 15;
export const GUILD_DINING_POINTS_PER_MEMBER_TARGET = 20;

export type GuildDiningIngredientSource = "farm" | "fishing_item";

export type GuildDiningIngredient = {
  id: string;
  source: GuildDiningIngredientSource;
  sourceItemId: string;
  name: string;
  icon: string;
  pointValue: number;
};

// 식당은 공급원의 인벤토리 구조를 알지 않는다. 새 작물은 이 목록에 한 줄을 더하고,
// 물고기가 아이템화되면 fishing_item 공급원 등록부를 추가하면 된다.
const FARM_DINING_ITEMS: ReadonlyArray<{
  itemId: FarmItemId;
  pointValue: number;
}> = [
  { itemId: "wheat", pointValue: 1 },
  { itemId: "golden_wheat", pointValue: 3 },
  { itemId: "corn", pointValue: 1 },
  { itemId: "sweet_corn", pointValue: 3 },
  { itemId: "tomato", pointValue: 1 },
  { itemId: "heirloom_tomato", pointValue: 3 },
  { itemId: "strawberry", pointValue: 1 },
  { itemId: "white_strawberry", pointValue: 3 },
  { itemId: "potato", pointValue: 1 },
  { itemId: "golden_potato", pointValue: 3 },
  { itemId: "onion", pointValue: 1 },
  { itemId: "pearl_onion", pointValue: 3 },
  { itemId: "rice", pointValue: 1 },
  { itemId: "golden_rice", pointValue: 3 },
  { itemId: "soybean", pointValue: 1 },
  { itemId: "black_soybean", pointValue: 3 },
  { itemId: "sugarcane", pointValue: 1 },
  { itemId: "crystal_sugarcane", pointValue: 3 },
  { itemId: "cacao", pointValue: 1 },
  { itemId: "royal_cacao", pointValue: 3 },
];

export const GUILD_DINING_INGREDIENTS: readonly GuildDiningIngredient[] =
  FARM_DINING_ITEMS.map(({ itemId, pointValue }) => ({
    id: `farm:${itemId}`,
    source: "farm" as const,
    sourceItemId: itemId,
    name: FARM_ITEMS[itemId].name,
    icon: FARM_ITEMS[itemId].icon,
    pointValue,
  }));

export function guildDiningIngredient(
  raw: unknown,
): GuildDiningIngredient | null {
  if (typeof raw !== "string") return null;
  return GUILD_DINING_INGREDIENTS.find((item) => item.id === raw) ?? null;
}

export type GuildDiningEffectKind = "hunt_exp" | "life_xp";

export type GuildDiningMenuId =
  | "hearty_stew"
  | "adventurer_meal"
  | "worker_lunch";

export type GuildDiningMenu = {
  id: GuildDiningMenuId;
  name: string;
  icon: string;
  description: string;
  minFacilityLevel: number;
  effect:
    | { kind: "recovery"; hp: number; mp: number }
    | {
        kind: GuildDiningEffectKind;
        bonusPct: number;
        uses: number;
      };
};

export const GUILD_DINING_MENUS: readonly GuildDiningMenu[] = [
  {
    id: "hearty_stew",
    name: "든든한 채소 스튜",
    icon: "🍲",
    description: "HP·MP 충전량을 각각 100,000 즉시 채웁니다.",
    minFacilityLevel: 1,
    effect: { kind: "recovery", hp: 100_000, mp: 100_000 },
  },
  {
    id: "adventurer_meal",
    name: "모험가 정식",
    icon: "🍛",
    description: "다음 사냥 승리 20회의 경험치가 5% 증가합니다.",
    minFacilityLevel: 1,
    effect: { kind: "hunt_exp", bonusPct: 5, uses: 20 },
  },
  {
    id: "worker_lunch",
    name: "일꾼 도시락",
    icon: "🍱",
    description: "다음 생활 활동 20회의 생활 경험치가 5% 증가합니다.",
    minFacilityLevel: 2,
    effect: { kind: "life_xp", bonusPct: 5, uses: 20 },
  },
];

export function guildDiningMenu(raw: unknown): GuildDiningMenu | null {
  if (typeof raw !== "string") return null;
  return GUILD_DINING_MENUS.find((menu) => menu.id === raw) ?? null;
}

export type GuildDiningActiveEffect = {
  menuId: GuildDiningMenuId;
  kind: GuildDiningEffectKind;
  bonusPct: number;
  remainingUses: number;
  roundingRemainder: number;
};

export type GuildDiningUserState = {
  version: 1;
  weekKey: string;
  guildId: number;
  contributionPoints: number;
  mealsUsed: number;
  activeEffect: GuildDiningActiveEffect | null;
};

function nonNegativeInt(raw: unknown): number {
  return Math.max(0, Math.floor(Number(raw) || 0));
}

function parseActiveEffect(raw: unknown): GuildDiningActiveEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const menu = guildDiningMenu(value.menuId);
  if (!menu || menu.effect.kind === "recovery") return null;
  if (value.kind !== menu.effect.kind) return null;
  const remainingUses = Math.min(
    menu.effect.uses,
    nonNegativeInt(value.remainingUses),
  );
  if (remainingUses <= 0) return null;
  return {
    menuId: menu.id,
    kind: menu.effect.kind,
    bonusPct: menu.effect.bonusPct,
    remainingUses,
    roundingRemainder: Math.min(99, nonNegativeInt(value.roundingRemainder)),
  };
}

export function parseGuildDiningUserState(
  raw: unknown,
  args: { weekKey: string; guildId: number },
): GuildDiningUserState {
  const value =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  if (value.weekKey !== args.weekKey) {
    return {
      version: 1,
      weekKey: args.weekKey,
      guildId: args.guildId,
      contributionPoints: 0,
      mealsUsed: 0,
      activeEffect: null,
    };
  }
  const sameGuild = Number(value.guildId) === args.guildId;
  return {
    version: 1,
    weekKey: args.weekKey,
    guildId: args.guildId,
    contributionPoints: sameGuild ? nonNegativeInt(value.contributionPoints) : 0,
    // 길드 이동으로 식권을 다시 받지 못하게 사용량과 이미 먹은 음식 효과는 주차 단위로 유지한다.
    mealsUsed: nonNegativeInt(value.mealsUsed),
    activeEffect: parseActiveEffect(value.activeEffect),
  };
}

export function guildDiningTicketProgress(
  state: GuildDiningUserState,
  weeklyTicketLimit: number,
): { earned: number; used: number; available: number; contributionCap: number } {
  const limit = Math.max(0, Math.floor(weeklyTicketLimit));
  const earned = Math.min(
    limit,
    Math.floor(state.contributionPoints / GUILD_DINING_POINTS_PER_TICKET),
  );
  const used = Math.min(limit, state.mealsUsed);
  return {
    earned,
    used,
    available: Math.max(0, earned - used),
    contributionCap: limit * GUILD_DINING_POINTS_PER_TICKET,
  };
}

export function guildDiningPantryTarget(memberCount: number): number {
  return Math.min(
    400,
    Math.max(
      GUILD_DINING_POINTS_PER_MEMBER_TARGET,
      Math.floor(memberCount) * GUILD_DINING_POINTS_PER_MEMBER_TARGET,
    ),
  );
}

export function activeEffectForMenu(
  menu: GuildDiningMenu,
): GuildDiningActiveEffect | null {
  if (menu.effect.kind === "recovery") return null;
  return {
    menuId: menu.id,
    kind: menu.effect.kind,
    bonusPct: menu.effect.bonusPct,
    remainingUses: menu.effect.uses,
    roundingRemainder: 0,
  };
}

export function consumeGuildDiningEffectState(
  state: GuildDiningUserState,
  kind: GuildDiningEffectKind,
  baseAmount: number,
): { state: GuildDiningUserState; bonus: number; consumed: boolean } {
  const active = state.activeEffect;
  const base = Math.max(0, Math.floor(baseAmount));
  if (!active || active.kind !== kind || active.remainingUses <= 0 || base <= 0) {
    return { state, bonus: 0, consumed: false };
  }
  const rawBonus = base * active.bonusPct + active.roundingRemainder;
  const bonus = Math.floor(rawBonus / 100);
  const remainingUses = active.remainingUses - 1;
  return {
    state: {
      ...state,
      activeEffect:
        remainingUses > 0
          ? {
              ...active,
              remainingUses,
              roundingRemainder: rawBonus % 100,
            }
          : null,
    },
    bonus,
    consumed: true,
  };
}
