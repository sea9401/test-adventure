"use client";

import { useCallback, useState } from "react";
import { Card } from "@/components/ui/Card";

// 계파(스펙) 선택 + 차수별 패시브 픽 패널 — 신전 "직업" 탭, V2ClassGrid 아래.
// docs/v2-job-spec-passives-plan.md §5. 2차 전직부터 계파 선택, 전직마다 패시브 1픽.
// (리치 폴리시 — 무기 게이트 상태·전투 로그 피드백은 P5.)

export type V2SpecPassiveInfo = { id: string; name: string; desc: string };
export type V2SpecInfo = {
  id: string;
  name: string;
  requiredWeaponType: string;
  passives: V2SpecPassiveInfo[];
};
export type V2SpecState = {
  tier: number;
  available: boolean;
  choice: string | null;
  unlocked: string[];
  picksMax: number;
  picksUsed: number;
  specs: V2SpecInfo[];
};

const WEAPON_LABEL: Record<string, string> = {
  greatsword: "대검",
  sword_shield: "검+방패",
  rapier: "세검",
  tonfa: "봉권",
  gauntlet: "권갑",
  claw: "권조",
  staff: "지팡이",
  relic: "성물",
  spellblade: "마검",
  bow: "활",
  dagger: "단검",
  needle: "독침",
};

export function V2SpecPanel({
  spec,
  onChanged,
}: {
  spec: V2SpecState;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const post = useCallback(
    async (body: { specId?: string; passiveId?: string }, okMsg: string) => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/spec", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          error?: string;
        } | null;
        if (!j?.ok) {
          const label =
            j?.error === "tier_too_low"
              ? "2차 전직 후 가능"
              : j?.error === "spec_locked"
                ? "이미 다른 계파 선택 (신전 초기화로만 변경)"
                : j?.error === "no_picks_left"
                  ? "이번 차수 픽을 모두 썼어요 (다음 전직에 해금)"
                  : j?.error === "no_spec"
                    ? "계파를 먼저 선택하세요"
                    : (j?.error ?? `http ${res.status}`);
          setMsg(`✗ ${label}`);
          return;
        }
        setMsg(`✓ ${okMsg}`);
        onChanged();
      } catch (e) {
        setMsg(`✗ ${(e as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [onChanged],
  );

  const resetSpec = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/temple-reset", { method: "POST" });
      const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
      if (!j?.ok) {
        setMsg(`✗ http ${res.status}`);
        return;
      }
      setMsg("✓ 계파 초기화 완료 — 다시 고를 수 있어요");
      onChanged();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [onChanged]);

  // 2차 미만 — 계파 잠금 안내.
  if (!spec.available) {
    return (
      <Card padding="md">
        <h2 className="text-sm font-semibold">계파</h2>
        <p className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
          2차 전직 후 계파를 선택할 수 있어요. (현재 {spec.tier}차)
        </p>
      </Card>
    );
  }

  const chosen = spec.specs.find((s) => s.id === spec.choice) ?? null;
  const picksLeft = Math.max(0, spec.picksMax - spec.picksUsed);
  const unlockedSet = new Set(spec.unlocked);

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">계파</h2>
        {chosen && (
          <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
            남은 픽{" "}
            <strong
              className={
                picksLeft > 0
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-zinc-400"
              }
            >
              {picksLeft}
            </strong>
          </span>
        )}
      </div>

      {!chosen ? (
        // 계파 선택 — job 의 계파 카드들.
        <div className="mt-2 space-y-2">
          <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
            계파를 하나 고르세요. 선택 후엔 신전 초기화로만 바꿀 수 있어요.
          </p>
          {spec.specs.map((s) => (
            <div
              key={s.id}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-semibold">{s.name}</span>
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  무기 {WEAPON_LABEL[s.requiredWeaponType] ?? s.requiredWeaponType}
                </span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {s.passives.map((p) => (
                  <li
                    key={p.id}
                    className="text-[11px] text-zinc-500 dark:text-zinc-400"
                  >
                    · {p.name} — {p.desc}
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => post({ specId: s.id }, `${s.name} 선택`)}
                disabled={busy}
                className="mt-2 w-full rounded-md border border-sky-400 bg-sky-500/10 px-3 py-1.5 text-xs font-medium text-sky-700 transition hover:bg-sky-500/20 disabled:opacity-50 dark:border-sky-400 dark:text-sky-300"
              >
                {busy ? "…" : `${s.name} 선택`}
              </button>
            </div>
          ))}
        </div>
      ) : (
        // 선택된 계파 — 3패시브 키트 + 픽 버튼.
        <div className="mt-2">
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{chosen.name}</span>
            <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
              무기{" "}
              {WEAPON_LABEL[chosen.requiredWeaponType] ??
                chosen.requiredWeaponType}{" "}
              착용 시 발동
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {chosen.passives.map((p) => {
              const isUnlocked = unlockedSet.has(p.id);
              return (
                <li
                  key={p.id}
                  className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${
                    isUnlocked
                      ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/40"
                      : "border-zinc-200 bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900"
                  }`}
                >
                  <div className="min-w-0">
                    <span className="text-sm font-medium">{p.name}</span>
                    <span className="ml-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {p.desc}
                    </span>
                  </div>
                  {isUnlocked ? (
                    <span className="shrink-0 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                      ✓ 해금
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => post({ passiveId: p.id }, `${p.name} 해금`)}
                      disabled={busy || picksLeft <= 0}
                      className="shrink-0 rounded-md border border-emerald-500 bg-emerald-500/15 px-2.5 py-1 text-xs font-medium text-emerald-700 transition hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-400 dark:text-emerald-300"
                    >
                      해금
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={resetSpec}
            disabled={busy}
            className="mt-2.5 text-[11px] text-zinc-400 underline-offset-2 transition hover:text-rose-500 hover:underline disabled:opacity-50 dark:text-zinc-500"
          >
            계파 초기화 (테스트 기간 무료)
          </button>
        </div>
      )}

      {msg && (
        <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">{msg}</p>
      )}
    </Card>
  );
}
