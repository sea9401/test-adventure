import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";
import { SURFACE_CARD } from "@/components/ui/surfaces";
import {
  GUILD_MESSAGE_DAILY_LIMIT,
  GUILD_MESSAGE_MAX_LENGTH,
} from "@/adventure/data/guild";
import type { Notice } from "./guildShared";
import {
  fetchGuildMessageQuota,
  sendGuildMessage,
  type GuildMessageQuota,
} from "./guildMessageClient";

// 길드 쪽지 — 마스터·관리자가 길드원 전체 우편함으로 한 번에 보내는 쪽지(관리 탭 멤버 하위 탭).
export function GuildMessageComposer({
  acting,
  setActing,
  setNotice,
}: {
  acting: boolean;
  setActing: (v: boolean) => void;
  setNotice: (n: Notice | null) => void;
}) {
  const [draft, setDraft] = useState("");
  const [quota, setQuota] = useState<GuildMessageQuota | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchGuildMessageQuota()
      .then((q) => {
        if (!cancelled) setQuota(q);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const text = draft.trim();
  const exhausted = quota != null && quota.remaining <= 0;

  const handleSend = useCallback(async () => {
    if (acting || text.length === 0) return;
    setActing(true);
    setNotice(null);
    try {
      const r = await sendGuildMessage(text);
      if (r.ok) {
        setNotice({
          kind: "ok",
          text: `길드원 ${r.sentCount}명에게 쪽지를 보냈어요. 오늘 ${r.remaining}번 더 보낼 수 있어요.`,
        });
        setDraft("");
        setQuota((q) => (q ? { ...q, remaining: r.remaining } : q));
      } else {
        setNotice({ kind: "err", text: r.message });
        const remaining = r.remaining;
        if (remaining != null) setQuota((q) => (q ? { ...q, remaining } : q));
      }
    } catch {
      setNotice({ kind: "err", text: "보내지 못했어요. 잠시 후 다시 시도해 주세요." });
    } finally {
      setActing(false);
    }
  }, [acting, text, setActing, setNotice]);

  return (
    <div className={`ui-workshop-card ${SURFACE_CARD} p-3`}>
      <div className="flex items-baseline justify-between gap-3">
        <div className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
          길드 쪽지
        </div>
        {quota && (
          <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
            오늘 남은 횟수 {quota.remaining}/{quota.limit}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
        길드원 전체 우편함에 쪽지를 보내요
        {quota ? ` (받는 길드원 ${quota.recipientCount}명)` : ""}. 마스터와 관리자가
        24시간 동안 함께 {quota?.limit ?? GUILD_MESSAGE_DAILY_LIMIT}번까지 보낼 수 있어요.
      </p>
      <textarea
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        disabled={acting || exhausted}
        maxLength={GUILD_MESSAGE_MAX_LENGTH}
        rows={3}
        placeholder="길드원에게 전할 내용을 적어 주세요."
        aria-label="길드 쪽지 내용"
        className="mt-3 block w-full resize-none rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-800 outline-none focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
          {draft.length}/{GUILD_MESSAGE_MAX_LENGTH}자
        </span>
        <Button
          variant="primary"
          onClick={() => void handleSend()}
          disabled={acting || exhausted || text.length === 0}
        >
          보내기
        </Button>
      </div>
    </div>
  );
}
