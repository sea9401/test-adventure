import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("narrow state consumers", () => {
  it.each([
    "BankPanel.tsx", "GuildGoldDepositPanel.tsx", "guild/GuildWorkshopPanel.tsx",
    "V2VillagePanel.tsx", "V2CultivationView.tsx", "V2SkillLearnView.tsx", "V2InboxView.tsx",
  ])("%s does not subscribe to the entire game state", (file) => {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).not.toMatch(/\buseGameState\s*\(/);
    expect(source).toMatch(/useGame(Resource|World)State\s*\(/);
  });
});
