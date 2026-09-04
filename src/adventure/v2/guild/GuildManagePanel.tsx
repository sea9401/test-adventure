import { useCallback, useEffect, useRef, useState } from "react";
import { TabBar } from "@/components/ui/TabBar";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import { confirmGameAction } from "@/components/ui/gameDialog";
import {
  acceptJoinRequest,
  declineJoinRequest,
  inviteToGuild,
  GuildError,
} from "@/adventure/guild/api";
import {
  GUILD_BASE_MEMBER_CAP,
  GUILD_DESCRIPTION_MAX,
  GUILD_NAME_MAX,
} from "@/adventure/data/guild";
import {
  GUILD_CUSTOM_EMBLEM_COIN_COST,
  GUILD_EMBLEM_IMAGE_MAX_BYTES,
} from "@/adventure/data/guild-emblems";
import {
  AvatarPicker,
  type AvatarCategory,
} from "@/adventure/profile/AvatarPicker";
import type { Avatar } from "@/adventure/profile/avatars";
import { NoticeBanner } from "./NoticeBanner";
import { GuildCombatSupplyPanel } from "./GuildCombatSupplyPanel";
import { GuildLevelUpgradePanel } from "./GuildLevelUpgradePanel";
import { GuildEmblemImage } from "./GuildEmblemImage";
import {
  fmtDate,
  type GuildInfoResponse,
  type GuildManageTab,
  type Notice,
  type PendingRequest,
} from "./guildShared";

const MANAGER_LIMIT = 2;

// 길드 관리 탭 — 마스터/관리자 전용. 멤버(초대·신청·직책)·길드 연구·길드 설정.
export function GuildManagePanel({
  info,
  guildId,
  stateGuildName,
  acting,
  setActing,
  notice,
  setNotice,
  onRefresh,
  isMaster,
  pendingRequests,
  loading,
  onGuildChanged,
}: {
  info: GuildInfoResponse | null;
  guildId: number | null;
  stateGuildName?: string;
  acting: boolean;
  setActing: (v: boolean) => void;
  notice: Notice | null;
  setNotice: (n: Notice | null) => void;
  onRefresh: () => Promise<void>;
  isMaster: boolean;
  pendingRequests: PendingRequest[];
  loading: boolean;
  onGuildChanged?: () => void;
}) {
  // 관리 탭 내부 하위 탭 선택.
  const [manageTab, setManageTab] = useState<GuildManageTab>("members");
  const [inviteName, setInviteName] = useState("");
  const [emblemFile, setEmblemFile] = useState<File | null>(null);
  const [emblemCategory, setEmblemCategory] = useState<AvatarCategory>("character");
  const [selectedGameEmblem, setSelectedGameEmblem] = useState<Avatar | null>(null);
  const [museunCoins, setMuseunCoins] = useState<number | null>(null);
  const emblemInputRef = useRef<HTMLInputElement>(null);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  // 길드 해산 확인 — 길드 이름 입력(파괴적 작업 안전장치).
  const [disbandConfirm, setDisbandConfirm] = useState("");
  const descriptionValue = descriptionDraft ?? info?.guild?.description ?? "";

  useEffect(() => {
    if (!isMaster || manageTab !== "settings") return;
    let cancelled = false;
    void fetch("/api/v2/museun-coin-shop", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as { ok?: boolean; coins?: number };
        if (!cancelled && res.ok && json.ok) setMuseunCoins(json.coins ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isMaster, manageTab]);

  // 마스터가 가입 신청 수락/거절. 처리 후 info 를 다시 받아 신청 목록·길드원에 반영.
  const handleRequest = useCallback(
    async (reqId: number, name: string, action: "accept" | "decline") => {
      setActing(true);
      setNotice(null);
      try {
        if (action === "accept") {
          await acceptJoinRequest(reqId);
          setNotice({ kind: "ok", text: `${name} 님을 길드원으로 받았어요.` });
        } else {
          await declineJoinRequest(reqId);
          setNotice({ kind: "ok", text: `${name} 님의 신청을 거절했어요.` });
        }
        await onRefresh();
      } catch (e) {
        setNotice({
          kind: "err",
          text:
            e instanceof GuildError
              ? e.message
              : "처리에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      } finally {
        setActing(false);
      }
    },
    [onRefresh, setActing, setNotice],
  );

  // 마스터가 닉네임으로 멤버 초대 — 상대 우편함에 guild_invite 가 도착, 상대가 수락하면 합류.
  const handleInvite = useCallback(async () => {
    const name = inviteName.trim();
    if (name.length === 0 || guildId == null || acting) return;
    setActing(true);
    setNotice(null);
    try {
      const r = await inviteToGuild(guildId, name);
      setNotice({
        kind: "ok",
        text: `${r.targetName} 님을 초대했어요. 상대가 우편함에서 수락하면 합류합니다.`,
      });
      setInviteName("");
    } catch (e) {
      setNotice({
        kind: "err",
        text:
          e instanceof GuildError
            ? e.message
            : "초대에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setActing(false);
    }
  }, [inviteName, guildId, acting, setActing, setNotice]);

  // 마스터가 로컬 이미지를 R2 엠블럼으로 등록·교체·제거.
  const handleSetEmblem = useCallback(
    async (file: File | null) => {
      if (acting) return;
      if (
        file !== null &&
        !(await confirmGameAction(
          `직접 등록한 이미지로 변경할까요? 개인 무슨 코인 ${GUILD_CUSTOM_EMBLEM_COIN_COST.toLocaleString()}개가 사용됩니다.`,
        ))
      ) {
        return;
      }
      setActing(true);
      setNotice(null);
      try {
        const formData = file ? new FormData() : null;
        if (file && formData) formData.set("image", file);
        const res = await fetch("/api/v2/guild/emblem", {
          method: file ? "POST" : "DELETE",
          body: formData,
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          coins?: number;
        } | null;
        if (j?.ok) {
          setNotice({
            kind: "ok",
            text:
              file === null
                ? "길드 엠블럼을 제거했어요."
                : `길드 엠블럼을 바꿨어요. 개인 무슨 코인 ${GUILD_CUSTOM_EMBLEM_COIN_COST.toLocaleString()}개가 사용됐습니다.`,
          });
          if (typeof j.coins === "number") setMuseunCoins(j.coins);
          setEmblemFile(null);
          if (emblemInputRef.current) emblemInputRef.current.value = "";
          await onRefresh();
        } else {
          const errorText: Record<string, string> = {
            not_master: "마스터만 엠블럼을 바꿀 수 있어요.",
            invalid_file: "등록할 이미지 파일을 선택해 주세요.",
            not_image: "올바른 JPG, PNG, WebP 이미지 파일만 등록할 수 있어요.",
            image_too_large: "이미지는 2MB 이하여야 해요.",
            image_dimensions: "이미지는 가로·세로 4096px 이하여야 해요.",
            insufficient_coins: `무슨 코인이 부족해요. ${GUILD_CUSTOM_EMBLEM_COIN_COST.toLocaleString()}개가 필요합니다.`,
            storage_unavailable: "이미지 저장소를 준비 중이에요. 잠시 후 다시 시도해 주세요.",
            storage_error: "이미지 저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
          };
          setNotice({
            kind: "err",
            text: j?.error
              ? (errorText[j.error] ?? `변경에 실패했어요 (${j.error}).`)
              : `변경에 실패했어요 (http ${res.status}).`,
          });
        }
      } catch {
        setNotice({
          kind: "err",
          text: "변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
        });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, setActing, setNotice],
  );

  const handleSetGameEmblem = useCallback(async () => {
    if (acting || !selectedGameEmblem) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/emblem", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar: selectedGameEmblem }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error ?? `http_${res.status}`);
      }
      setSelectedGameEmblem(null);
      setNotice({ kind: "ok", text: "게임 내 이미지로 길드 엠블럼을 변경했어요." });
      await onRefresh();
    } catch (error) {
      const code = error instanceof Error ? error.message : "change_failed";
      setNotice({
        kind: "err",
        text:
          code === "not_master"
            ? "마스터만 엠블럼을 바꿀 수 있어요."
            : "엠블럼 변경에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setActing(false);
    }
  }, [acting, onRefresh, selectedGameEmblem, setActing, setNotice]);

  const handleDescriptionSave = useCallback(async () => {
    const description = descriptionValue.trim();
    if (acting || description.length > GUILD_DESCRIPTION_MAX) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/description", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ description }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (json?.ok) {
        setNotice({
          kind: "ok",
          text: description ? "길드 소개를 저장했어요." : "길드 소개를 지웠어요.",
        });
        await onRefresh();
        setDescriptionDraft(null);
      } else {
        const message =
          json?.error === "not_master"
            ? "길드 마스터만 소개를 바꿀 수 있어요."
            : json?.error === "description_too_long"
              ? `길드 소개는 ${GUILD_DESCRIPTION_MAX}자까지 쓸 수 있어요.`
              : `저장에 실패했어요 (${json?.error ?? `http ${res.status}`}).`;
        setNotice({ kind: "err", text: message });
      }
    } catch {
      setNotice({
        kind: "err",
        text: "저장에 실패했어요. 잠시 후 다시 시도해 주세요.",
      });
    } finally {
      setActing(false);
    }
  }, [acting, descriptionValue, onRefresh, setActing, setNotice]);

  // 마스터가 직책 변경 — guild_members.role (관리자/일반).
  const handleRole = useCallback(
    async (
      targetUserId: string,
      name: string,
      role: "manager" | "member",
    ) => {
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/role", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId, role }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
          limit?: number;
        } | null;
        if (j?.ok) {
          setNotice({
            kind: "ok",
            text:
              role === "manager"
                ? `${name} 님을 관리자로 임명했어요.`
                : `${name} 님의 직책을 해제했어요.`,
          });
          await onRefresh();
        } else {
          setNotice({
            kind: "err",
            text:
              j?.error === "manager_limit"
                ? `관리자는 최대 ${(j.limit ?? MANAGER_LIMIT).toLocaleString()}명까지 임명할 수 있어요.`
                : `처리에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "처리에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [onRefresh, setActing, setNotice],
  );

  // 마스터가 길드원 추방.
  const handleKick = useCallback(
    async (targetUserId: string, name: string) => {
      if (acting) return;
      if (!(await confirmGameAction(`${name} 님을 길드에서 추방할까요?`))) return;
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/kick", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({ kind: "ok", text: `${name} 님을 추방했어요.` });
          await onRefresh();
        } else {
          setNotice({
            kind: "err",
            text: `추방에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "추방에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, setActing, setNotice],
  );

  // 마스터가 마스터직 양도.
  const handleTransfer = useCallback(
    async (targetUserId: string, name: string) => {
      if (acting) return;
      if (
        !(await confirmGameAction(
          `${name} 님에게 길드 마스터를 양도할까요? 되돌릴 수 없어요.`,
        ))
      ) {
        return;
      }
      setActing(true);
      setNotice(null);
      try {
        const res = await fetch("/api/v2/guild/transfer", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ targetUserId }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (j?.ok) {
          setNotice({ kind: "ok", text: `${name} 님에게 마스터를 양도했어요.` });
          await onRefresh();
          onGuildChanged?.();
        } else {
          setNotice({
            kind: "err",
            text: `양도에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
          });
        }
      } catch {
        setNotice({ kind: "err", text: "양도에 실패했어요. 잠시 후 다시 시도해 주세요." });
      } finally {
        setActing(false);
      }
    },
    [acting, onRefresh, onGuildChanged, setActing, setNotice],
  );

  // 마스터가 길드 해산 — 길드 이름 입력으로 확인.
  const handleDisband = useCallback(async () => {
    const name = stateGuildName ?? info?.guild?.name ?? "";
    if (acting || disbandConfirm.trim() !== name || name.length === 0) return;
    setActing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/v2/guild/disband", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: disbandConfirm.trim() }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (j?.ok) {
        setNotice({ kind: "ok", text: "길드를 해산했어요." });
        setDisbandConfirm("");
        await onRefresh();
        onGuildChanged?.();
      } else {
        setNotice({
          kind: "err",
          text: `해산에 실패했어요 (${j?.error ?? `http ${res.status}`}).`,
        });
      }
    } catch {
      setNotice({ kind: "err", text: "해산에 실패했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [acting, disbandConfirm, stateGuildName, info?.guild?.name, onRefresh, onGuildChanged, setActing, setNotice]);

  // 관리 탭 내부 하위 탭 — 멤버/길드 연구는 관리자+, 길드 설정은 마스터 전용.
  //   관리자(비마스터)는 설정 탭 미노출. 멤버 탭에 가입 신청 대기 뱃지.
  const manageTabs: { key: GuildManageTab; label: string }[] = [
    {
      key: "members",
      label:
        pendingRequests.length > 0 ? `멤버 (${pendingRequests.length})` : "멤버",
    },
    { key: "research", label: "길드 연구" },
  ];
  if (isMaster) manageTabs.push({ key: "settings", label: "길드 설정" });
  const activeManageTab: GuildManageTab = manageTabs.some(
    (t) => t.key === manageTab,
  )
    ? manageTab
    : "members";
  const managerCount = (info?.members ?? []).filter(
    (m) => m.role === "manager" || m.role === "vice_master",
  ).length;

  return (
    <div className="space-y-4">
      {notice && <NoticeBanner notice={notice} />}

      {/* 관리 탭이 비대해져 내부 하위 탭으로 분리 — 멤버 / 길드 연구 / 길드 설정.
          지역 배경 위라 surface(HeaderPanel)로 감싸야 보임 — 상위 탭과 동일 패턴([[ui-design-system-surfaces]] #888/#890). */}
      <HeaderPanel className="py-2">
        <TabBar
          tabs={manageTabs}
          active={activeManageTab}
          onChange={setManageTab}
          ariaLabel="길드 관리 하위 탭"
          size="sm"
          variant="highlight"
        />
      </HeaderPanel>

      {activeManageTab === "research" && (
        <div className="space-y-3">
          <GuildLevelUpgradePanel
            info={info}
            acting={acting}
            setActing={setActing}
            setNotice={setNotice}
            onRefresh={onRefresh}
          />
          <GuildCombatSupplyPanel />
        </div>
      )}

      {/* ── 멤버: 멤버 초대 · 가입 신청 · 직책 관리 ── */}
      {/* 멤버 초대 — 길드원 탭에서 이동 */}
      {activeManageTab === "members" && guildId != null && (
        <div className={`ui-workshop-card ${SURFACE_CARD} p-3`}>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            멤버 초대
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            닉네임으로 초대하면 상대 우편함에 도착해요. 상대가 수락하면 합류합니다 (정원{" "}
            {info?.members?.length ?? 0}/{info?.memberCap ?? GUILD_BASE_MEMBER_CAP}).
          </p>
          <div className="mt-2 flex gap-2">
            <input
              type="text"
              value={inviteName}
              onChange={(e) => setInviteName(e.target.value)}
              placeholder="초대할 닉네임"
              disabled={acting}
              maxLength={64}
              className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:focus:border-zinc-400"
            />
            <button
              type="button"
              onClick={handleInvite}
              disabled={acting || inviteName.trim().length === 0}
              className="shrink-0 rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              초대
            </button>
          </div>
        </div>
      )}

      {/* ── 길드 설정: 소개 · 엠블럼 · 위험 구역(해산) ── */}
      {activeManageTab === "settings" && isMaster && (
        <div className={`${SURFACE_CARD} p-3`}>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 소개
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            길드 둘러보기와 랭킹 정보창에 표시되는 짧은 소개입니다.
          </p>
          <textarea
            value={descriptionValue}
            onChange={(event) => setDescriptionDraft(event.target.value)}
            disabled={acting}
            maxLength={GUILD_DESCRIPTION_MAX}
            rows={3}
            placeholder="우리 길드를 간단히 소개해 주세요."
            className="mt-3 block w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
              {descriptionValue.length}/{GUILD_DESCRIPTION_MAX}자
            </span>
            <button
              type="button"
              onClick={() => void handleDescriptionSave()}
              disabled={
                acting ||
                descriptionValue.trim() === (info?.guild?.description ?? "").trim()
              }
              className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              소개 저장
            </button>
          </div>
        </div>
      )}

      {/* 길드 엠블럼 — 마스터 전용. */}
      {activeManageTab === "settings" && isMaster && (
        <div className={`${SURFACE_CARD} p-3`}>
          <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
            길드 엠블럼
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            게임 내 이미지는 무료로 선택할 수 있고, 직접 이미지를 등록할 때만 길드장의
            개인 무슨 코인이 사용됩니다.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <GuildEmblemImage
              emblem={info?.guild?.emblem}
              guildName={info?.guild?.name ?? stateGuildName ?? "길드"}
              className="h-20 w-20"
            />
            <div className="min-w-0 text-xs text-zinc-500 dark:text-zinc-400">
              현재 길드 엠블럼
              <div className="mt-1 font-medium text-amber-700 dark:text-amber-300">
                내 무슨 코인 {museunCoins == null ? "확인 중…" : `${museunCoins.toLocaleString()}개`}
              </div>
            </div>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              게임 내 이미지 · 무료
            </div>
            <AvatarPicker
              category={emblemCategory}
              onCategoryChange={setEmblemCategory}
              selected={selectedGameEmblem}
              onSelect={setSelectedGameEmblem}
            />
            <button
              type="button"
              onClick={() => void handleSetGameEmblem()}
              disabled={acting || !selectedGameEmblem}
              className="mt-2 w-full rounded-md bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              선택한 게임 이미지 적용 (무료)
            </button>
          </div>

          <div className="mt-4 border-t border-zinc-200 pt-4 dark:border-zinc-700">
            <div className="mb-2 text-xs font-semibold text-zinc-700 dark:text-zinc-200">
              직접 이미지 등록 · 무슨 코인 {GUILD_CUSTOM_EMBLEM_COIN_COST.toLocaleString()}개
            </div>
            <div className="min-w-0">
              <input
                ref={emblemInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  if (
                    file &&
                    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
                  ) {
                    setEmblemFile(null);
                    event.target.value = "";
                    setNotice({
                      kind: "err",
                      text: "JPG, PNG, WebP 이미지 파일만 선택할 수 있어요.",
                    });
                    return;
                  }
                  if (file && file.size > GUILD_EMBLEM_IMAGE_MAX_BYTES) {
                    setEmblemFile(null);
                    event.target.value = "";
                    setNotice({ kind: "err", text: "이미지는 2MB 이하여야 해요." });
                    return;
                  }
                  setEmblemFile(file);
                  setNotice(null);
                }}
                disabled={acting}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700 file:mr-3 file:rounded file:border-0 file:bg-emerald-600 file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-white disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
              />
              <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                JPG·PNG·WebP, 2MB 이하 · 256px WebP로 안전하게 변환
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (emblemFile) void handleSetEmblem(emblemFile);
                  }}
                  disabled={
                    acting ||
                    !emblemFile ||
                    (museunCoins ?? 0) < GUILD_CUSTOM_EMBLEM_COIN_COST
                  }
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                >
                  직접 등록 이미지 적용
                </button>
                <button
                  type="button"
                  onClick={() => void handleSetEmblem(null)}
                  disabled={acting || !info?.guild?.emblem}
                  className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200"
                >
                  엠블럼 제거
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 가입 신청 (멤버 탭) */}
      {activeManageTab === "members" && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            가입 신청
          </div>
          {pendingRequests.length === 0 ? (
            <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "대기 중인 가입 신청이 없어요."}
            </div>
          ) : (
            <ul className="space-y-1.5">
              {pendingRequests.map((r) => (
                <li
                  key={r.requestId}
                  className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                >
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-sm font-medium">
                      <PlayerNameLink name={r.name} />
                    </span>
                    <div className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                      Lv.{r.level} · 신청 {fmtDate(r.requestedAt)}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        void handleRequest(r.requestId, r.name, "accept")
                      }
                      disabled={acting}
                      className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      수락
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        void handleRequest(r.requestId, r.name, "decline")
                      }
                      disabled={acting}
                      className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
                    >
                      거절
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 직책 관리 — 마스터 전용. 관리자 임명/해임. (멤버 탭) */}
      {activeManageTab === "members" && isMaster && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
            직책 관리
          </div>
          <p className="text-xs text-zinc-600 dark:text-zinc-400">
            관리자는 최대 {MANAGER_LIMIT}명까지 임명할 수 있고, 초대·가입 신청·시설 관리·길드 연구를 쓸 수 있어요.
          </p>
          <ul className="space-y-1.5">
            {(info?.members ?? [])
              .filter((m) => m.role !== "master")
              .map((m) => {
                const currentRole =
                  m.role === "manager" || m.role === "vice_master"
                    ? "manager"
                    : "member";
                const managerOptionDisabled =
                  currentRole !== "manager" && managerCount >= MANAGER_LIMIT;
                return (
                  <li
                    key={m.userId}
                    className="ui-guild-row flex items-center justify-between gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex min-w-0 items-center gap-1.5">
                      {currentRole === "manager" && (
                        <span className="shrink-0 rounded bg-sky-500 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          관리자
                        </span>
                      )}
                      <span className="truncate text-sm font-medium">
                        <PlayerNameLink name={m.name} />
                      </span>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <select
                        value={currentRole}
                        onChange={(e) =>
                          void handleRole(
                            m.userId,
                            m.name,
                            e.target.value as "manager" | "member",
                          )
                        }
                        disabled={acting}
                        className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs font-medium text-zinc-700 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200"
                      >
                        <option value="member">일반</option>
                        <option value="manager" disabled={managerOptionDisabled}>
                          관리자
                        </option>
                      </select>
                      <button
                        type="button"
                        onClick={() => void handleTransfer(m.userId, m.name)}
                        disabled={acting}
                        className="rounded-md border border-amber-600 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                      >
                        양도
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleKick(m.userId, m.name)}
                        disabled={acting}
                        className="rounded-md border border-rose-600 bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                      >
                        추방
                      </button>
                    </div>
                  </li>
                );
              })}
            {(info?.members ?? []).filter((m) => m.role !== "master")
              .length === 0 && (
              <li className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-4 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400">
                임명할 길드원이 없어요.
              </li>
            )}
          </ul>
        </div>
      )}

      {/* 위험 구역 — 길드 해산(마스터 전용). 금고 소멸·되돌릴 수 없음. (설정 탭) */}
      {activeManageTab === "settings" && isMaster && (
        <div className="space-y-2">
          <div className="text-xs font-medium uppercase tracking-wider text-rose-500">
            위험 구역
          </div>
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 dark:border-rose-900/60 dark:bg-zinc-950">
            <p className="text-xs text-rose-700 dark:text-rose-300">
              길드를 해산하면 모든 길드원이 방출되고, 금고 골드(
              {(info?.guildGold ?? 0).toLocaleString()} G)가 소멸합니다. 되돌릴 수 없어요.
            </p>
            <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-400">
              확인을 위해 길드 이름{" "}
              <span className="font-semibold">
                {stateGuildName ?? info?.guild?.name}
              </span>{" "}
              을 입력하세요.
            </p>
            <div className="mt-2 flex gap-2">
              <input
                type="text"
                value={disbandConfirm}
                onChange={(e) => setDisbandConfirm(e.target.value)}
                placeholder="길드 이름"
                disabled={acting}
                maxLength={GUILD_NAME_MAX}
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-rose-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
              />
              <button
                type="button"
                onClick={() => void handleDisband()}
                disabled={
                  acting ||
                  disbandConfirm.trim() !==
                    (stateGuildName ?? info?.guild?.name ?? "")
                }
                className="shrink-0 rounded-md border border-rose-700 bg-rose-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-rose-700 disabled:opacity-50"
              >
                해산
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
