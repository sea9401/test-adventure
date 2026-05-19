"use client";

import { useCallback, useEffect, useState } from "react";
import { Gear, House, Scroll, Sparkle, UsersThree } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useGame } from "@/adventure/GameContext";
import {
  GUILD_LEAVE_COOLDOWN_DAYS,
  GUILD_MAX_MEMBERS,
} from "@/adventure/data/guild";
import {
  acceptJoinRequest,
  createGuild,
  declineJoinRequest,
  disbandGuild,
  fetchMyGuild,
  kickFromGuild,
  leaveGuild,
  setGuildAcceptingRequests,
  transferMaster,
  updateGuildDescription,
  GuildError,
  type GuildMeResponse,
} from "./api";
import { GuildInviteModal } from "./GuildInviteModal";
import { GuildQuestsPanel } from "./GuildQuestsPanel";
import { GuildBuffsPanel } from "./GuildBuffsPanel";
import { GuildTabButton } from "./GuildTabButton";
import { GuildSummaryPanel } from "./GuildSummaryPanel";
import { GuildNoGuildPanel } from "./GuildNoGuildPanel";
import { GuildBrowsePanel } from "./GuildBrowsePanel";
import { GuildMembersPanel } from "./GuildMembersPanel";
import { GuildManagePanel } from "./GuildManagePanel";
import { GuildLodgePanel } from "./GuildLodgePanel";

const NO_AFFILIATION = "무소속";

type Tab = "lodge" | "members" | "quests" | "buffs" | "manage";

export function GuildHallView() {
  const { character, characterStateHook, addNotification, grantTitle, refreshGuildBuffs } = useGame();
  const setAffiliation = characterStateHook.setAffiliation;

  const [data, setData] = useState<GuildMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [tab, setTab] = useState<Tab>("lodge");

  const pushToast = (msg: string) => addNotification("info", msg);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchMyGuild();
      setData(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "로드 실패");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const handleApiError = (e: unknown) => {
    const msg =
      e instanceof GuildError
        ? e.message
        : e instanceof Error
          ? e.message
          : "처리 실패";
    setError(msg);
    pushToast(msg);
  };

  const handleCreate = async (name: string) => {
    setBusy(true);
    setError(null);
    try {
      const r = await createGuild(name);
      setAffiliation(r.name);
      grantTitle("guild_founder");
      pushToast(`${r.name} 길드를 만들었습니다.`);
      setShowCreate(false);
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleLeave = async () => {
    if (!data?.guild) return;
    const confirmed = window.confirm(
      `${data.guild.name} 길드에서 정말 탈퇴하시겠습니까?\n탈퇴 후 ${GUILD_LEAVE_COOLDOWN_DAYS}일간 다른 길드에 가입할 수 없습니다.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      const r = await leaveGuild(data.guild.id);
      setAffiliation(NO_AFFILIATION);
      if (r.disbanded) grantTitle("closed_shop");
      pushToast(r.disbanded ? "길드를 해체했습니다." : "길드에서 탈퇴했습니다.");
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleKick = async (userId: string, name: string) => {
    if (!data?.guild) return;
    const confirmed = window.confirm(`${name} 님을 정말 추방하시겠습니까?`);
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await kickFromGuild(data.guild.id, userId);
      pushToast(`${name} 님을 추방했습니다.`);
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleTransfer = async (userId: string, name: string) => {
    if (!data?.guild) return;
    const confirmed = window.confirm(
      `${name} 님에게 마스터 권한을 양도하시겠습니까?\n본인은 일반 멤버가 됩니다.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await transferMaster(data.guild.id, userId);
      pushToast(`${name} 님에게 마스터를 양도했습니다.`);
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDisband = async () => {
    if (!data?.guild) return;
    const confirmed = window.confirm(
      `${data.guild.name} 길드를 정말 해체하시겠습니까?\n해체 후 본인은 ${GUILD_LEAVE_COOLDOWN_DAYS}일 쿨다운, 다른 멤버는 즉시 무소속이 됩니다.`,
    );
    if (!confirmed) return;
    setBusy(true);
    setError(null);
    try {
      await disbandGuild(data.guild.id);
      setAffiliation(NO_AFFILIATION);
      grantTitle("closed_shop");
      pushToast("길드를 해체했습니다.");
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleSaveDescription = async (next: string) => {
    if (!data?.guild) return;
    setBusy(true);
    setError(null);
    try {
      const r = await updateGuildDescription(data.guild.id, next);
      // 낙관적 갱신 — 응답 description 으로 로컬 상태 동기화.
      setData((prev) =>
        prev?.guild
          ? { ...prev, guild: { ...prev.guild, description: r.description } }
          : prev,
      );
      pushToast(r.description ? "소개글을 저장했습니다." : "소개글을 비웠습니다.");
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleAcceptRequest = async (requestId: number, name: string) => {
    if (!data?.guild) return;
    setBusy(true);
    setError(null);
    try {
      await acceptJoinRequest(requestId);
      pushToast(`${name} 님의 가입 신청을 수락했습니다.`);
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleDeclineRequest = async (requestId: number, name: string) => {
    if (!data?.guild) return;
    setBusy(true);
    setError(null);
    try {
      await declineJoinRequest(requestId);
      pushToast(`${name} 님의 가입 신청을 거절했습니다.`);
      await load();
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAccepting = async (next: boolean) => {
    if (!data?.guild) return;
    setBusy(true);
    setError(null);
    try {
      await setGuildAcceptingRequests(data.guild.id, next);
      setData((prev) =>
        prev?.guild
          ? { ...prev, guild: { ...prev.guild, acceptingRequests: next } }
          : prev,
      );
      pushToast(next ? "가입 신청을 받습니다." : "가입 신청을 받지 않습니다.");
    } catch (e) {
      handleApiError(e);
    } finally {
      setBusy(false);
    }
  };

  const onInviteSuccess = (targetName: string) => {
    pushToast(`${targetName} 님에게 초대장을 보냈습니다.`);
    setShowInvite(false);
    void load();
  };

  if (loading && !data) {
    return (
      <Card padding="md">
        <Skeleton rows={4} />
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Card padding="sm">
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        </Card>
      ) : null}

      {data?.guild ? (
        <>
          <GuildSummaryPanel
            guild={data.guild}
            busy={busy}
            onSaveDescription={handleSaveDescription}
          />

          <div className="flex gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-1 dark:border-zinc-800 dark:bg-zinc-900/60">
            <GuildTabButton
              icon={<House size={14} weight="bold" />}
              label="회관"
              active={tab === "lodge"}
              onClick={() => setTab("lodge")}
            />
            <GuildTabButton
              icon={<UsersThree size={14} weight="bold" />}
              label={`길드원 목록 ${data.guild.members.length}/${GUILD_MAX_MEMBERS}`}
              active={tab === "members"}
              onClick={() => setTab("members")}
            />
            <GuildTabButton
              icon={<Scroll size={14} weight="bold" />}
              label="길드 의뢰"
              active={tab === "quests"}
              onClick={() => setTab("quests")}
            />
            <GuildTabButton
              icon={<Sparkle size={14} weight="bold" />}
              label="버프"
              active={tab === "buffs"}
              onClick={() => setTab("buffs")}
            />
            {data.guild.isMaster ? (
              <GuildTabButton
                icon={<Gear size={14} weight="bold" />}
                label="길드 관리"
                active={tab === "manage"}
                onClick={() => setTab("manage")}
              />
            ) : null}
          </div>

          {tab === "lodge" ? (
            <GuildLodgePanel
              guildId={data.guild.id}
              isMaster={data.guild.isMaster}
            />
          ) : tab === "manage" && data.guild.isMaster ? (
            <GuildManagePanel
              guild={data.guild}
              busy={busy}
              onInviteClick={() => setShowInvite(true)}
              onAcceptRequest={handleAcceptRequest}
              onDeclineRequest={handleDeclineRequest}
              onToggleAccepting={handleToggleAccepting}
              onDisband={handleDisband}
            />
          ) : tab === "quests" ? (
            <GuildQuestsPanel />
          ) : tab === "buffs" ? (
            <GuildBuffsPanel onChanged={() => void refreshGuildBuffs()} />
          ) : (
            <GuildMembersPanel
              guild={data.guild}
              busy={busy}
              onLeave={handleLeave}
              onKick={handleKick}
              onTransfer={handleTransfer}
            />
          )}
        </>
      ) : (
        <>
          <GuildNoGuildPanel
            showCreate={showCreate}
            onShowCreate={() => setShowCreate(true)}
            onCancelCreate={() => setShowCreate(false)}
            onCreate={handleCreate}
            busy={busy}
            characterLevel={character.level}
            characterGold={character.gold}
            leaveCooldownUntil={data?.leaveCooldownUntil ?? null}
          />
          <GuildBrowsePanel
            busy={busy}
            leaveCooldownUntil={data?.leaveCooldownUntil ?? null}
            onToast={pushToast}
            onError={(msg) => {
              setError(msg);
              pushToast(msg);
            }}
          />
        </>
      )}

      {showInvite && data?.guild ? (
        <GuildInviteModal
          guildId={data.guild.id}
          onClose={() => setShowInvite(false)}
          onSuccess={onInviteSuccess}
        />
      ) : null}
    </div>
  );
}
