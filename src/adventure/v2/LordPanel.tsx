"use client";

import { useCallback, useEffect, useState } from "react";

// 정착지 전쟁 — 거점 영주/세금 패널. 설계: docs/v2-settlement-warfare-plan.md §2.4.
//   모든 길드원: 현재 영주 + 거점 금고 표시. 영주 본인: 세금 수확(6h 쿨·10% 개인/90% 길드).
//   마스터/부마스터(canManage): 영주 지정/해제(길드원 목록). PR-4·플래그 on 전용.

type Lord = {
  userId: string;
  name: string;
  onCooldown: boolean;
  nextHarvestAt: string | null;
} | null;
type Member = { userId: string; name: string };

// 세금 수확 쿨다운 남은 시간 — nextHarvestAt 까지 "N시간 M분 후" / "M분 후" (지났으면 빈 문자열).
function formatCooldown(nextHarvestAt: string | null): string {
  if (!nextHarvestAt) return "";
  const ms = new Date(nextHarvestAt).getTime() - Date.now();
  if (ms <= 0) return "";
  const totalMin = Math.ceil(ms / 60_000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}시간 ${m}분 후` : `${m}분 후`;
}

export default function LordPanel({
  outpostId,
  canManage,
  viewerUserId,
}: {
  outpostId: string;
  canManage: boolean;
  viewerUserId: string | null;
}) {
  const [lord, setLord] = useState<Lord>(null);
  const [treasury, setTreasury] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(
        `/api/v2/outpost/lord?outpostId=${encodeURIComponent(outpostId)}`,
      );
      const j = r.ok ? await r.json() : null;
      if (j?.ok) {
        setLord(j.lord ?? null);
        setTreasury(j.treasuryGold ?? 0);
      }
    } catch {
      /* 표시 전용 */
    }
    setLoaded(true);
  }, [outpostId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트/거점 변경 시 영주 정보 fetch
    void load();
  }, [load]);

  useEffect(() => {
    if (!canManage) return;
    fetch("/api/v2/me/guild/info")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (Array.isArray(j?.members)) {
          setMembers(
            j.members.map((m: { userId: string; name: string }) => ({
              userId: m.userId,
              name: m.name,
            })),
          );
        }
      })
      .catch(() => {});
  }, [canManage]);

  const setLordTo = useCallback(
    async (uid: string | null, action: "set" | "clear") => {
      setBusy(true);
      setMsg(null);
      try {
        const r = await fetch("/api/v2/outpost/lord", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ outpostId, userId: uid, action }),
        });
        const j = await r.json().catch(() => null);
        if (j?.ok) await load();
        else setMsg(j?.error ?? "실패");
      } catch {
        setMsg("network");
      } finally {
        setBusy(false);
      }
    },
    [outpostId, load],
  );

  const harvest = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/v2/outpost/lord/harvest", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ outpostId }),
      });
      const j = await r.json().catch(() => null);
      if (j?.ok) {
        setMsg(
          j.total > 0
            ? `세금 수확 — 개인 ${j.lordCut.toLocaleString()} / 길드 ${j.guildCut.toLocaleString()} 골드`
            : "거점 금고가 비어 있습니다.",
        );
        await load();
      } else {
        setMsg(
          j?.error === "cooldown"
            ? "아직 세금 수확 쿨다운입니다."
            : (j?.error ?? "실패"),
        );
      }
    } catch {
      setMsg("network");
    } finally {
      setBusy(false);
    }
  }, [outpostId, load]);

  if (!loaded) return null;
  const amLord = !!lord && lord.userId === viewerUserId;

  return (
    // 외곽 카드 없이 — 정책 편집기와 같은 거점 묶음 안에서 상단 경계선으로 구분(borderless).
    <div className="space-y-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
      <div className="text-xs font-medium uppercase tracking-wider text-zinc-500">
        영주 · 세금
      </div>
      <p className="text-sm">
        영주:{" "}
        {lord ? (
          <strong>{lord.name}</strong>
        ) : (
          <span className="text-zinc-400">없음</span>
        )}{" "}
        · 거점 금고 <strong>{treasury.toLocaleString()}</strong> 골드
      </p>

      {amLord && (
        <button
          type="button"
          onClick={harvest}
          disabled={busy || !!lord?.onCooldown}
          className="rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {lord?.onCooldown
            ? `세금 수확 쿨다운 — ${formatCooldown(lord.nextHarvestAt) || "곧 가능"}`
            : "세금 수확 (10% 개인 / 90% 길드)"}
        </button>
      )}

      {canManage && (
        <div className="space-y-1.5 border-t border-zinc-200 pt-2 dark:border-zinc-700">
          <div className="text-xs text-zinc-500">영주 지정 (마스터·부마스터)</div>
          <div className="flex flex-wrap gap-1.5">
            {members.map((m) => (
              <button
                key={m.userId}
                type="button"
                onClick={() => setLordTo(m.userId, "set")}
                disabled={busy || lord?.userId === m.userId}
                className="rounded-md border border-zinc-300 px-2 py-1 text-xs transition hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:hover:bg-zinc-800"
              >
                {m.name}
                {lord?.userId === m.userId ? " ✓" : ""}
              </button>
            ))}
            {lord && (
              <button
                type="button"
                onClick={() => setLordTo(null, "clear")}
                disabled={busy}
                className="rounded-md border border-rose-300 px-2 py-1 text-xs text-rose-700 transition hover:bg-rose-50 disabled:opacity-50 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950"
              >
                영주 해제
              </button>
            )}
          </div>
        </div>
      )}

      {msg && (
        <p className="text-xs text-emerald-600 dark:text-emerald-400">{msg}</p>
      )}
    </div>
  );
}
