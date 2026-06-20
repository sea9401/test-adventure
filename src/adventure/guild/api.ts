// 길드 시스템 클라이언트 API. fetch wrapper — 에러 메시지를 한국어로 변환.
// v2 가 쓰는 초대/가입신청/둘러보기만 유지(창단·탈퇴·회관·버프·의뢰 등 v1 흐름은 제거됨).

export type GuildBrowseEntry = {
  id: number;
  name: string;
  masterName: string; // 길드마스터 닉네임(없으면 "모험가")
  description: string | null;
  fameTotal: number;
  grade: string;
  memberCount: number;
  acceptingRequests: boolean;
  // 국가명(미선포 null) + 그 길드의 정원(국가 선포 시 상향). 둘러보기 표시·정원 게이트용.
  nationName: string | null;
  maxMembers: number;
};

export type GuildBrowseResponse = {
  maxMembers: number;
  myPendingRequest: { requestId: number; guildId: number } | null;
  guilds: GuildBrowseEntry[];
};

const ERROR_MESSAGES: Record<string, string> = {
  unauthorized: "로그인이 필요합니다.",
  already_in_guild: "이미 다른 길드에 소속돼 있습니다.",
  cooldown: "탈퇴/추방 쿨다운 중입니다.",
  no_character: "캐릭터 정보를 먼저 만들어 주세요.",
  guild_not_found: "길드를 찾을 수 없습니다.",
  guild_disbanded: "이미 해체된 길드입니다.",
  not_master: "마스터만 가능합니다.",
  not_member: "이 길드의 멤버가 아닙니다.",
  self_invite: "자기 자신을 초대할 수 없습니다.",
  target_not_found: "대상 유저를 찾을 수 없습니다.",
  target_in_guild: "대상이 이미 다른 길드에 속해 있습니다.",
  target_cooldown: "대상이 탈퇴 쿨다운 중입니다.",
  already_invited: "이미 초대장을 보낸 상대입니다.",
  guild_full: "길드 정원이 가득 찼습니다.",
  invite_not_found: "초대장을 찾을 수 없습니다.",
  invite_not_pending: "이미 처리된 초대장입니다.",
  invite_expired: "만료된 초대장입니다.",
  not_recipient: "본인의 초대장이 아닙니다.",
  not_accepting: "이 길드는 가입 신청을 받지 않습니다.",
  already_requested:
    "이미 가입 신청 중인 길드가 있습니다 — 먼저 신청을 취소해 주세요.",
  request_not_found: "가입 신청을 찾을 수 없습니다.",
  request_not_pending: "이미 처리된 가입 신청입니다.",
  not_requester: "본인의 가입 신청이 아닙니다.",
  applicant_in_guild: "신청자가 이미 다른 길드에 소속됐습니다.",
  applicant_cooldown: "신청자가 탈퇴/추방 쿨다운 중입니다.",
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

export async function fetchGuildBrowse(
  q?: string,
): Promise<GuildBrowseResponse> {
  const qs =
    q && q.trim().length > 0 ? `?q=${encodeURIComponent(q.trim())}` : "";
  const r = await fetch(`/api/guilds/browse${qs}`);
  if (!r.ok) throw await parseError(r);
  return (await r.json()) as GuildBrowseResponse;
}

export async function requestJoinGuild(
  guildId: number,
): Promise<{
  ok: true;
  requestId: number;
  guildId: number;
  guildName: string;
}> {
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
