import { describe, expect, it } from "vitest";
import {
  readStoryFlagsForSaveSession,
  rememberStoryFlagsForSaveSession,
} from "./useStoryFlags";

describe("story flag 세션 캐시", () => {
  it("화면이 재마운트돼도 현재 접속에서 갱신한 플래그를 유지한다", () => {
    const saveSession = {};

    expect(
      readStoryFlagsForSaveSession(saveSession, { flags: [] }),
    ).toEqual({ flags: [] });

    rememberStoryFlagsForSaveSession(saveSession, {
      flags: ["tutorial.codex-intro"],
    });

    expect(
      readStoryFlagsForSaveSession(saveSession, { flags: [] }),
    ).toEqual({ flags: ["tutorial.codex-intro"] });
  });

  it("다른 저장 세션의 플래그와 섞이지 않는다", () => {
    const firstSession = {};
    const secondSession = {};

    rememberStoryFlagsForSaveSession(firstSession, {
      flags: ["tutorial.codex-intro"],
    });

    expect(
      readStoryFlagsForSaveSession(secondSession, { flags: [] }),
    ).toEqual({ flags: [] });
  });
});
