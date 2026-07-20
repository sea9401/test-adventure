import { describe, expect, it } from "vitest";
import {
  CHARACTER_NAME_MAX,
  validateCharacterName,
} from "./characterNamePolicy";

describe("character name policy", () => {
  it.each(["가", "모험가", "Hero", "Hero123", "용사7", "  새싹  "])(
    "한글·영문·숫자 닉네임을 허용한다: %s",
    (raw) => {
      expect(validateCharacterName(raw)).toMatchObject({ ok: true });
    },
  );

  it("앞뒤 공백을 제거하고 분해된 한글을 NFC로 정규화한다", () => {
    expect(validateCharacterName("  가나  ")).toEqual({
      ok: true,
      name: "가나",
    });
  });

  it.each([
    "두 글자",
    "name_tag",
    "name-tag",
    "name.tag",
    "name@tag",
    "용사!",
    "용사🙂",
    "勇士",
    "ㄱㄴ",
  ])("공백·특수문자·허용하지 않은 문자권을 거부한다: %s", (raw) => {
    expect(validateCharacterName(raw)).toEqual({
      ok: false,
      reason: "characters",
    });
  });

  it("빈 이름과 최대 길이 초과를 거부한다", () => {
    expect(validateCharacterName("  ")).toEqual({
      ok: false,
      reason: "length",
    });
    expect(validateCharacterName("가".repeat(CHARACTER_NAME_MAX + 1))).toEqual({
      ok: false,
      reason: "length",
    });
  });

  it.each(["운영자", "관리자123", "SuperAdmin", "SYSTEM7"])(
    "운영 사칭 가능성이 있는 예약어를 대소문자 구분 없이 거부한다: %s",
    (raw) => {
      expect(validateCharacterName(raw)).toEqual({
        ok: false,
        reason: "reserved",
      });
    },
  );
});
