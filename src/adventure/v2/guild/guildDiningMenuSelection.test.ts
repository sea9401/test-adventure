import { describe, expect, it } from "vitest";
import { toggleGuildDiningMenuSelection } from "./guildDiningMenuSelection";

describe("guild dining menu selection", () => {
  it("replaces the selected menu when the dining hall has one menu slot", () => {
    expect(
      toggleGuildDiningMenuSelection(
        ["hearty_stew"],
        "adventurer_meal",
        1,
      ),
    ).toEqual(["adventurer_meal"]);
  });

  it("keeps at least one menu selected", () => {
    expect(
      toggleGuildDiningMenuSelection(["hearty_stew"], "hearty_stew", 1),
    ).toEqual(["hearty_stew"]);
  });

  it("keeps multi-slot selection within its capacity", () => {
    expect(
      toggleGuildDiningMenuSelection(
        ["hearty_stew", "adventurer_meal"],
        "worker_lunch",
        2,
      ),
    ).toEqual(["hearty_stew", "adventurer_meal"]);
  });
});
