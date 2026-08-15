import { describe, expect, it } from "vitest";
import { lifeFieldStatusPresentation } from "./lifeFieldStatusPresentation";

describe("lifeFieldStatusPresentation", () => {
  it("shows loading only while the first request has no data", () => {
    expect(
      lifeFieldStatusPresentation({
        hasData: false,
        loading: true,
        error: false,
      }),
    ).toBe("loading");
  });

  it("shows an error when loading failed without usable data", () => {
    expect(
      lifeFieldStatusPresentation({
        hasData: false,
        loading: false,
        error: true,
      }),
    ).toBe("error");
  });

  it("keeps existing data visible during a background refresh", () => {
    expect(
      lifeFieldStatusPresentation({
        hasData: true,
        loading: true,
        error: false,
      }),
    ).toBe("ready");
  });

  it("keeps existing data visible when a background refresh fails", () => {
    expect(
      lifeFieldStatusPresentation({
        hasData: true,
        loading: false,
        error: true,
      }),
    ).toBe("ready");
  });
});
