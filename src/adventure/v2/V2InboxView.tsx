"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Envelope, PaperPlaneTilt, X } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";
import { SendMessageModal } from "@/adventure/marketplace/SendMessageModal";
import { useEscapeKey } from "@/lib/useEscapeKey";
import { useModalA11y } from "@/lib/useModalA11y";
import {
  fetchInbox,
  fetchInboxHistory,
  type InboxItem,
} from "@/adventure/marketplace/api";
import {
  acceptGuildInvite,
  declineGuildInvite,
  GuildError,
} from "@/adventure/guild/api";
import { useGameState } from "@/adventure/v2/GameStateProvider";

// v2 우편함 — 받은 쪽지(user_message) + 마켓 정산·선물·길드 보상 등 수령.
// 백엔드(/api/marketplace/inbox 목록 + /claim)는 이미 v2 호환(claim 이 character.v2 골드/
// inventory.v2 에 적용). 옛 V1 InboxView 는 GameContext·V1 데이터에 얽혀 죽은 채 삭제됐고,
// v2 엔 이 읽기/수령 UI 가 빠져 있어 신설한다.
//
// 구성:
//   - "쪽지 쓰기" — 우편함에서 바로 글만 보내는 쪽지(SendMessageModal). 게시판에만 있던 진입점 추가.
//   - "받은 우편" 탭 — 미수령(읽지 않은) 우편. 수령/확인/초대 응답.
//   - "지난 우편" 탭 — 이미 읽은(수령한) 우편 기록(history). 읽어도 사라지지 않고 남는다.
//   - 우편 클릭 — 상세 모달로 내용 전체 확인(받은 우편·지난 우편 공통).

// 길드 초대(guild_invite)는 수령(claim)이 아니라 수락/거절 — payload.invite_id 로 accept/decline.
// 마켓 정산·선물 등 나머지는 수령(claim).
const IS_INVITE = (it: InboxItem) => it.kind === "guild_invite";

// 표시 본문 — user_message 는 본문이 payload.text 에 있고 message 컬럼은 비어있다(보내기
// 라우트가 text 를 payload 에만 저장). guild_invite 는 길드명 안내. 그 외는 message ?? 라벨.
function bodyOf(it: InboxItem): string {
  if (it.kind === "user_message") {
    const t = (it.payload as { text?: unknown })?.text;
    return typeof t === "string" && t.length > 0 ? t : "(내용 없음)";
  }
  if (it.kind === "guild_invite") {
    const g = (it.payload as { guild_name?: unknown })?.guild_name;
    return typeof g === "string" && g.length > 0
      ? `${g} 길드에서 초대했어요.`
      : (it.message ?? KIND_LABEL[it.kind]);
  }
  return it.message ?? KIND_LABEL[it.kind];
}

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  user_message: "쪽지",
  sale_proceeds: "판매 대금",
  purchase_item: "구매 물품",
  cancel_return: "취소 반환",
  recipe_gift: "제작서 선물",
  listing_expired: "매물 만료",
  guild_invite: "길드 초대",
  guild_quest_reward: "길드 의뢰 보상",
  season_reward: "순위 보상",
  admin_gift: "운영자 우편",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const sec = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  return `${Math.floor(hr / 24)}일 전`;
}

function formatFull(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

type Tab = "inbox" | "history";

export function V2InboxView({ onBack }: { onBack: () => void }) {
  // 초대 수락 시 공유 길드 상태(viewerGuildId) 갱신용 — 수락하면 길드에 합류하므로.
  const { refreshGuildId } = useGameState();
  const [tab, setTab] = useState<Tab>("inbox");
  const [items, setItems] = useState<InboxItem[] | null>(null);
  // 지난 우편(기록) — 탭 진입 시 지연 로드. 수령/응답 후엔 null 로 무효화해 재로드.
  const [history, setHistory] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  // 상세 모달로 내용을 보고 있는 우편(없으면 닫힘).
  const [selected, setSelected] = useState<InboxItem | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchInbox();
      setItems(r.items);
      // 상단 우편 배지(MailboxBell) 재동기화 — 우편함 (재)로드 시(수령/초대 후) 60s 폴링 안 기다림.
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("v2inbox:refresh"));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "우편함 로드 실패");
      setItems([]);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchInboxHistory();
      setHistory(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "우편 기록 로드 실패");
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 로드
    void load();
  }, [load]);

  // 탭 전환 — 지난 우편으로 들어올 때 아직 안 불러왔으면(또는 무효화됐으면) 로드.
  const switchTab = useCallback(
    (t: Tab) => {
      setTab(t);
      if (t === "history" && history === null) void loadHistory();
    },
    [history, loadHistory],
  );

  const claim = useCallback(
    async (ids: number[]) => {
      if (ids.length === 0 || busy) return;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        const res = await fetch("/api/marketplace/inbox/claim", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ids }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          goldAdded?: number;
          coinsAdded?: { season: string; coins: number }[];
          staminaPotionsAdded?: number;
          itemsAdded?: { quantity: number }[];
          instancesAdded?: unknown[];
          error?: string;
        } | null;
        if (!res.ok || !j?.ok) {
          setError(j?.error ?? `수령 실패 (${res.status})`);
          return;
        }
        const gold = j.goldAdded ?? 0;
        // 코인은 시즌별로 다른 지갑이라 합산하지 않고 종류별로 표시.
        const coinLabel: Record<string, string> = {
          pvp: "투기장 코인",
          fishing: "낚시 코인",
          treasure: "보물 코인",
        };
        const parts: string[] = [];
        if (gold > 0) parts.push(`+${gold.toLocaleString()} 골드`);
        for (const c of j.coinsAdded ?? []) {
          if (c.coins > 0) {
            parts.push(
              `+${c.coins.toLocaleString()} ${coinLabel[c.season] ?? "코인"}`,
            );
          }
        }
        if ((j.staminaPotionsAdded ?? 0) > 0) {
          parts.push(`+스태미나 회복약 ${j.staminaPotionsAdded}개`);
        }
        // 재료/장비(운영자 우편·길드 보상 등) — 총 수량으로 요약.
        const itemQty = (j.itemsAdded ?? []).reduce(
          (s, it) => s + (it.quantity ?? 0),
          0,
        );
        const totalItems = itemQty + (j.instancesAdded?.length ?? 0);
        if (totalItems > 0) parts.push(`+아이템 ${totalItems}개`);
        setMsg(
          parts.length > 0 ? `✓ 수령 완료 — ${parts.join(" · ")}` : "✓ 수령 완료",
        );
        setSelected(null);
        // 수령한 우편은 기록으로 이동 — 지난 우편 캐시 무효화 후 받은 우편 재로드.
        setHistory(null);
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수령 실패");
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const respondInvite = useCallback(
    async (it: InboxItem, accept: boolean) => {
      const inviteId = (it.payload as { invite_id?: unknown })?.invite_id;
      if (typeof inviteId !== "number" || busy) return;
      setBusy(true);
      setError(null);
      setMsg(null);
      try {
        if (accept) {
          const r = await acceptGuildInvite(inviteId);
          setMsg(`✓ ${r.guildName} 길드에 합류했어요.`);
          // 합류로 소속이 바뀌었으니 공유 길드 상태 갱신(길드 탭·거점 로직이 viewerGuildId 사용).
          await refreshGuildId();
        } else {
          await declineGuildInvite(inviteId);
          setMsg("초대를 거절했어요.");
        }
        setSelected(null);
        await load();
      } catch (e) {
        setError(
          e instanceof GuildError
            ? e.message
            : e instanceof Error
              ? e.message
              : "처리 실패",
        );
      } finally {
        setBusy(false);
      }
    },
    [busy, load, refreshGuildId],
  );

  const displayed = (tab === "inbox" ? items : history) ?? [];
  const loading = tab === "inbox" ? items === null : history === null;
  // 길드 초대는 수락/거절(전체 수령에서 제외). 나머지가 claim 대상.
  const claimableIds = (items ?? [])
    .filter((it) => !IS_INVITE(it))
    .map((i) => i.id);

  const unreadCount = items?.length ?? 0;

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title="우편함"
        onBack={onBack}
        right={
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
          >
            <PaperPlaneTilt size={16} weight="fill" />
            쪽지 쓰기
          </button>
        }
      />

      {/* 받은 우편 / 지난 우편(기록) 탭 */}
      <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
        <TabButton
          active={tab === "inbox"}
          onClick={() => switchTab("inbox")}
          label={`받은 우편${unreadCount > 0 ? ` (${unreadCount})` : ""}`}
        />
        <TabButton
          active={tab === "history"}
          onClick={() => switchTab("history")}
          label="지난 우편"
        />
      </div>

      {/* 받은 우편 탭에서만 전체 수령 */}
      {tab === "inbox" && claimableIds.length > 0 && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => claim(claimableIds)}
            disabled={busy}
            className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            전체 수령 ({claimableIds.length})
          </button>
        </div>
      )}

      {msg && (
        <div className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</div>
      )}
      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {loading ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</div>
        </Card>
      ) : displayed.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-2 py-6 text-zinc-400 dark:text-zinc-500">
            <Envelope size={32} weight="duotone" />
            <div className="text-sm">
              {tab === "inbox"
                ? "받은 우편이 없어요."
                : "지난 우편 기록이 없어요."}
            </div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((it) => (
            <Card key={it.id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                {/* 본문 영역 클릭 → 상세 보기 */}
                <button
                  type="button"
                  onClick={() => setSelected(it)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {KIND_LABEL[it.kind]}
                    </span>
                    {it.fromName && <span>· {it.fromName}</span>}
                    <span>· {timeAgo(it.createdAt)}</span>
                  </div>
                  <div className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">
                    {bodyOf(it)}
                  </div>
                </button>
                {tab === "inbox" &&
                  (IS_INVITE(it) ? (
                    <div className="flex shrink-0 flex-col gap-1">
                      <button
                        type="button"
                        onClick={() => respondInvite(it, true)}
                        disabled={busy}
                        className="rounded-md border border-emerald-700 bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
                      >
                        수락
                      </button>
                      <button
                        type="button"
                        onClick={() => respondInvite(it, false)}
                        disabled={busy}
                        className="rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      >
                        거절
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => claim([it.id])}
                      disabled={busy}
                      className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    >
                      {it.kind === "user_message" ? "확인" : "수령"}
                    </button>
                  ))}
              </div>
            </Card>
          ))}
        </div>
      )}

      {selected && (
        <MailDetailModal
          item={selected}
          busy={busy}
          onClose={() => setSelected(null)}
          onClaim={(id) => claim([id])}
          onRespondInvite={respondInvite}
        />
      )}

      {composeOpen && (
        <SendMessageModal
          onClose={() => setComposeOpen(false)}
          onSent={(name) => setMsg(`✓ ${name} 님에게 쪽지를 보냈어요.`)}
        />
      )}
    </main>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-emerald-600 text-zinc-900 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
    </button>
  );
}

// 우편 상세 — 본문 전체 + 발신자/시각. 미수령 우편이면 수령/확인/초대응답 버튼도 노출.
function MailDetailModal({
  item,
  busy,
  onClose,
  onClaim,
  onRespondInvite,
}: {
  item: InboxItem;
  busy: boolean;
  onClose: () => void;
  onClaim: (id: number) => void;
  onRespondInvite: (it: InboxItem, accept: boolean) => void;
}) {
  const claimed = item.claimedAt != null;
  const isInvite = IS_INVITE(item);
  useEscapeKey(onClose);
  const contentRef = useRef<HTMLDivElement>(null);
  useModalA11y(contentRef);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="mail-detail-title"
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 p-4 sm:items-center"
    >
      <div
        ref={contentRef}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-lg border border-zinc-200 bg-white p-4 shadow-xl dark:border-zinc-800 dark:bg-zinc-950"
      >
        <div className="flex items-start justify-between gap-2">
          <h2
            id="mail-detail-title"
            className="flex items-center gap-1.5 text-base font-semibold text-zinc-900 dark:text-zinc-100"
          >
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
              {KIND_LABEL[item.kind]}
            </span>
            {claimed && (
              <span className="text-xs font-normal text-zinc-400 dark:text-zinc-500">
                읽음
              </span>
            )}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-900"
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
          {item.fromName && (
            <span>
              보낸이: <PlayerNameLink name={item.fromName} />
            </span>
          )}
          <span>{item.fromName ? "· " : ""}받은 시각: {formatFull(item.createdAt)}</span>
        </div>

        <div className="mt-3 max-h-[50vh] overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-zinc-50 p-3 text-sm text-zinc-800 dark:bg-zinc-900 dark:text-zinc-100">
          {bodyOf(item)}
        </div>

        <div className="mt-4 flex justify-end gap-2">
          {!claimed && isInvite ? (
            <>
              <button
                type="button"
                onClick={() => onRespondInvite(item, false)}
                disabled={busy}
                className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
              >
                거절
              </button>
              <button
                type="button"
                onClick={() => onRespondInvite(item, true)}
                disabled={busy}
                className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
              >
                수락
              </button>
            </>
          ) : !claimed ? (
            <button
              type="button"
              onClick={() => onClaim(item.id)}
              disabled={busy}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {item.kind === "user_message" ? "확인" : "수령"}
            </button>
          ) : (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
            >
              닫기
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
