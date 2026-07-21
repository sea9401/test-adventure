export const CHAT_INAPPROPRIATE_CONTENT_ERROR = "inappropriate content";
export const CHAT_INAPPROPRIATE_CONTENT_MESSAGE =
  "부적절한 표현이 포함되어 있어 전송할 수 없습니다.";

export type ChatModerationResult =
  | { allowed: true }
  | { allowed: false; rule: string };

// 욕설과 같은 글자를 포함하지만 정상적인 뜻으로 자주 쓰이는 단어다.
// 공백·특수문자를 정리한 뒤 먼저 제거해 부분 문자열 오탐을 줄인다.
const SAFE_COMPACT_PHRASES = ["시발점", "시발역", "시발차", "시발지"] as const;

const COMPACT_RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "ko_sibal", pattern: /(?:씨+|시+|씹+|쒸+|쉬+)(?:이+)?[발팔벌]/u },
  { id: "ko_byeongsin", pattern: /(?:병+|빙+|븅+)신/u },
  {
    id: "ko_gaesaekki",
    pattern: /개+(?:(?:새|세|쌔)+끼|색+기)/u,
  },
  { id: "ko_jot", pattern: /[좆좃좇]/u },
  { id: "ko_jonna", pattern: /존+나/u },
  { id: "ko_jiral", pattern: /지+랄/u },
  { id: "ko_yeombyeong", pattern: /염+병/u },
  { id: "ko_insult", pattern: /(?:미친|씹)(?:놈|년|새끼)/u },
  { id: "ko_gaegat", pattern: /개+같/u },
  { id: "ko_hostile", pattern: /닥+쳐/u },
];

const JAMO_RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "ko_jamo_sibal", pattern: /[ㅅㅆ][\s\p{P}\p{S}\d]*ㅂ/u },
  { id: "ko_jamo_jonna", pattern: /ㅈ[\s\p{P}\p{S}\d]*ㄴ/u },
  { id: "ko_jamo_jiral", pattern: /ㅈ[\s\p{P}\p{S}\d]*ㄹ/u },
  {
    id: "ko_jamo_gaesaekki",
    pattern: /ㄱ[\s\p{P}\p{S}\d]*ㅅ[\s\p{P}\p{S}\d]*ㄲ/u,
  },
];

const ENGLISH_RULES: ReadonlyArray<{ id: string; pattern: RegExp }> = [
  { id: "en_fuck", pattern: /(?:^|[^\p{L}])f+u+c+k+(?=$|[^\p{L}])/iu },
  { id: "en_shit", pattern: /(?:^|[^\p{L}])s+h+i+t+(?=$|[^\p{L}])/iu },
  { id: "en_bitch", pattern: /(?:^|[^\p{L}])b+i+t+c+h+(?=$|[^\p{L}])/iu },
];

function withoutInvisibleCharacters(value: string): string {
  return value.replace(/[\p{Cf}\u0000-\u001f\u007f]/gu, "");
}

function compactLetters(value: string): string {
  return value.replace(/[^\p{L}\p{M}]+/gu, "");
}

export function moderateChatContent(content: string): ChatModerationResult {
  const nfc = withoutInvisibleCharacters(content.normalize("NFC")).toLowerCase();
  for (const rule of JAMO_RULES) {
    if (rule.pattern.test(nfc)) return { allowed: false, rule: rule.id };
  }

  const normalized = withoutInvisibleCharacters(content.normalize("NFKC")).toLowerCase();
  for (const rule of ENGLISH_RULES) {
    if (rule.pattern.test(normalized)) return { allowed: false, rule: rule.id };
  }

  let compact = compactLetters(normalized);
  for (const phrase of SAFE_COMPACT_PHRASES) {
    compact = compact.replaceAll(phrase, "");
  }
  for (const rule of COMPACT_RULES) {
    if (rule.pattern.test(compact)) return { allowed: false, rule: rule.id };
  }

  return { allowed: true };
}

export function isChatContentAllowed(content: string): boolean {
  return moderateChatContent(content).allowed;
}
