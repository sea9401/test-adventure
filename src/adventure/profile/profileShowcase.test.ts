import { describe, expect, it } from "vitest";
import {
  parseProfileShowcase,
  parseProfileShowcaseSelection,
} from "./profileShowcase";

describe("profile showcase parser", () => {
  it("parses each supported selection", () => {
    expect(
      parseProfileShowcaseSelection({ kind: "equipment", iid: "eq_1" }),
    ).toEqual({ kind: "equipment", iid: "eq_1" });
    expect(
      parseProfileShowcaseSelection({
        kind: "achievement",
        achievementId: "first_hunt",
      }),
    ).toEqual({ kind: "achievement", achievementId: "first_hunt" });
    expect(
      parseProfileShowcase({ selection: { kind: "title", titleId: "hero" } }),
    ).toEqual({ kind: "title", titleId: "hero" });
  });

  it("rejects malformed and oversized values", () => {
    expect(parseProfileShowcase({ selection: { kind: "equipment" } })).toBeNull();
    expect(
      parseProfileShowcase({
        selection: { kind: "title", titleId: "x".repeat(161) },
      }),
    ).toBeNull();
    expect(parseProfileShowcase({ selection: { kind: "unknown", id: "x" } })).toBeNull();
  });
});
