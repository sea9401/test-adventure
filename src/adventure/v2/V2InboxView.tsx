"use client";

import { useCallback, useEffect, useState } from "react";
import { Envelope } from "@phosphor-icons/react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { fetchInbox, type InboxItem } from "@/adventure/marketplace/api";

// v2 우편함 — 받은 쪽지(user_message) + 마켓 정산·선물·길드 보상 등 수령.
// 백엔드(/api/marketplace/inbox 목록 + /claim)는 이미 v2 호환(claim 이 character.v2 골드/
// inventory.v2 에 적용). 옛 V1 InboxView 는 GameContext·V1 데이터에 얽혀 죽은 채 삭제됐고,
// v2 엔 이 읽기/수령 UI 가 빠져 있어 신설한다(쪽지 보내기는 SendMessageModal 로 됨).

// 길드 초대는 v2 에 수락/거절 UI 가 아직 없다(길드 탭은 둘러보기/가입신청만 처리). 그냥
// 수령하면 수락 없이 dismiss 되어버리므로, 처리 경로가 생기기 전까진 우편함에서 숨긴다
// (행은 DB 에 미수령으로 남음 — 후속에서 초대 수락 UI 붙일 때 노출). [[project-v1-cleanup-and-decouple]]
const HIDDEN = (it: InboxItem) => it.kind === "guild_invite";

// 표시 본문 — user_message 는 본문이 payload.text 에 있고 message 컬럼은 비어있다(보내기
// 라우트가 text 를 payload 에만 저장). 그 외 kind 는 서버 message 요약 ?? kind 라벨.
function bodyOf(it: InboxItem): string {
  if (it.kind === "user_message") {
    const t = (it.payload as { text?: unknown })?.text;
    return typeof t === "string" && t.length > 0 ? t : "(내용 없음)";
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

export function V2InboxView({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<InboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchInbox();
      setItems(r.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "우편함 로드 실패");
      setItems([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 로드
    void load();
  }, [load]);

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
          error?: string;
        } | null;
        if (!res.ok || !j?.ok) {
          setError(j?.error ?? `수령 실패 (${res.status})`);
          return;
        }
        const gold = j.goldAdded ?? 0;
        setMsg(gold > 0 ? `✓ 수령 완료 — +${gold.toLocaleString()} 골드` : "✓ 수령 완료");
        await load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "수령 실패");
      } finally {
        setBusy(false);
      }
    },
    [busy, load],
  );

  const displayed = (items ?? []).filter((it) => !HIDDEN(it));
  const claimableIds = displayed.map((i) => i.id);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <BackButton onClick={onBack} />
        <div className="mt-1 flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold">우편함</h1>
          {claimableIds.length > 0 && (
            <button
              type="button"
              onClick={() => claim(claimableIds)}
              disabled={busy}
              className="rounded-md border border-emerald-700 bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              전체 수령 ({claimableIds.length})
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          받은 쪽지와 마켓 정산·보상을 확인하고 수령합니다.
        </p>
      </header>

      {msg && (
        <div className="text-sm text-emerald-700 dark:text-emerald-400">{msg}</div>
      )}
      {error && (
        <div className="text-sm text-rose-600 dark:text-rose-400">{error}</div>
      )}

      {items === null ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">불러오는 중…</div>
        </Card>
      ) : displayed.length === 0 ? (
        <Card padding="md">
          <div className="flex flex-col items-center gap-2 py-6 text-zinc-400 dark:text-zinc-500">
            <Envelope size={32} weight="duotone" />
            <div className="text-sm">우편함이 비어 있어요.</div>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayed.map((it) => (
            <Card key={it.id} padding="sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                    <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                      {KIND_LABEL[it.kind]}
                    </span>
                    {it.fromName && <span>· {it.fromName}</span>}
                    <span>· {timeAgo(it.createdAt)}</span>
                  </div>
                  <div className="mt-1 whitespace-pre-wrap break-words text-sm text-zinc-800 dark:text-zinc-100">
                    {bodyOf(it)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => claim([it.id])}
                  disabled={busy}
                  className="shrink-0 rounded-md border border-zinc-300 bg-white px-2.5 py-1 text-xs hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                >
                  {it.kind === "user_message" ? "확인" : "수령"}
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
