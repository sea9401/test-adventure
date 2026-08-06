// 유저 자치 길드 시스템의 상수 / 검증 유틸. 서버 + 클라이언트 양쪽에서 쓴다.
// 정책 변경(정원, 쿨다운, 이름 길이 등) 은 여기서 한 곳에서.

// 길드 레벨 — 누적 명성 자동 달성이 아니라 관리자 수동 승급.
// 명성은 fameAvailable 에서, 골드는 길드 공용 금고에서 실제 차감한다.
// 명성 총비용(30,000)은 옛 자동 레벨 임계값과 같아 기존 성장 속도를 유지한다.
export const GUILD_LEVEL_UPGRADE_COSTS = [
  { currentLevel: 1, nextLevel: 2, fame: 3_000, gold: 10_000_000 },
  { currentLevel: 2, nextLevel: 3, fame: 5_000, gold: 25_000_000 },
  { currentLevel: 3, nextLevel: 4, fame: 8_000, gold: 50_000_000 },
  { currentLevel: 4, nextLevel: 5, fame: 14_000, gold: 100_000_000 },
] as const;
export const GUILD_MAX_LEVEL = 5;
export type GuildLevelUpgradeCost =
  (typeof GUILD_LEVEL_UPGRADE_COSTS)[number];

// Lv.1 기본 정원. 이후 레벨이 오를 때마다 1명씩 늘어난다.
export const GUILD_BASE_MEMBER_CAP = 6;
export const GUILD_MEMBER_CAP_PER_LEVEL = 1;

// 국가 선포 보상 — 레벨 정원과 별도로 더해지는 증가분.
export const NATION_MEMBER_BONUS = 3;

export function normalizeGuildLevel(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.min(GUILD_MAX_LEVEL, Math.max(1, Math.floor(level)));
}

export function guildLevelUpgradeCost(
  level: number,
): GuildLevelUpgradeCost | null {
  const currentLevel = normalizeGuildLevel(level);
  return (
    GUILD_LEVEL_UPGRADE_COSTS.find(
      (cost) => cost.currentLevel === currentLevel,
    ) ?? null
  );
}

// 길드 정원 — Lv.1 기본 정원 + 레벨 성장분 + 국가 보너스.
// 가입 수락/초대/신청·둘러보기·길드 정보가 모두 이 함수를 사용한다.
export function guildMemberCap(
  level: number,
  hasNation: boolean,
): number {
  const levelBonus =
    (normalizeGuildLevel(level) - 1) * GUILD_MEMBER_CAP_PER_LEVEL;
  return (
    GUILD_BASE_MEMBER_CAP +
    levelBonus +
    (hasNation ? NATION_MEMBER_BONUS : 0)
  );
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
