export const CHARACTER_NAME_MIN = 1;
export const CHARACTER_NAME_MAX = 9;

export type CharacterNameInvalidReason =
  | "length"
  | "characters"
  | "reserved";

export type CharacterNameValidation =
  | { ok: true; name: string }
  | { ok: false; reason: CharacterNameInvalidReason };

const CHARACTER_NAME_PATTERN = /^[가-힣A-Za-z0-9]+$/;
const CHARACTER_NAME_RESERVED_WORDS = ["운영자", "관리자", "admin", "system"];

export const CHARACTER_NAME_RULE_TEXT =
  "1~9자, 한글·영문·숫자만 사용할 수 있습니다.";

export function validateCharacterName(raw: unknown): CharacterNameValidation {
  const name =
    typeof raw === "string" ? raw.trim().normalize("NFC") : "";
  if (name.length < CHARACTER_NAME_MIN || name.length > CHARACTER_NAME_MAX) {
    return { ok: false, reason: "length" };
  }
  if (!CHARACTER_NAME_PATTERN.test(name)) {
    return { ok: false, reason: "characters" };
  }
  const lower = name.toLowerCase();
  if (CHARACTER_NAME_RESERVED_WORDS.some((word) => lower.includes(word))) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, name };
}

export function characterNameInvalidMessage(
  reason: CharacterNameInvalidReason,
): string {
  if (reason === "reserved") {
    return "사용할 수 없는 단어가 포함되어 있습니다.";
  }
  return CHARACTER_NAME_RULE_TEXT;
}
