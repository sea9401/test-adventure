"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { StatusBanner } from "@/components/ui/StatusBanner";
import {
  SURFACE_ACCENT,
  SURFACE_CARD,
  SURFACE_INSET,
} from "@/components/ui/surfaces";
import {
  EQUIPMENT_LIBERATION_GOLD_COST,
  type LiberationRank,
} from "@/adventure/data/v2/equipmentLiberation";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  LIBERATION_LINE_COUNT_CHANCES,
  formatLiberationOptionRoll,
  liberationCandidateRows,
  liberationOptionProbabilityRows,
  liberationPromotionChancePct,
  liberationRankLevelDistribution,
  liberationRankLevelSummary,
} from "./equipmentLiberationViewModel";

type LiberationApiResponse = {
  ok?: boolean;
  error?: string;
  item?: V2EquipInstance;
  gold?: number;
  bankedGold?: number;
};

type PendingRequest = {
  iid: string;
  revision: number;
  requestId: string;
};

export type EquipmentLiberationPanelProps = {
  owned: readonly V2EquipInstance[];
  equipped: Partial<Record<V2EquipSlot, string>>;
  gold: number;
  bankedGold: number;
  initialItemIid?: string;
  onItemUpdated: (item: V2EquipInstance) => void;
  onWalletUpdated: (gold: number, bankedGold: number) => void;
};

function errorMessage(error: string | undefined): string {
  switch (error) {
    case "insufficient_gold":
      return "골드가 부족합니다.";
    case "ineligible":
      return "이 장비는 해방할 수 없습니다.";
    case "not_owned":
      return "보유하지 않은 장비입니다.";
    case "stale_state":
      return "다른 작업에서 장비 상태가 바뀌어 최신 상태를 불러왔습니다.";
    default:
      return "해방에 실패했습니다. 잠시 후 다시 시도해 주세요.";
  }
}

export function EquipmentLiberationPanel({
  owned,
  equipped,
  gold,
  bankedGold,
  initialItemIid,
  onItemUpdated,
  onWalletUpdated,
}: EquipmentLiberationPanelProps) {
  const candidates = useMemo(
    () => liberationCandidateRows(owned, equipped),
    [equipped, owned],
  );
  const [selectedIid, setSelectedIid] = useState(initialItemIid ?? "");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{
    tone: "success" | "warning";
    text: string;
  } | null>(null);
  const [result, setResult] = useState<{
    rank: LiberationRank;
    promoted: boolean;
  } | null>(null);
  const pendingRequest = useRef<PendingRequest | null>(null);
  const selected =
    candidates.find((candidate) => candidate.iid === selectedIid) ??
    candidates[0];
  const instance = selected?.item;
  const item = instance ? V2_EQUIPMENT[instance.id] : undefined;
  const current = instance?.liberation;
  const isReroll = current != null;
  const spendable = gold + bankedGold;
  const probabilityRows = item ? liberationOptionProbabilityRows(item.slot) : [];

  useEffect(() => {
    if (!confirmOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) setConfirmOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, confirmOpen]);

  async function submit(): Promise<void> {
    if (!instance || busy) return;
    const revision = current?.revision ?? 0;
    const reusable = pendingRequest.current;
    const request =
      reusable?.iid === instance.iid && reusable.revision === revision
        ? reusable
        : { iid: instance.iid, revision, requestId: crypto.randomUUID() };
    pendingRequest.current = request;
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const response = await fetch("/api/v2/me/equipment/liberate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          iid: request.iid,
          requestId: request.requestId,
          expectedRevision: request.revision,
        }),
      });
      const body = (await response.json()) as LiberationApiResponse;
      pendingRequest.current = null;
      if (!response.ok || !body.ok || !body.item) {
        if (
          response.status === 409 &&
          body.error === "stale_state" &&
          body.item
        ) {
          onItemUpdated(body.item);
        }
        setMessage({ tone: "warning", text: errorMessage(body.error) });
        return;
      }
      const previousRank = current?.rank ?? 3;
      onItemUpdated(body.item);
      onWalletUpdated(body.gold ?? gold, body.bankedGold ?? bankedGold);
      setResult({
        rank: body.item.liberation?.rank ?? previousRank,
        promoted:
          body.item.liberation != null &&
          body.item.liberation.rank < previousRank,
      });
      setMessage({
        tone: "success",
        text: isReroll
          ? "재해방이 완료되었습니다."
          : "장비 해방이 완료되었습니다.",
      });
    } catch {
      setMessage({
        tone: "warning",
        text: "연결에 실패했습니다. 다시 시도하면 같은 요청으로 안전하게 이어집니다.",
      });
    } finally {
      setBusy(false);
      setConfirmOpen(false);
    }
  }

  if (candidates.length === 0) {
    return (
      <section className={`${SURFACE_CARD} p-5`}>
        <h2 className="font-semibold">장비 해방</h2>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-300">
          해방 가능한 6T 이상 장비가 없습니다. 폭풍 개량 장비는 해방할 수 없습니다.
        </p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(240px,0.8fr)_minmax(0,1.4fr)]">
      <div className={`${SURFACE_CARD} p-4`}>
        <h2 className="text-sm font-bold">해방 대상 장비</h2>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">6T 이상 · 폭풍 개량 제외</p>
        <div className="mt-3 space-y-2" role="listbox" aria-label="해방 대상 장비">
          {candidates.map((candidate) => {
            const active = candidate.iid === selected?.iid;
            return (
              <button
                key={candidate.iid}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  if (busy) return;
                  setSelectedIid(candidate.iid);
                  setMessage(null);
                  setResult(null);
                }}
                className={`${SURFACE_INSET} w-full px-3 py-2 text-left transition-colors ${
                  active ? "ring-2 ring-violet-500" : "hover:border-violet-400"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{candidate.name}</span>
                  {candidate.isEquipped ? <span className="shrink-0 text-[11px] text-emerald-700 dark:text-emerald-300">장착 중</span> : null}
                </div>
                <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {candidate.displayTier}T · {candidate.rank ? `해방 ${candidate.rank} · ${candidate.lineCount}줄` : "미해방"}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={`${SURFACE_CARD} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">장비 해방 작업대</p>
            <h2 className="mt-1 text-lg font-bold">{selected?.name}</h2>
            <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-300">
              {current ? `해방 ${current.rank} · ${current.lineCount}줄` : "아직 해방되지 않은 장비"}
            </p>
          </div>
          <div className={`${SURFACE_INSET} px-3 py-2 text-right text-xs tabular-nums`}>
            <div>비용 <strong>{EQUIPMENT_LIBERATION_GOLD_COST.toLocaleString()} G</strong></div>
            <div className="mt-1 text-zinc-500 dark:text-zinc-400">결제 가능 {spendable.toLocaleString()} G</div>
          </div>
        </div>

        {current ? (
          <div className={`${SURFACE_ACCENT} mt-4 p-3`}>
            <div className="text-sm font-bold">현재 옵션</div>
            <ul className="mt-2 space-y-1 text-sm">
              {current.options.map((option) => (
                <li key={option.id} className="flex justify-between gap-3">
                  <span>{formatLiberationOptionRoll(option)}</span>
                  <span className="shrink-0 text-xs text-zinc-500 dark:text-zinc-400">Lv.{option.level}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className={`${SURFACE_INSET} mt-4 p-3 text-sm`}>
          {current ? (
            <>
              <p className="font-semibold text-rose-700 dark:text-rose-300">재해방하면 현재 옵션 전체가 즉시 소멸합니다.</p>
              <p className="mt-2">{current.rank === 1 ? "최고 단계 유지" : `해방 ${current.rank - 1} 승급 ${liberationPromotionChancePct(current.rank)}%`}</p>
              <div className="mt-3 space-y-1.5 text-xs text-zinc-600 dark:text-zinc-300">
                {([3, 2, 1] as const).map((rank) => (
                  <div key={rank}>
                    <strong>{liberationRankLevelSummary(rank)}</strong>
                    <span className="ml-2">
                      {liberationRankLevelDistribution(rank).map(({ level, chancePct }) => `Lv.${level} ${chancePct}%`).join(" · ")}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p><strong>성공 즉시 귀속</strong>되며 거래할 수 없습니다.</p>
              <p className="mt-1"><strong>줄 수는 영구 고정</strong>되어 재해방해도 바뀌지 않습니다.</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {LIBERATION_LINE_COUNT_CHANCES.map(({ lineCount, chancePct }) => (
                  <span key={lineCount} className="rounded-md border border-zinc-300 bg-white px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900">{lineCount}줄 {chancePct}%</span>
                ))}
              </div>
            </>
          )}
        </div>

        <details className={`${SURFACE_INSET} mt-4 p-3`}>
          <summary className="cursor-pointer text-sm font-semibold">옵션 출현 확률</summary>
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">2·3번째 줄은 이미 선택된 옵션을 제외하고 남은 가중치로 다시 계산됩니다.</p>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="w-full text-left text-xs">
              <thead><tr className="text-zinc-500 dark:text-zinc-400"><th className="py-1">옵션</th><th>가중치</th><th>첫 줄 확률</th></tr></thead>
              <tbody>
                {probabilityRows.map((row) => (
                  <tr key={row.id} className="border-t border-zinc-200 dark:border-zinc-700">
                    <td className="py-1.5">{row.label}</td><td>{row.weight}</td><td>{row.firstLineChancePct.toFixed(2)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>

        {result ? (
          <div className={`${result.promoted ? SURFACE_ACCENT : SURFACE_INSET} mt-4 p-3 text-sm font-semibold`} role="status">
            {result.promoted ? `단계 상승! 해방 ${result.rank}` : `결과: 해방 ${result.rank}`}
          </div>
        ) : null}
        {message ? <div className="mt-4"><StatusBanner tone={message.tone}>{message.text}</StatusBanner></div> : null}

        <Button
          className="mt-4 w-full"
          size="md"
          variant="primary"
          disabled={busy || spendable < EQUIPMENT_LIBERATION_GOLD_COST}
          onClick={() => setConfirmOpen(true)}
        >
          {busy ? "작업 중…" : isReroll ? "재해방" : "해방"}
        </Button>

        {confirmOpen ? (
          <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center" role="presentation">
            <div className={`${SURFACE_CARD} w-full max-w-md p-5`} role="dialog" aria-modal="true" aria-label={isReroll ? "재해방 확인" : "장비 해방 확인"}>
              <h3 className="text-lg font-bold">{isReroll ? "현재 옵션을 모두 지우고 재해방할까요?" : "이 장비를 해방할까요?"}</h3>
              <p className="mt-3 text-sm leading-relaxed text-zinc-600 dark:text-zinc-300">
                {isReroll ? "줄 수는 유지되지만 현재 옵션은 되돌릴 수 없이 사라집니다." : "성공한 장비는 즉시 귀속되고, 결정된 줄 수는 영구 고정됩니다."}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-2">
                <Button disabled={busy} onClick={() => setConfirmOpen(false)}>취소</Button>
                <Button disabled={busy} variant="primary" onClick={() => void submit()}>
                  {busy ? "작업 중…" : `${EQUIPMENT_LIBERATION_GOLD_COST.toLocaleString()} G 지불하고 ${isReroll ? "재해방" : "해방"}`}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
