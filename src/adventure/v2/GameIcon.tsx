import {
  Campfire,
  CloudFog,
  CloudLightning,
  Circle,
  CookingPot,
  CraneTower,
  Cube,
  Diamond,
  Flask,
  FlowerLotus,
  Lock,
  Moon,
  MoonStars,
  Mountains,
  Scales,
  Scroll,
  Shovel,
  Skull,
  Sparkle,
  Sun,
  SunHorizon,
  Target,
  Ticket,
  Tree,
  Waves,
  Warning,
  Wind,
  Wrench,
  type Icon,
  type IconProps,
} from "@phosphor-icons/react";
import type { GameIconName } from "@/adventure/data/v2/gameIcon";
import {
  CustomGameIcon,
  type CustomGameIconName,
} from "@/components/icons/CustomGameIcon";

type CustomCoreGameIconName = Extract<GameIconName, CustomGameIconName>;
type LegacyGameIconName = Exclude<GameIconName, CustomGameIconName>;

const CUSTOM_CORE_GAME_ICON_NAMES = new Set<GameIconName>([
  "Shield",
  "Coins",
  "Compass",
  "House",
  "MapTrifold",
  "Hammer",
  "Fish",
  "Plant",
  "Trophy",
  "Gear",
]);

function isCustomCoreGameIconName(
  name: GameIconName,
): name is CustomCoreGameIconName {
  return CUSTOM_CORE_GAME_ICON_NAMES.has(name);
}

const GAME_ICONS = {
  Campfire,
  CloudFog,
  CloudLightning,
  Circle,
  CookingPot,
  CraneTower,
  Cube,
  Diamond,
  Flask,
  FlowerLotus,
  Lock,
  Moon,
  MoonStars,
  Mountains,
  Scales,
  Scroll,
  Shovel,
  Skull,
  Sparkle,
  Sun,
  SunHorizon,
  Target,
  Ticket,
  Tree,
  Waves,
  Warning,
  Wind,
  Wrench,
} satisfies Record<LegacyGameIconName, Icon>;

export function GameIcon({
  name,
  weight = "duotone",
  size,
  mirrored,
  ...props
}: IconProps & { name: GameIconName }) {
  if (isCustomCoreGameIconName(name)) {
    return (
      <CustomGameIcon
        {...props}
        aria-hidden="true"
        name={name}
        size={size}
        mirrored={mirrored}
      />
    );
  }
  const Component = GAME_ICONS[name];
  return (
    <Component
      aria-hidden="true"
      weight={weight}
      size={size}
      mirrored={mirrored}
      {...props}
    />
  );
}
