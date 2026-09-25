"use client";

import { useCallback, useEffect, useState } from "react";
import { confirmGameAction } from "@/components/ui/gameDialog";
import { SURFACE_CARD, SURFACE_INSET } from "@/components/ui/surfaces";

type WeeklySupplies = {
  weekKey: string;
  funded: boolean;
  cost: number;
  potionsPerMember: number;
  guildGold: number;
  canFund: boolean;
};

export function GuildWeeklySuppliesPanel({
  onChanged,
  confirm = confirmGameAction,
}: {
  onChanged: () => void;
  confirm?: (message: string) => Promise<boolean>;
}) {
  const [data, setData] = useState<WeeklySupplies | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/v2/guild/weekly-supplies", { cache: "no-store" });
      const body = await response.json();
      if (response.ok && body.ok) setData(body as WeeklySupplies);
      else setNotice("길드 지원품 정보를 불러오지 못했습니다.");
    } catch {
      setNotice("길드 지원품 정보를 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function fund() {
    if (!data || data.funded || !data.canFund || busy || data.guildGold < data.cost) return;
    if (!(await confirm(`이번 주 길드 지원품을 마련할까요?\n길드 자금 ${data.cost.toLocaleString()} G를 사용하고 현재 길드원 모두에게 귀속 스태미나 회복약 ${data.potionsPerMember}개를 우편으로 보냅니다.`))) return;
    setBusy(true);
    setNotice("");
    try {
      const response = await fetch("/api/v2/guild/weekly-supplies", { method: "POST" });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setNotice(body.error === "already_funded" ? "이번 주 지원품은 이미 지급했습니다." : body.error === "insufficient_gold" ? "길드 자금이 부족합니다." : "길드 지원품을 마련하지 못했습니다.");
        await load();
        return;
      }
      setData({ ...data, funded: true, guildGold: body.guildGold });
      setNotice(`이번 주 지원품을 마련했습니다. 길드원 ${body.recipientCount}명에게 우편을 보냈습니다.`);
      onChanged();
    } catch {
      setNotice("길드 지원품을 마련하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`${SURFACE_CARD} space-y-3 p-3 text-sm`} aria-label="길드 주간 지원품">
      <div>
        <h2 className="font-semibold">길드 주간 지원품</h2>
        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
          길드 자금으로 이번 주 길드원에게 귀속 스태미나 회복약을 보냅니다. 결제 당시 길드원에게 우편으로 지급됩니다.
        </p>
      </div>
      {data ? (
        <>
          <div className={`${SURFACE_INSET} space-y-1 p-3 text-xs`}>
            <p>귀속 스태미나 회복약 {data.potionsPerMember}개씩 · {data.weekKey} 주간</p>
            <p>비용 {data.cost.toLocaleString()} G · 길드 자금 {data.guildGold.toLocaleString()} G</p>
          </div>
          {data.canFund ? (
            <button
              type="button"
              onClick={() => void fund()}
              disabled={busy || data.funded || data.guildGold < data.cost}
              className="ui-game-button min-h-10 rounded-md border border-amber-700 bg-amber-600 px-3 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:border-zinc-300 disabled:bg-zinc-200 disabled:text-zinc-500 dark:disabled:border-zinc-700 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
            >
              {data.funded ? "이번 주 지급 완료" : busy ? "처리 중…" : `${data.cost.toLocaleString()} G로 지원품 마련`}
            </button>
          ) : (
            <p className="text-xs text-zinc-600 dark:text-zinc-300">
              {data.funded ? "이번 주 지급 완료" : "마스터·관리자가 지원품을 마련할 수 있습니다."}
            </p>
          )}
        </>
      ) : loading ? <p className="text-xs text-zinc-500 dark:text-zinc-400">지원품 정보를 불러오는 중…</p> : null}
      {notice && <p role="status" className="text-xs text-zinc-700 dark:text-zinc-200">{notice}</p>}
    </section>
  );
}
