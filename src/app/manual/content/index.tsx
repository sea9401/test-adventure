import type { ReactNode } from "react";
import { OverviewContent } from "./overview";
import { ControlsContent } from "./controls";
import { CombatContent } from "./combat";
import { HuntingContent } from "./hunting";
import { CoopContent } from "./coop";
import { StatsContent } from "./stats";
import { JobsContent } from "./jobs";
import { SkillsContent } from "./skills";
import { LevelingContent } from "./leveling";
import { EquipmentContent } from "./equipment";
import { CraftingContent } from "./crafting";
import { EconomyContent } from "./economy";
import { TownContent } from "./town";
import { GuildContent } from "./guild";
import { OutpostContent } from "./outpost";
import { PlazaContent } from "./plaza";
import { CompendiumContent } from "./compendium";
import { ArenaContent } from "./arena";
import { PastimesContent } from "./pastimes";

// 슬러그 → 그 섹션의 본문 컴포넌트.
export const MANUAL_CONTENT: Record<string, () => ReactNode> = {
  overview: OverviewContent,
  controls: ControlsContent,
  combat: CombatContent,
  hunting: HuntingContent,
  coop: CoopContent,
  stats: StatsContent,
  jobs: JobsContent,
  skills: SkillsContent,
  leveling: LevelingContent,
  equipment: EquipmentContent,
  crafting: CraftingContent,
  economy: EconomyContent,
  town: TownContent,
  guild: GuildContent,
  outpost: OutpostContent,
  plaza: PlazaContent,
  compendium: CompendiumContent,
  arena: ArenaContent,
  pastimes: PastimesContent,
};
