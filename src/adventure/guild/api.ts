// 길드 시스템 클라이언트 API. fetch wrapper — 에러 메시지를 한국어로 변환.

import type {
  GuildBuffDef,
  GuildBuffId,
  GuildBuffSlot,
} from "@/adventure/data/guildBuffs";
import type {
  DonateBody,
  LodgeResponse,
  SloganBody,
  UpgradeResponse,
} from "@/adventure/data/guildLodge";

export type GuildMember = {
  userId: string;
  name: string;
  role: "master" | "member";
  level: number | null;
  title: string | null;
  lastSeenAt: string | null;
  joinedAt: string;
};

export type GuildJoinRequestSummary = {
  requestId: number;
  userId: string;
  name: string;
  level: number | null;
  requestedAt: string;
};

export type GuildInfo = {
  id: number;
  name: string;
  masterId: string;
  createdAt: string;
  description: string | null;
  fameTotal: number;
  fameAvailable: number;
  grade: string;
  isMaster: boolean;
  acceptingRequests: boolean;
  members: GuildMember[];
  pendingRequests: GuildJoinRequestSummary[];
  buffs: GuildBuffSlot[];
  maxBuffSlots: number;
};

export type GuildMeResponse = {
  guild: GuildInfo | null;
  leaveCooldownUntil: string | null;
};

export type GuildBrowseEntry = {
  id: number;
  name: string;
  description: string | null;
  fameTotal: number;
  grade: string;
  memberCount: number;
  acceptingRequests: boolean;
};

export type GuildBrowseResponse = {
  maxMembers: number;
  myPendingRequest: { requestId: number; guildId: number } | null;
  guilds: GuildBrowseEntry[];
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  invalid_buff_id: "알 수 없는 버프입니다.",
  already_installed: "이미 설치된 버프입니다.",
  no_slot: "빈 버프 슬롯이 없습니다.",
  insufficient_fame: "사용 가능 명성이 부족합니다.",
  not_installed: "설치되지 않은 버프입니다.",
  max_tier: "이미 최고 티어입니다.",
  guild_disbanded_buffs: "해체된 길드입니다.",
  already_in_guild: "이미 다른 길드에 소속돼 있습니다.",
  cooldown: "탈퇴/추방 쿨다운 중입니다.",
  name_taken: "이미 사용 중인 길드명입니다.",
  name_invalid: "사용할 수 없는 길드명입니다.",
  no_character: "캐릭터 정보를 먼저 만들어 주세요.",
  requirements: "길드 생성 조건을 만족하지 않습니다.",
  insufficient_gold: "200G가 필요합니다.",
  guild_not_found: "길드를 찾을 수 없습니다.",
  guild_disbanded: "이미 해체된 길드입니다.",
  not_master: "마스터만 가능합니다.",
  not_member: "이 길드의 멤버가 아닙니다.",
  master_must_transfer: "양도 후에 탈퇴할 수 있습니다.",
  cannot_kick_self: "자기 자신은 추방할 수 없습니다.",
  self_invite: "자기 자신을 초대할 수 없습니다.",
  self_transfer: "자기 자신에게 양도할 수 없습니다.",
  target_not_found: "대상 유저를 찾을 수 없습니다.",
  target_in_guild: "대상이 이미 다른 길드에 속해 있습니다.",
  target_cooldown: "대상이 탈퇴 쿨다운 중입니다.",
  target_not_member: "이 길드의 멤버가 아닙니다.",
  description_too_long: "소개글이 너무 깁니다.",
  already_invited: "이미 초대장을 보낸 상대입니다.",
  guild_full: "길드 정원이 가득 찼습니다.",
  invite_not_found: "초대장을 찾을 수 없습니다.",
  invite_not_pending: "이미 처리된 초대장입니다.",
  invite_expired: "만료된 초대장입니다.",
  not_recipient: "본인의 초대장이 아닙니다.",
  not_accepting: "이 길드는 가입 신청을 받지 않습니다.",
  already_requested: "이미 가입 신청 중인 길드가 있습니다 — 먼저 신청을 취소해 주세요.",
  request_not_found: "가입 신청을 찾을 수 없습니다.",
  request_not_pending: "이미 처리된 가입 신청입니다.",
  not_requester: "본인의 가입 신청이 아닙니다.",
  applicant_in_guild: "신청자가 이미 다른 길드에 소속됐습니다.",
  applicant_cooldown: "신청자가 탈퇴/추방 쿨다운 중입니다.",
  invalid_kind: "잘못된 봉납 종류입니다.",
  invalid_amount: "잘못된 봉납 수량입니다.",
  insufficient_stardust: "별빛 조각이 부족합니다.",
  max_rank: "회관이 이미 최고 등급입니다.",
  not_ready: "아직 승급 임계에 도달하지 않았습니다.",
  slogan_too_long: "슬로건이 너무 깁니다.",
};

export class GuildError extends Error {
  code: string;
  status: number;
  constructor(code: string, status: number, message?: string) {
    super(message ?? ERROR_MESSAGES[code] ?? code);
    this.code = code;
    this.status = status;
  }
}

async function parseError(r: Response): Promise<GuildError> {
  let code = "unknown";
  let message: string | undefined;
  try {
    const body = await r.json();
    if (typeof body?.error === "string") code = body.error;
    if (typeof body?.message === "string") message = body.message;
  } catch {}
  return new GuildError(code, r.status, message);
}

export async function fetchMyGuild(): Promise<GuildMeResponse> {
  const r = await fetch("/api/guilds/me");
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as GuildMeResponse;
}

export async function createGuild(
  name: string,
): Promise<{ ok: true; guildId: number; name: string; newGold: number }> {
  const r = await fetch("/api/guilds", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as {
    ok: true;
    guildId: number;
    name: string;
    newGold: number;
  };
}

export async function inviteToGuild(
  guildId: number,
  name: string,
): Promise<{ ok: true; inviteId: number; targetName: string }> {
  const r = await fetch(`/api/guilds/${guildId}/invite`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as {
    ok: true;
    inviteId: number;
    targetName: string;
  };
}

export async function acceptGuildInvite(
  inviteId: number,
): Promise<{ ok: true; guildId: number; guildName: string }> {
  const r = await fetch(`/api/guilds/invites/${inviteId}/accept`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true; guildId: number; guildName: string };
}

export async function declineGuildInvite(
  inviteId: number,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/invites/${inviteId}/decline`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

export async function leaveGuild(
  guildId: number,
): Promise<{ ok: true; disbanded: boolean }> {
  const r = await fetch(`/api/guilds/${guildId}/leave`, { method: "POST" });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true; disbanded: boolean };
}

export async function kickFromGuild(
  guildId: number,
  userId: string,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/${guildId}/kick`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

export async function transferMaster(
  guildId: number,
  newMasterId: string,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/${guildId}/transfer`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId: newMasterId }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

export async function disbandGuild(
  guildId: number,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/${guildId}/disband`, { method: "POST" });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

// 마스터 전용 — 길드 소개글 수정. 빈 문자열 → null 로 클리어.
export async function updateGuildDescription(
  guildId: number,
  description: string,
): Promise<{ ok: true; description: string | null }> {
  const r = await fetch(`/api/guilds/${guildId}/description`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ description }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true; description: string | null };
}

// ───── 길드 가입 신청 ─────

export async function fetchGuildBrowse(
  q?: string,
): Promise<GuildBrowseResponse> {
  const qs = q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  const r = await fetch(`/api/guilds/browse${qs}`);
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as GuildBrowseResponse;
}

export async function requestJoinGuild(
  guildId: number,
): Promise<{ ok: true; requestId: number; guildId: number; guildName: string }> {
  const r = await fetch(`/api/guilds/${guildId}/requests`, { method: "POST" });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as {
    ok: true;
    requestId: number;
    guildId: number;
    guildName: string;
  };
}

export async function cancelJoinRequest(
  requestId: number,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/requests/${requestId}/cancel`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

export async function acceptJoinRequest(
  requestId: number,
): Promise<{ ok: true; guildId: number; userId: string }> {
  const r = await fetch(`/api/guilds/requests/${requestId}/accept`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true; guildId: number; userId: string };
}

export async function declineJoinRequest(
  requestId: number,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/requests/${requestId}/decline`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

export async function setGuildAcceptingRequests(
  guildId: number,
  accepting: boolean,
): Promise<{ ok: true; acceptingRequests: boolean }> {
  const r = await fetch(`/api/guilds/${guildId}/accepting-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accepting }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true; acceptingRequests: boolean };
}

// ───── 길드 의뢰 (Phase A) ─────

export type GuildQuestInstanceShape = {
  id: number;
  questDefId: string;
  grade: string;
  status: "proposed" | "active" | "completed" | "dismissed" | "expired";
  progress: number;
  target: number;
  activatedAt: string | null;
  completedAt: string | null;
};

export type GuildQuestsThisWeekResponse = {
  guild: {
    id: number;
    name: string;
    masterId: string;
    fameTotal: number;
    fameAvailable: number;
    grade: string;
    isMaster: boolean;
  } | null;
  weekStart: string | null;
  active: GuildQuestInstanceShape[];
  proposed: GuildQuestInstanceShape[];
};

export async function fetchThisWeekGuildQuests(): Promise<GuildQuestsThisWeekResponse> {
  const r = await fetch("/api/guilds/quests/this-week");
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as GuildQuestsThisWeekResponse;
}

export async function acceptGuildQuest(
  instanceId: number,
): Promise<{ ok: true }> {
  const r = await fetch(`/api/guilds/quests/${instanceId}/accept`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { ok: true };
}

// 멤버의 활동을 활성 의뢰 카운터에 반영. 활성 의뢰가 없거나 task 와 안 맞으면
// silent ignore 라 호출자는 거의 신경 안 써도 됨 — 응답의 matched 로 판단.
export type ProgressReportBody =
  | { kind: "kill_monster"; name: string; count: number }
  | { kind: "kill_boss"; name: string; count: number }
  | { kind: "collect_material"; materialId: string; count: number };

export type ProgressReportResponse = {
  ok: true;
  matched: boolean;
  reason?: string;
  progress?: number;
  target?: number;
  completed?: boolean;
  fameAdded?: number;
};

export async function reportGuildQuestProgress(
  body: ProgressReportBody,
): Promise<ProgressReportResponse> {
  const r = await fetch("/api/guilds/quests/progress", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as ProgressReportResponse;
}

// ───── 길드 버프 ─────

export type GuildBuffsResponse = {
  guild: {
    id: number;
    isMaster: boolean;
    fameAvailable: number;
    fameTotal: number;
    grade: string;
    maxSlots: number;
    buffs: GuildBuffSlot[];
  } | null;
  catalog?: Record<GuildBuffId, GuildBuffDef>;
};

export async function fetchGuildBuffs(): Promise<GuildBuffsResponse> {
  const r = await fetch("/api/guilds/buffs");
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as GuildBuffsResponse;
}

type BuffMutationResponse = {
  ok: true;
  buffs: GuildBuffSlot[];
  fameAvailable: number;
  spent?: number;
  refunded?: number;
  newTier?: number;
};

export async function installGuildBuff(
  buffId: GuildBuffId,
): Promise<BuffMutationResponse> {
  const r = await fetch("/api/guilds/buffs/install", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buffId }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as BuffMutationResponse;
}

export async function upgradeGuildBuff(
  buffId: GuildBuffId,
): Promise<BuffMutationResponse> {
  const r = await fetch("/api/guilds/buffs/upgrade", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buffId }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as BuffMutationResponse;
}

export async function uninstallGuildBuff(
  buffId: GuildBuffId,
): Promise<BuffMutationResponse> {
  const r = await fetch("/api/guilds/buffs/uninstall", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ buffId }),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as BuffMutationResponse;
}

// ───── 회관 (Lodge) ─────

export async function fetchLodge(guildId: number): Promise<LodgeResponse> {
  const r = await fetch(`/api/guilds/${guildId}/lodge`);
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as LodgeResponse;
}

export async function donateToLodge(
  guildId: number,
  body: DonateBody,
): Promise<LodgeResponse> {
  const r = await fetch(`/api/guilds/${guildId}/lodge/donate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as LodgeResponse;
}

export async function upgradeLodge(guildId: number): Promise<UpgradeResponse> {
  const r = await fetch(`/api/guilds/${guildId}/lodge/upgrade`, {
    method: "POST",
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as UpgradeResponse;
}

export async function setLodgeSlogan(
  guildId: number,
  body: SloganBody,
): Promise<{ slogan: string | null }> {
  const r = await fetch(`/api/guilds/${guildId}/lodge/slogan`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as { slogan: string | null };
}

