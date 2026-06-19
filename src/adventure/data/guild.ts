// 유저 자치 길드 시스템의 상수 / 검증 유틸. 서버 + 클라이언트 양쪽에서 쓴다.
// 정책 변경(정원, 쿨다운, 이름 길이 등) 은 여기서 한 곳에서.

export const GUILD_MAX_MEMBERS = 10;

// 국가 선포 보상 — 정원 증가분. nation_name != null 인 길드는 정원이 이만큼 늘어난다.
// 🔑 정원 한도는 더 이상 상수가 아니라 길드별 = guildMemberCap(국가 여부)로 계산.
export const NATION_MEMBER_BONUS = 3;

// 길드 정원 — 국가 선포 시 보너스 가산. enforce 사이트(가입 수락/초대/신청)·둘러보기 공통.
export function guildMemberCap(hasNation: boolean): number {
  return GUILD_MAX_MEMBERS + (hasNation ? NATION_MEMBER_BONUS : 0);
}

// 창단 조건 — 레벨 게이트 AND 골드 차감(sink). 라우트·창단 카드 공통 단일 출처.
//   골드는 실제 차감되는 비용(threshold 아님). 정착지/국가의 진입점이라 의도적으로 비싼 sink.
export const GUILD_CREATE_MIN_LEVEL = 5;
export const GUILD_CREATE_GOLD_COST = 10_000_000;

// 시간 정책.
export const GUILD_LEAVE_COOLDOWN_DAYS = 1;
export const GUILD_INVITE_EXPIRES_DAYS = 7;
export const GUILD_JOIN_REQUEST_EXPIRES_DAYS = 7;
export const GUILD_DISBANDED_NAME_HOLD_DAYS = 30;

// 이름 정책.
export const GUILD_NAME_MIN = 2;
export const GUILD_NAME_MAX = 12;

// 국가명 정책 — 길드명보다 약간 길게 허용("○○ 제국" 등). 동일 문자셋·금칙어.
export const NATION_NAME_MIN = 2;
export const NATION_NAME_MAX = 16;

// 소개글 — 마스터가 자유롭게 적는 짧은 한 줄. 빈 문자열 = 미설정.
export const GUILD_DESCRIPTION_MAX = 120;
const GUILD_NAME_REGEX = /^[\p{L}\p{N} ]+$/u;
const GUILD_NAME_BANNED_WORDS = ["운영자", "관리자", "admin", "system"];

export type GuildNameValidation =
  | { ok: true; trimmed: string }
  | { ok: false; reason: string };

// 길드명·국가명 공통 검증 — 길이 범위만 다르고 문자셋/금칙어는 동일.
function validateNameWithin(
  raw: string,
  min: number,
  max: number,
  label: string,
): GuildNameValidation {
  const trimmed = raw.trim();
  if (trimmed.length < min || trimmed.length > max) {
    return { ok: false, reason: `${label}은 ${min}~${max}자 범위입니다.` };
  }
  if (!GUILD_NAME_REGEX.test(trimmed)) {
    return { ok: false, reason: "한글/영문/숫자/공백만 사용할 수 있습니다." };
  }
  const lower = trimmed.toLowerCase();
  if (GUILD_NAME_BANNED_WORDS.some((w) => lower.includes(w))) {
    return { ok: false, reason: "사용할 수 없는 단어가 포함되어 있습니다." };
  }
  return { ok: true, trimmed };
}

export function validateGuildName(raw: string): GuildNameValidation {
  return validateNameWithin(raw, GUILD_NAME_MIN, GUILD_NAME_MAX, "길드명");
}

export function validateNationName(raw: string): GuildNameValidation {
  return validateNameWithin(raw, NATION_NAME_MIN, NATION_NAME_MAX, "국가명");
}

